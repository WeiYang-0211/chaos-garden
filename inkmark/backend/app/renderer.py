from __future__ import annotations

from dataclasses import dataclass
import math
from pathlib import Path
import random

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

from .catalog import PaperSpec
from .fonts import registry
from .layout import Glyph, PageLayout
from .papers import get_desk_background, get_sheet_background, sheet_box_for, sheet_size_for


@dataclass
class RenderOptions:
    font_id: str
    ink: str = "#1f1e1b"
    watermark: bool = False
    jpeg_quality: int = 92


def _rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    if len(value) == 3:
        value = "".join(char * 2 for char in value)
    try:
        return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))
    except ValueError:
        return (31, 30, 27)


def _warp_mask(mask: Image.Image, amount: float, phase: float, size: int) -> Image.Image:
    if amount <= 0.01:
        return mask
    array = np.asarray(mask, dtype=np.uint8)
    height, width = array.shape
    amplitude = max(0.6, size * 0.055 * amount)
    output = np.zeros_like(array)
    for y in range(height):
        shift = int(
            amplitude * math.sin(y * 0.16 + phase)
            + amplitude * 0.35 * math.sin(y * 0.47 + phase * 1.7)
        )
        if shift > 0:
            output[y, shift:] = array[y, : width - shift]
        elif shift < 0:
            output[y, : width + shift] = array[y, -shift:]
        else:
            output[y] = array[y]
    return Image.fromarray(output, "L")


def _make_mask(
    char: str,
    font,
    px: int,
    angle: float,
    warp: float,
    phase: float,
) -> tuple[Image.Image, int, int]:
    ascent, descent = font.getmetrics()
    advance = max(1.0, font.getlength(char))
    pad = max(4, int(px * 0.62))
    tile_w = max(2, int(advance) + pad * 2)
    tile_h = max(2, ascent + descent + pad * 2)
    mask = Image.new("L", (tile_w, tile_h), 0)
    draw = ImageDraw.Draw(mask)
    draw.text((pad, pad + ascent), char, font=font, fill=255, anchor="ls")
    if warp > 0.015:
        mask = _warp_mask(mask, warp, phase, px)
    if abs(angle) > 0.05:
        mask = mask.rotate(angle, resample=Image.Resampling.BICUBIC, expand=False)
    if px >= 28:
        mask = mask.filter(ImageFilter.GaussianBlur(max(0.2, px * 0.006 * (0.5 + warp))))
    return mask, pad, ascent


def _draw_scribble(
    draw: ImageDraw.ImageDraw,
    glyph: Glyph,
    px: float,
    ink: tuple[int, int, int],
    scale: float,
    advance: float,
) -> None:
    rng = random.Random(f"{glyph.seed}:{glyph.phase}:scribble")
    cx = (glyph.x + advance * 0.45) * scale
    cy = glyph.y * scale - px * 0.30
    width = max(1, int(px * 0.035))
    alpha = rng.randint(150, 205)
    color = (*ink, alpha)
    style = rng.choice(("cross", "cross", "loop", "zigzag"))
    span_x = advance * scale * rng.uniform(0.55, 0.9)
    span_y = px * scale * rng.uniform(0.25, 0.42)

    if style == "cross":
        draw.line((cx - span_x, cy - span_y * 0.25, cx + span_x, cy + span_y * 0.18), fill=color, width=width)
        draw.line((cx - span_x * 0.7, cy + span_y * 0.45, cx + span_x * 0.75, cy - span_y * 0.4), fill=color, width=width)
    elif style == "loop":
        draw.ellipse(
            (cx - span_x * 0.8, cy - span_y * 0.9, cx + span_x * 0.8, cy + span_y * 0.9),
            outline=color,
            width=width,
        )
        draw.line((cx - span_x, cy + span_y * 0.6, cx + span_x, cy - span_y * 0.5), fill=color, width=width)
    else:
        points = []
        for step in range(7):
            points.append(
                (
                    cx - span_x + (span_x * 2) * step / 6,
                    cy + rng.uniform(-span_y, span_y),
                )
            )
        draw.line(points, fill=color, width=width, joint="curve")


