from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import threading

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

from .catalog import FONTS, FontSpec, get_font
from .config import CACHE_DIR, FONT_DIR


class FontRegistry:
    def __init__(self, cache_dir: Path = CACHE_DIR):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._cmaps: dict[str, set[int]] = {}
        self._lock = threading.RLock()

    def _cmap(self, font_id: str) -> set[int]:
        with self._lock:
            if font_id in self._cmaps:
                return self._cmaps[font_id]
            spec = get_font(font_id)
            cmap: set[int] = set()
            try:
                tt = TTFont(str(spec.path), fontNumber=0, lazy=True)
                best = tt.getBestCmap() or {}
                cmap = set(best.keys())
                tt.close()
            except Exception:
                cmap = set()
            self._cmaps[font_id] = cmap
            return cmap

    def supports(self, font_id: str, char: str) -> bool:
        if not char:
            return True
        if char.isspace():
            return True
        cmap = self._cmap(font_id)
        if not cmap:
            return True
        return ord(char) in cmap

    def missing_chars(self, font_id: str, text: str) -> list[str]:
        seen: set[str] = set()
        missing: list[str] = []
        for char in text:
            if char in seen or char.isspace():
                continue
            seen.add(char)
            if not self.supports(font_id, char):
                missing.append(char)
        return missing

    def font(self, font_id: str, size: int) -> ImageFont.FreeTypeFont:
        spec = get_font(font_id)
        return ImageFont.truetype(str(spec.path), max(8, int(size)))

    def sample_path(self, font_id: str) -> Path:
        spec = get_font(font_id)
        path = self.cache_dir / f"font-{font_id}.png"
        try:
            if path.exists() and path.stat().st_mtime >= spec.path.stat().st_mtime:
                return path
        except OSError:
            pass
        self._render_sample(spec, path)
        return path

    def _render_sample(self, spec: FontSpec, path: Path) -> None:
        width, height = 760, 220
        img = Image.new("RGB", (width, height), "#fbf7ee")
        draw = ImageDraw.Draw(img)
        # Very light paper wash, so the sample doesn't look like a flat swatch.
        for y in range(height):
            ratio = y / max(1, height - 1)
            color = (
                int(251 - 5 * ratio),
                int(247 - 4 * ratio),
                int(238 - 3 * ratio),
            )
            draw.line((0, y, width, y), fill=color)
        try:
            big = self.font(spec.id, 62)
            small = self.font(spec.id, 27)
            micro = self.font(spec.id, 20)
        except Exception:
            return
        primary = "落筆生花  手寫" if spec.id == "chenyuluoyan" else "落笔生花  手写"
        draw.text((38, 48), primary, font=big, fill="#24221f")
        draw.text((41, 130), "山有木兮木有枝，心悦君兮君不知。", font=small, fill="#3b3832")
        draw.text((545, 46), "Aa 2026", font=micro, fill="#8b8174")
        draw.line((38, 186, width - 38, 186), fill="#ddd2c1", width=1)
        draw.text((40, 193), "INKMARK · HANDWRITING SAMPLE", font=micro, fill="#948878")
        img.save(path, "PNG", optimize=True)


registry = FontRegistry()


@lru_cache(maxsize=2048)
def cached_font(font_id: str, size: int) -> ImageFont.FreeTypeFont:
    return registry.font(font_id, size)


def available_fonts() -> list[FontSpec]:
    return [font for font in FONTS if font.path.exists()]


def font_status() -> dict[str, bool]:
    return {font.id: font.path.exists() for font in FONTS}
