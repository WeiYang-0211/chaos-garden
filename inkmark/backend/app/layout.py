from __future__ import annotations

from dataclasses import dataclass, asdict, field
import math
import random
import re
from typing import Any

from PIL import ImageFont

from .catalog import PaperSpec, get_font, get_paper
from .fonts import registry
from .config import MAX_PAGES

# Characters that should not start a new line in Chinese typesetting.
CLOSING_PUNCT = set("，。！？；：、）》】」』”’…—,.!?;:)]}%")
OPENING_PUNCT = set("（《【「『“‘([{")
CJK_RANGES = (
    (0x3400, 0x4DBF),
    (0x4E00, 0x9FFF),
    (0xF900, 0xFAFF),
    (0x3040, 0x30FF),
    (0xAC00, 0xD7AF),
    (0x3000, 0x303F),
)


def is_cjk(char: str) -> bool:
    code = ord(char)
    return any(start <= code <= end for start, end in CJK_RANGES)


@dataclass
class Glyph:
    ch: str
    x: float
    y: float
    size: float
    angle: float
    alpha: float
    warp: float
    phase: float
    scribble: bool
    seed: int
    line: int


@dataclass
class Line:
    page: int
    index: int
    text: str
    x0: float
    x1: float
    top: float
    baseline: float


@dataclass
class PageLayout:
    index: int
    width: int
    height: int
    sheet_width: int
    sheet_height: int
    sheet_box: tuple[int, int, int, int]
    glyphs: list[Glyph] = field(default_factory=list)
    lines: list[Line] = field(default_factory=list)


@dataclass
class LayoutResult:
    pages: list[PageLayout]
    font_id: str
    paper_id: str
    settings: dict[str, Any]
    seed: int
    char_count: int
    missing: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "pages": [asdict(page) for page in self.pages],
            "font_id": self.font_id,
            "paper_id": self.paper_id,
            "settings": self.settings,
            "seed": self.seed,
            "char_count": self.char_count,
            "missing": self.missing,
            "warnings": self.warnings,
        }


@dataclass
class Geometry:
    page_w: int
    page_h: int
    sheet_w: int
    sheet_h: int
    sheet_box: tuple[int, int, int, int]
    left: float
    right: float
    top: float
    bottom: float
    font_size: float
    line_height: float
    max_lines: int
    grid: bool


@dataclass
class Token:
    text: str
    width: float
    kind: str