def _watermark(page: Image.Image) -> Image.Image:
    width, height = page.size
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    tile_w, tile_h = max(360, int(width * 0.32)), max(160, int(width * 0.14))
    tile = Image.new("RGBA", (tile_w, tile_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tile)
    try:
        font = registry.font("wenkai", max(18, int(width * 0.020)))
    except Exception:
        font = None
    text = "手迹 · 预览"
    if font is not None:
        bbox = draw.textbbox((0, 0), text, font=font)
        draw.text(
            ((tile_w - (bbox[2] - bbox[0])) / 2, (tile_h - (bbox[3] - bbox[1])) / 2 - bbox[1]),
            text,
            font=font,
            fill=(91, 77, 62, 34),
        )
    tile = tile.rotate(-28, resample=Image.Resampling.BICUBIC, expand=False)
    for y in range(-tile_h, height + tile_h, tile_h):
        for x in range(-tile_w, width + tile_w, tile_w):
            overlay.alpha_composite(tile, (x, y))

    # Corner badge.
    badge_w, badge_h = int(width * 0.17), int(height * 0.032)
    bx, by = width - badge_w - int(width * 0.035), height - badge_h - int(height * 0.035)
    badge = Image.new("RGBA", (badge_w, badge_h), (0, 0, 0, 0))
    bd = ImageDraw.Draw(badge)
    bd.rounded_rectangle(
        (0, 0, badge_w - 1, badge_h - 1),
        radius=max(4, badge_h // 2),
        fill=(43, 38, 32, 145),
    )
    if font is not None:
        small = registry.font("wenkai", max(12, int(badge_h * 0.42)))
        label = "预览版 · 下载后无水印"
        bbox = bd.textbbox((0, 0), label, font=small)
        bd.text(
            ((badge_w - (bbox[2] - bbox[0])) / 2, (badge_h - (bbox[3] - bbox[1])) / 2 - bbox[1]),
            label,
            font=small,
            fill=(245, 238, 224, 230),
        )
    overlay.alpha_composite(badge, (bx, by))
    return Image.alpha_composite(page.convert("RGBA"), overlay).convert("RGB")


def render_page(
    page: PageLayout,
    paper: PaperSpec,
    options: RenderOptions,
    scale: float,
) -> Image.Image:
    out_w = max(2, int(round(page.width * scale)))
    out_h = max(2, int(round(page.height * scale)))
    sheet_w = max(2, int(round(page.sheet_width * scale)))
    sheet_h = max(2, int(round(page.sheet_height * scale)))

    sheet = get_sheet_background(paper, sheet_w, sheet_h)
    ink = _rgb(options.ink)
    scribbles = Image.new("RGBA", (sheet_w, sheet_h), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(scribbles)

    for glyph in page.glyphs:
        px = max(7, int(round(glyph.size * scale)))
        if px < 6:
            continue
        try:
            font = registry.font(options.font_id, px)
        except Exception:
            continue
        advance = font.getlength(glyph.ch)
        mask, pad, ascent = _make_mask(
            glyph.ch,
            font,
            px,
            glyph.angle,
            glyph.warp,
            glyph.phase,
        )
        if glyph.alpha < 0.999:
            mask = mask.point(lambda value: int(value * glyph.alpha))
        colored = Image.new("RGBA", mask.size, (*ink, 255))
        colored.putalpha(mask)
        x = int(round(glyph.x * scale)) - pad
        y = int(round(glyph.y * scale)) - (pad + ascent)
        sheet.paste(colored, (x, y), colored)
        if glyph.scribble:
            _draw_scribble(sdraw, glyph, px, ink, scale, advance)

    if page.glyphs:
        sheet = Image.alpha_composite(sheet.convert("RGBA"), scribbles).convert("RGB")

    if paper.photo:
        canvas = get_desk_background(paper, out_w, out_h)
        # Give the loose sheet a rounded corner and a soft drop shadow.
        radius = max(3, int(sheet_w * 0.006))
        alpha = Image.new("L", (sheet_w, sheet_h), 0)
        ImageDraw.Draw(alpha).rounded_rectangle((0, 0, sheet_w - 1, sheet_h - 1), radius=radius, fill=255)
        sheet_rgba = sheet.convert("RGBA")
        sheet_rgba.putalpha(alpha)
        rotated = sheet_rgba.rotate(
            paper.sheet_rotation,
            resample=Image.Resampling.BICUBIC,
            expand=True,
        )
        shadow = Image.new("RGBA", rotated.size, (0, 0, 0, 0))
        shadow.putalpha(rotated.getchannel("A").point(lambda value: int(value * 0.55)))
        shadow = shadow.filter(ImageFilter.GaussianBlur(max(2, int(out_w * 0.010))))
        sx = (out_w - rotated.width) // 2
        sy = (out_h - rotated.height) // 2
        shadow_canvas = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))
        shadow_canvas.alpha_composite(
            shadow,
            (sx + max(2, int(out_w * 0.006)), sy + max(3, int(out_w * 0.010))),
        )
        canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow_canvas).convert("RGB")
        canvas.paste(rotated, (sx, sy), rotated)
        out = canvas
    else:
        out = sheet

    if options.watermark:
        out = _watermark(out)
    return out


def _offset_alpha(image: Image.Image, dx: int, dy: int) -> Image.Image:
    canvas = Image.new("RGBA", image.size, (0, 0, 0, 0))
    canvas.alpha_composite(image, (dx, dy))
    return canvas


def render_preview_pages(
    layout,
    paper: PaperSpec,
    options: RenderOptions,
    preview_width: int,
    output_dir: Path,
    progress=None,
) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    page_count = len(layout.pages)
    for index, page in enumerate(layout.pages):
        scale = preview_width / page.width
        image = render_page(page, paper, options, scale)
        path = output_dir / f"page-{index + 1}.jpg"
        image.save(path, "JPEG", quality=88, optimize=True, progressive=True)
        paths.append(path)
        if progress:
            progress(index + 1, page_count)
    return paths


def render_export_pages(
    layout,
    paper: PaperSpec,
    options: RenderOptions,
    dpi: int,
    output_dir: Path,
    image_format: str = "jpg",
    progress=None,
) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    scale = dpi / 300.0
    paths: list[Path] = []
    page_count = len(layout.pages)
    for index, page in enumerate(layout.pages):
        image = render_page(page, paper, options, scale)
        if image_format == "png":
            path = output_dir / f"page-{index + 1:02d}.png"
            image.save(path, "PNG", optimize=True, dpi=(dpi, dpi))
        else:
            path = output_dir / f"page-{index + 1:02d}.jpg"
            image.save(
                path,
                "JPEG",
                quality=94,
                optimize=True,
                progressive=True,
                subsampling=0,
                dpi=(dpi, dpi),
            )
        paths.append(path)
        if progress:
            progress(index + 1, page_count)
    return paths