class TextLayoutEngine:
    def __init__(
        self,
        text: str,
        font_id: str,
        paper_id: str,
        settings: dict[str, Any],
        seed: int,
    ):
        self.text = text
        self.font_id = font_id
        self.font_spec = get_font(font_id)
        self.paper: PaperSpec = get_paper(paper_id)
        self.settings = settings
        self.seed = int(seed)
        self.width = 2480 if not self.paper.photo else 2400
        self.height = 3508 if not self.paper.photo else 3200
        if self.paper.photo:
            self.sheet_w = int(round(self.width * self.paper.sheet_scale))
            self.sheet_h = int(round(self.sheet_w / self.paper.sheet_ratio))
            self.sheet_box = (
                (self.width - self.sheet_w) // 2,
                (self.height - self.sheet_h) // 2,
                self.sheet_w,
                self.sheet_h,
            )
        else:
            self.sheet_w = self.width
            self.sheet_h = self.height
            self.sheet_box = (0, 0, self.width, self.height)
        self.geometry = self._geometry()
        self._font_cache: dict[int, ImageFont.FreeTypeFont] = {}
        self._missing: set[str] = set()
        self._warnings: list[str] = []

    def _geometry(self) -> Geometry:
        paper = self.paper
        sheet_w, sheet_h = self.sheet_w, self.sheet_h
        left = paper.margin_x * sheet_w
        right = sheet_w - paper.margin_x * sheet_w
        top = paper.margin_top * sheet_h
        bottom = sheet_h * (1 - paper.margin_bottom)
        font_scale = float(self.settings.get("font_size", 1.0))
        user_line = float(self.settings.get("line_spacing", 1.0))

        if paper.cols:
            # A grid is square-cell based. Widths are the limiting dimension;
            # rows are centered vertically if the block is shorter than the page.
            content_width = right - left
            cell = content_width / paper.cols
            font_size = cell * 0.90 * font_scale
            line_height = cell * max(0.82, min(1.4, user_line))
            rows = paper.rows or int((bottom - top) // cell)
            block_height = rows * line_height
            if block_height < bottom - top:
                top = max(top, (sheet_h - block_height) / 2)
            bottom = min(sheet_h - paper.margin_bottom * sheet_h, top + block_height)
            max_lines = rows
            return Geometry(
                page_w=self.width,
                page_h=self.height,
                sheet_w=sheet_w,
                sheet_h=sheet_h,
                sheet_box=self.sheet_box,
                left=left,
                right=right,
                top=top,
                bottom=bottom,
                font_size=font_size,
                line_height=line_height,
                max_lines=max_lines,
                grid=True,
            )

        font_size = sheet_w * paper.font_ratio * font_scale
        line_height = font_size * paper.line_spacing * user_line
        max_lines = max(1, int((bottom - top) // line_height))
        return Geometry(
            page_w=self.width,
            page_h=self.height,
            sheet_w=sheet_w,
            sheet_h=sheet_h,
            sheet_box=self.sheet_box,
            left=left,
            right=right,
            top=top,
            bottom=bottom,
            font_size=font_size,
            line_height=line_height,
            max_lines=max_lines,
            grid=False,
        )

    def _font(self, size: int) -> ImageFont.FreeTypeFont:
        size = max(8, int(round(size)))
        if size not in self._font_cache:
            self._font_cache[size] = registry.font(self.font_id, size)
        return self._font_cache[size]

    def _advance(self, text: str, size: float) -> float:
        if not text:
            return 0.0
        if text.isspace():
            return self._font(int(size)).getlength(" ")
        # Unsupported glyphs are left blank, but must still occupy a cell.
        if len(text) == 1 and not registry.supports(self.font_id, text):
            self._missing.add(text)
            return size * 0.5
        return self._font(int(size)).getlength(text)

    def _tokenize(self, paragraph: str) -> list[Token]:
        tokens: list[Token] = []
        size = self.geometry.font_size
        buffer = ""

        def flush_buffer():
            nonlocal buffer
            if buffer:
                tokens.append(Token(buffer, self._advance(buffer, size), "word"))
                buffer = ""

        for char in paragraph:
            if char == "\t":
                flush_buffer()
                tokens.append(Token("　　", self._advance("　　", size), "space"))
            elif char == " ":
                flush_buffer()
                tokens.append(Token(" ", self._advance(" ", size), "space"))
            elif char == "　":
                flush_buffer()
                tokens.append(Token("　", self._advance("　", size), "space"))
            elif is_cjk(char) or char in CLOSING_PUNCT or char in OPENING_PUNCT:
                flush_buffer()
                tokens.append(Token(char, self._advance(char, size), "cjk"))
            elif char.isalnum() or char in "-_'’":
                buffer += char
            else:
                flush_buffer()
                tokens.append(Token(char, self._advance(char, size), "other"))
        flush_buffer()
        return tokens

    def _split_long_token(self, token: Token, available: float) -> tuple[Token, Token] | None:
        if token.kind != "word" or token.width <= available or len(token.text) <= 1:
            return None
        size = self.geometry.font_size
        head = ""
        width = 0.0
        for char in token.text:
            char_width = self._advance(char, size)
            if head and width + char_width > available:
                break
            head += char
            width += char_width
        if not head or head == token.text:
            return None
        tail = token.text[len(head):]
        return (
            Token(head, self._advance(head, size), "word"),
            Token(tail, self._advance(tail, size), "word"),
        )

    def _wrap_paragraph(self, paragraph: str, first_line_indent: bool) -> list[list[Token]]:
        tokens = self._tokenize(paragraph)
        if not tokens:
            return [[]]
        geom = self.geometry
        grid = bool(geom.grid and self.paper.cols)
        cell = (geom.right - geom.left) / self.paper.cols if grid else geom.font_size
        max_units = self.paper.cols if grid else None
        lines: list[list[Token]] = []
        current: list[Token] = []
        x = geom.left + (geom.font_size * self.paper.indent if first_line_indent else 0)
        units = 0.0

        def token_units(token: Token) -> float:
            if max_units is None:
                return 0.0
            if token.kind == "word":
                return max(1.0, math.ceil(token.width / max(1.0, cell)))
            return float(len(token.text))

        def new_line():
            nonlocal current, x, units
            while current and current[-1].kind == "space":
                current.pop()
            lines.append(current)
            current = []
            x = geom.left
            units = 0.0

        index = 0
        while index < len(tokens):
            token = tokens[index]
            if token.kind == "space" and not current:
                index += 1
                continue
            token_unit = token_units(token)
            fits_units = max_units is None or units + token_unit <= max_units + 0.001
            fits_width = x + token.width <= geom.right + 0.01
            if fits_units and fits_width:
                current.append(token)
                x += token.width
                units += token_unit
                index += 1
                continue

            # Closing punctuation may hang slightly into the margin, which is
            # standard Chinese typesetting practice. It may also use the one
            # spare cell beside a full grid line rather than starting a line.
            if current and token.text and token.text[0] in CLOSING_PUNCT:
                overflow = x + token.width - geom.right
                spare_cell = max_units is None or units <= max_units
                if spare_cell and overflow <= geom.font_size * 0.9:
                    current.append(token)
                    x += token.width
                    units += token_unit
                    index += 1
                    continue

            # Never leave an opening punctuation mark at the end of a line.
            if current and current[-1].text and current[-1].text[-1] in OPENING_PUNCT:
                carry = current.pop()
                units = max(0.0, units - token_units(carry))
                new_line()
                current.append(carry)
                x += carry.width
                units += token_units(carry)
                continue

            split = self._split_long_token(token, max(1.0, geom.right - geom.left))
            if split and not current:
                head, tail = split
                current.append(head)
                x += head.width
                units += token_units(head)
                new_line()
                tokens[index] = tail
                continue

            if current:
                new_line()
                continue

            # A single token wider than the content area (a very long URL, for
            # example). Put it down and let it hang rather than looping forever.
            current.append(token)
            x += token.width
            units += token_unit
            index += 1

        new_line()
        return lines

    def _new_page(self) -> PageLayout:
        page = PageLayout(
            index=len(self.pages),
            width=self.width,
            height=self.height,
            sheet_width=self.sheet_w,
            sheet_height=self.sheet_h,
            sheet_box=self.sheet_box,
        )
        self.pages.append(page)
        return page

    def build(self) -> LayoutResult:
        self.pages: list[PageLayout] = []
        page = self._new_page()
        geom = self.geometry
        line_cursor = 0.0
        page_line_count = 0
        global_index = 0
        char_count = 0
        truncated = False

        segments = self.text.split("\n")
        for paragraph_index, paragraph in enumerate(segments):
            paragraph = paragraph.rstrip()
            if not paragraph.strip():
                line_cursor += 0.72
                continue
            wrapped = self._wrap_paragraph(paragraph, first_line_indent=bool(self.paper.indent))
            for line_tokens in wrapped:
                if page_line_count >= geom.max_lines:
                    page = self._new_page()
                    line_cursor = 0.0
                    page_line_count = 0
                    if len(self.pages) > MAX_PAGES:
                        truncated = True
                        break
                line_top = geom.top + line_cursor * geom.line_height
                baseline = line_top + geom.line_height * 0.5
                # Center using the actual ascent/descent where possible.
                try:
                    font = self._font(int(geom.font_size))
                    ascent, descent = font.getmetrics()
                    baseline = line_top + (geom.line_height - (ascent + descent)) / 2 + ascent
                except Exception:
                    pass

                line_rng = random.Random(f"{self.seed}:line:{page.index}:{page_line_count}")
                line_drift = line_rng.gauss(0, 0.006 * self.settings.get("messiness", 0) / 100 * geom.font_size)
                x = geom.left
                line_text = ""
                line_x0 = None
                line_x1 = None
                cell_cursor = 0.0
                cell_width = (geom.right - geom.left) / self.paper.cols if self.paper.cols else 0.0
                for token in line_tokens:
                    if not token.text:
                        continue
                    # A token can contain multiple Latin characters; draw each
                    # char with its own subtle variation while preserving kerning.
                    for offset, char in enumerate(token.text):
                        if char == " ":
                            space_width = self._advance(" ", geom.font_size)
                            x += space_width
                            if geom.grid and cell_width:
                                cell_cursor += 1.0
                            continue
                        if not registry.supports(self.font_id, char):
                            self._missing.add(char)
                            missing_width = geom.font_size * 0.5
                            x += missing_width
                            if geom.grid and cell_width:
                                cell_cursor += max(0.5, missing_width / cell_width)
                            continue
                        char_width = self._advance(char, geom.font_size)
                        if char == "　":
                            x += char_width
                            if geom.grid and cell_width:
                                cell_cursor += 1.0
                            continue
                        glyph_rng = random.Random(
                            f"{self.seed}:glyph:{page.index}:{global_index}:{ord(char)}"
                        )
                        mess = float(self.settings.get("messiness", 0)) / 100
                        stroke = float(self.settings.get("stroke_random", 0)) / 100
                        slant = float(self.settings.get("slant", 0))
                        dx = glyph_rng.gauss(0, geom.font_size * (0.006 + 0.040 * mess))
                        dy = glyph_rng.gauss(0, geom.font_size * (0.004 + 0.026 * mess))
                        dx = max(-geom.font_size * 0.22, min(geom.font_size * 0.22, dx))
                        dy = max(-geom.line_height * 0.16, min(geom.line_height * 0.16, dy))
                        size = geom.font_size * (1 + glyph_rng.gauss(0, 0.025 + 0.030 * stroke))
                        angle = (
                            slant
                            + glyph_rng.gauss(0, 0.9 + 4.8 * mess)
                            + glyph_rng.gauss(0, 0.5 + 4.0 * stroke)
                        )
                        alpha = 0.88 + glyph_rng.random() * 0.12
                        scribble = glyph_rng.random() < float(self.settings.get("mistake_rate", 0)) / 100
                        if line_x0 is None:
                            line_x0 = x + dx
                        line_x1 = x + dx + char_width
                        draw_x = x
                        if geom.grid and cell_width:
                            if char.isascii():
                                cell_cursor += char_width / cell_width
                            else:
                                cell_index = int(math.ceil(cell_cursor - 1e-6))
                                cell_left = geom.left + cell_index * cell_width
                                draw_x = cell_left + max(0.0, (cell_width - char_width) / 2)
                                cell_cursor = cell_index + 1
                        page.glyphs.append(
                            Glyph(
                                ch=char,
                                x=draw_x + dx,
                                y=baseline + dy + line_drift,
                                size=size,
                                angle=angle,
                                alpha=alpha,
                                warp=stroke,
                                phase=glyph_rng.random() * math.tau,
                                scribble=scribble,
                                seed=global_index,
                                line=page_line_count,
                            )
                        )
                        line_text += char
                        global_index += 1
                        char_count += 1
                        x = draw_x + char_width
                if line_text:
                    page.lines.append(
                        Line(
                            page=page.index,
                            index=page_line_count,
                            text=line_text,
                            x0=line_x0 or geom.left,
                            x1=line_x1 or geom.left,
                            top=line_top,
                            baseline=baseline,
                        )
                    )
                page_line_count += 1
                line_cursor += 1.0
            else:
                # Paragraph spacing; don't add it after the final paragraph.
                if paragraph_index < len(segments) - 1:
                    line_cursor += 0.48
                continue
            break

        if not self.pages:
            self._new_page()

        if truncated:
            self._warnings.append(f"内容超过 {MAX_PAGES} 页，已截断到第 {MAX_PAGES} 页。")
        if self._missing:
            chars = "".join(sorted(self._missing))
            if len(chars) > 40:
                chars = chars[:40] + "…"
            self._warnings.append(f"当前字体缺少 {len(self._missing)} 个字形：{chars}（已留空）。")

        # The MAX_PAGES check above may create a page 13; trim it.
        if len(self.pages) > MAX_PAGES:
            self.pages = self.pages[:MAX_PAGES]
            truncated = True
            if not any("已截断" in warning for warning in self._warnings):
                self._warnings.append(f"内容超过 {MAX_PAGES} 页，已截断到第 {MAX_PAGES} 页。")

        return LayoutResult(
            pages=self.pages,
            font_id=self.font_id,
            paper_id=self.paper.id,
            settings=self.settings,
            seed=self.seed,
            char_count=char_count,
            missing=sorted(self._missing),
            warnings=self._warnings,
        )


def build_layout(
    text: str,
    font_id: str,
    paper_id: str,
    settings: dict[str, Any],
    seed: int,
) -> LayoutResult:
    return TextLayoutEngine(text, font_id, paper_id, settings, seed).build()
