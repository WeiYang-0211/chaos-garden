from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

from .catalog import PaperSpec, get_paper
from .config import CACHE_DIR
from .fonts import registry

CANONICAL_SHEET = {
    "notebook": (1920, 2715),
    "letter": (1920, 2715),
    "grid_red": (2480, 3508),
    "grid_black": (2480, 3508),
    "ruled_red": (2480, 3508),
    "ruled_blue": (2480, 3508),
    "blank": (2480, 3508),
    "exam": (2480, 3508),
    "kraft": (2480, 3508),
    "vintage": (2480, 3508),
    "dotgrid": (2480, 3508),
}

PAGE_SIZES = {
    "notebook": (2400, 3200),
    "letter": (2400, 3200),
}


def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


def _lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _paper_texture(width: int, height: int, base: tuple[int, int, int], seed: int, warm: bool) -> Image.Image:
    rng = np.random.default_rng(seed)
    # Generate the expensive noise at a lower resolution, then upscale.
    nw, nh = max(8, width // 3), max(8, height // 3)
    coarse = rng.normal(0, 1, (nh, nw)).astype(np.float32)
    fine = rng.normal(0, 1, (nh, nw)).astype(np.float32)
    coarse_img = Image.fromarray(np.uint8(np.clip(coarse * 40 + 128, 0, 255)), "L").filter(
        ImageFilter.GaussianBlur(2.0)
    ).resize((width, height), Image.Resampling.BICUBIC)
    fine_img = Image.fromarray(np.uint8(np.clip(fine * 35 + 128, 0, 255)), "L").resize(
        (width, height), Image.Resampling.BILINEAR
    )
    coarse_arr = np.asarray(coarse_img, dtype=np.int16) - 128
    fine_arr = np.asarray(fine_img, dtype=np.int16) - 128

    yy, xx = np.mgrid[0:height, 0:width]
    gradient = np.linspace(-1.0, 1.0, height, dtype=np.float32)[:, None] * np.ones((1, width), dtype=np.float32)
    edge_x = np.abs(np.linspace(-1.0, 1.0, width, dtype=np.float32))[None, :]
    edge_y = np.abs(np.linspace(-1.0, 1.0, height, dtype=np.float32))[:, None]
    vignette = np.clip(1.0 - 0.055 * (edge_x ** 2 + edge_y ** 2), 0.86, 1.0)

    base_arr = np.zeros((height, width, 3), dtype=np.float32)
    for i in range(3):
        base_arr[:, :, i] = base[i]
    base_arr += gradient[:, :, None] * (2.5 if warm else 1.2)
    base_arr += coarse_arr[:, :, None] * 0.20
    base_arr += fine_arr[:, :, None] * 0.07
    base_arr *= vignette[:, :, None]
    arr = np.clip(base_arr, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr, "RGB")

    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    fiber_rng = random.Random(seed + 17)
    for _ in range(max(80, width // 24)):
        x = fiber_rng.uniform(0, width)
        y = fiber_rng.uniform(0, height)
        length = fiber_rng.uniform(width * 0.006, width * 0.045)
        bend = fiber_rng.uniform(-width * 0.004, width * 0.004)
        color = (245, 239, 224, fiber_rng.randint(8, 18)) if warm else (80, 72, 60, fiber_rng.randint(5, 12))
        draw.line((x, y, x + length, y + bend), fill=color, width=max(1, width // 2200))
    overlay = overlay.filter(ImageFilter.GaussianBlur(max(0.3, width / 5000)))
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    return img


def _add_wood(width: int, height: int, seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    nw, nh = max(16, width // 4), max(16, height // 4)
    noise = rng.normal(0, 1, (nh, nw)).astype(np.float32)
    noise_img = Image.fromarray(np.uint8(np.clip(noise * 38 + 128, 0, 255)), "L").filter(
        ImageFilter.GaussianBlur(1.5)
    ).resize((width, height), Image.Resampling.BICUBIC)
    grain = (np.asarray(noise_img, dtype=np.float32) - 128) / 128.0
    yy = np.linspace(0, math.pi * 14, height, dtype=np.float32)[:, None]
    xx = np.linspace(0, math.pi * 3, width, dtype=np.float32)[None, :]
    wave = (np.sin(yy * 0.55 + xx * 0.12) * 0.5 + 0.5) * 0.10
    base = np.array([94, 62, 42], dtype=np.float32)
    plank = (np.sin(yy * 0.09) * 0.5 + 0.5) * 10
    arr = base[None, None, :] + (grain[:, :, None] * 18) + wave[:, :, None] * 30 + plank[:, :, None]
    # Plank seams.
    seam = np.zeros((height, width), dtype=np.float32)
    for y in range(0, height, max(180, height // 5)):
        seam[max(0, y - 2):min(height, y + 2), :] = -22
    arr += seam[:, :, None]
    arr *= (1.0 - 0.22 * np.abs(np.linspace(-1, 1, width, dtype=np.float32))[None, :, None])
    arr *= (1.0 - 0.30 * np.abs(np.linspace(-1, 1, height, dtype=np.float32))[:, None, None])
    return Image.fromarray(np.uint8(np.clip(arr, 0, 255)), "RGB").filter(ImageFilter.GaussianBlur(max(0.2, width / 6000)))


@lru_cache(maxsize=12)
def _base_path(paper_id: str) -> Path:
    paper = get_paper(paper_id)
    width, height = CANONICAL_SHEET[paper_id]
    path = CACHE_DIR / f"v1-{paper_id}-{width}x{height}.jpg"
    if not path.exists():
        seed = sum(ord(c) for c in paper_id) + 41
        base = hex_rgb(paper.paper_color)
        img = _paper_texture(width, height, base, seed, warm=paper.kind in {"vintage", "kraft", "letter", "notebook"})
        if paper.kind == "vintage":
            img = _vintage(img, seed)
        elif paper.kind == "kraft":
            img = _kraft(img, seed)
        img.save(path, "JPEG", quality=95, optimize=True)
    return path


@lru_cache(maxsize=4)
def _desk_path(paper_id: str) -> Path:
    paper = get_paper(paper_id)
    width, height = PAGE_SIZES[paper_id]
    path = CACHE_DIR / f"v1-{paper_id}-desk-{width}x{height}.jpg"
    if not path.exists():
        img = _add_wood(width, height, sum(ord(c) for c in paper_id) + 7)
        # A dark notebook/backing sheet under the loose page, to give the scene depth.
        overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        draw.rounded_rectangle(
            (int(width * 0.12), int(height * 0.07), int(width * 0.87), int(height * 0.93)),
            radius=int(width * 0.018),
            fill=(38, 27, 20, 205),
            outline=(24, 16, 11, 230),
            width=max(2, width // 900),
        )
        img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
        img = img.filter(ImageFilter.GaussianBlur(max(0.2, width / 7000)))
        img.save(path, "JPEG", quality=94, optimize=True)
    return path


def _vintage(img: Image.Image, seed: int) -> Image.Image:
    width, height = img.size
    rng = random.Random(seed + 3)
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for _ in range(9):
        cx = rng.uniform(0, width)
        cy = rng.uniform(0, height)
        rx = rng.uniform(width * 0.03, width * 0.15)
        ry = rng.uniform(height * 0.015, height * 0.08)
        alpha = rng.randint(4, 12)
        color = (112, 78, 43, alpha)
        draw.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=color)
    for _ in range(100):
        x = rng.uniform(0, width)
        y = rng.uniform(0, height)
        r = rng.uniform(0.5, 1.8)
        draw.ellipse((x, y, x + r, y + r), fill=(70, 48, 29, rng.randint(15, 35)))
    overlay = overlay.filter(ImageFilter.GaussianBlur(max(0.5, width / 2500)))
    out = Image.alpha_composite(img.convert("RGBA"), overlay)
    # Slight darker edges.
    edge = Image.new("L", (width, height), 0)
    ed = ImageDraw.Draw(edge)
    ed.rectangle((0, 0, width - 1, height - 1), outline=255, width=max(3, width // 120))
    edge = edge.filter(ImageFilter.GaussianBlur(max(2, width // 150)))
    dark = Image.new("RGBA", (width, height), (74, 49, 24, 0))
    dark.putalpha(edge.point(lambda value: min(18, value // 5)))
    return Image.alpha_composite(out, dark).convert("RGB")


def _kraft(img: Image.Image, seed: int) -> Image.Image:
    width, height = img.size
    rng = random.Random(seed + 11)
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for _ in range(180):
        x = rng.uniform(0, width)
        y = rng.uniform(0, height)
        length = rng.uniform(width * 0.008, width * 0.08)
        draw.line((x, y, x + length, y + rng.uniform(-3, 3)), fill=(90, 59, 30, rng.randint(10, 25)), width=1)
    # Folds.
    fold_x = int(width * 0.68)
    draw.line((fold_x, 0, fold_x - width * 0.02, height), fill=(255, 239, 207, 22), width=max(2, width // 900))
    overlay = overlay.filter(ImageFilter.GaussianBlur(max(0.4, width / 3500)))
    return Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")


def _sample_ink() -> tuple[int, int, int]:
    return 33, 31, 28


def _decorate_sheet(sheet: Image.Image, paper: PaperSpec, with_sample: bool = False) -> Image.Image:
    width, height = sheet.size
    scale = width / (1920 if paper.photo else 2480)
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    line_rgb = hex_rgb(paper.line_color)
    line_alpha = 190 if paper.photo else 155
    line_width = max(1, int(round(paper.line_width * width)))
    left = paper.margin_x * width
    right = width * (1 - paper.margin_x)
    top = paper.margin_top * height
    bottom = height * (1 - paper.margin_bottom)

    if paper.kind in {"grid", "notebook"} and paper.cols:
        content = right - left
        cell = content / paper.cols
        rows = paper.rows or int((bottom - top) // cell)
        block_h = rows * cell
        top = max(top, (height - block_h) / 2)
        for i in range(paper.cols + 1):
            x = left + i * cell
            draw.line((x, top, x, top + block_h), fill=(*line_rgb, line_alpha), width=line_width)
        for j in range(rows + 1):
            y = top + j * cell
            draw.line((left, y, left + content, y), fill=(*line_rgb, line_alpha), width=line_width)
        if paper.margin_line_color:
            margin_x = left + cell * 0.08
            draw.line((margin_x, top, margin_x, top + block_h), fill=(*hex_rgb(paper.margin_line_color), 170), width=max(1, line_width * 2))
    elif paper.kind in {"ruled", "letter", "kraft", "vintage"}:
        line_height = width * paper.font_ratio * paper.line_spacing
        y = top
        index = 0
        while y < bottom + line_height * 0.3:
            draw.line((left, y, right, y), fill=(*line_rgb, line_alpha if index % 5 else line_alpha + 16), width=line_width)
            y += line_height
            index += 1
        if paper.margin_line_color:
            margin_x = width * 0.075 if paper.photo else left - width * 0.018
            draw.line((margin_x, top, margin_x, bottom), fill=(*hex_rgb(paper.margin_line_color), 160), width=max(1, line_width * 2))
    elif paper.kind == "dotgrid":
        spacing = width * 0.032
        radius = max(1, width // 950)
        y = top
        while y < bottom:
            x = left
            while x < right:
                draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(*line_rgb, 115))
                x += spacing
            y += spacing
        if paper.margin_line_color:
            draw.line((left - width * 0.018, top, left - width * 0.018, bottom), fill=(*hex_rgb(paper.margin_line_color), 120), width=max(1, line_width * 2))
    elif paper.kind == "exam":
        header_h = height * 0.055
        draw.rectangle((left, top - header_h * 0.4, right, top + header_h * 0.45), outline=(*line_rgb, 145), width=line_width)
        header_font = registry.font("wenkai", max(14, int(width * 0.017)))
        draw.text((left + width * 0.015, top), "姓名：__________   班级：__________   学号：__________", font=header_font, fill=(*line_rgb, 190))
        line_height = width * paper.font_ratio * paper.line_spacing
        y = top + header_h
        while y < bottom:
            draw.line((left, y, right, y), fill=(*line_rgb, 125), width=line_width)
            y += line_height
        if paper.margin_line_color:
            draw.line((left - width * 0.018, top, left - width * 0.018, bottom), fill=(*hex_rgb(paper.margin_line_color), 120), width=max(1, line_width * 2))
    elif paper.kind == "blank":
        # Keep the paper almost empty; a faint deckle line and edge keep it from
        # looking like a flat color swatch.
        draw.line((left, top, right, top), fill=(*line_rgb, 24), width=1)

    if paper.photo:
        hole_count = 7 if paper.kind == "notebook" else 3
        hole_x = width * 0.058
        start_y = height * 0.14
        step_y = height * 0.10
        for i in range(hole_count):
            cy = start_y + i * step_y
            rx = width * 0.011
            ry = width * 0.011
            draw.ellipse((hole_x - rx - 2 * scale, cy - ry - 2 * scale, hole_x + rx + 2 * scale, cy + ry + 2 * scale), fill=(47, 38, 29, 200))
            draw.ellipse((hole_x - rx, cy - ry, hole_x + rx, cy + ry), fill=(25, 21, 17, 245))
            draw.arc((hole_x - rx * 0.8, cy - ry * 0.8, hole_x + rx * 0.8, cy + ry * 0.8), 200, 330, fill=(160, 145, 123, 120), width=max(1, width // 900))

    draw.rectangle((0, 0, width - 1, height - 1), outline=(70, 55, 40, 55 if paper.photo else 26), width=max(1, width // 900))
    sheet = Image.alpha_composite(sheet.convert("RGBA"), overlay).convert("RGB")

    if with_sample:
        try:
            sample_font = registry.font("xiaolai", max(12, int(width * (0.035 if paper.photo else 0.032))))
            small_font = registry.font("xiaolai", max(10, int(width * 0.021)))
        except Exception:
            sample_font = small_font = None
        if sample_font is not None:
            sample_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
            sd = ImageDraw.Draw(sample_layer)
            x = left + width * 0.015
            y = top + height * 0.035
            sd.text((x, y), "山有木兮木有枝", font=sample_font, fill=(*_sample_ink(), 220))
            sd.text((x, y + width * 0.055), "心悦君兮君不知", font=small_font, fill=(*_sample_ink(), 190))
            sheet = Image.alpha_composite(sheet.convert("RGBA"), sample_layer).convert("RGB")
    return sheet


def get_sheet_background(paper: PaperSpec, width: int, height: int, with_sample: bool = False) -> Image.Image:
    base = Image.open(_base_path(paper.id)).convert("RGB")
    if base.size != (width, height):
        base = base.resize((width, height), Image.Resampling.LANCZOS)
    return _decorate_sheet(base, paper, with_sample=with_sample)


def get_desk_background(paper: PaperSpec, width: int, height: int) -> Image.Image:
    base = Image.open(_desk_path(paper.id)).convert("RGB")
    if base.size != (width, height):
        base = base.resize((width, height), Image.Resampling.LANCZOS)
    return base


def paper_thumbnail(paper_id: str, width: int = 420) -> Path:
    paper = get_paper(paper_id)
    page_ratio = paper.ratio
    height = int(round(width / page_ratio))
    path = CACHE_DIR / f"thumb-{paper_id}-{width}.jpg"
    if path.exists():
        return path

    if paper.photo:
        page_w, page_h = width, height
        canvas = get_desk_background(paper, page_w, page_h)
        sheet_w = int(page_w * paper.sheet_scale)
        sheet_h = int(round(sheet_w / paper.sheet_ratio))
        sheet = get_sheet_background(paper, sheet_w, sheet_h, with_sample=True)
        sheet = sheet.rotate(paper.sheet_rotation, resample=Image.Resampling.BICUBIC, expand=True)
        # Soft shadow.
        mask = Image.new("L", sheet.size, 0)
        md = ImageDraw.Draw(mask)
        md.rounded_rectangle((0, 0, sheet.width - 1, sheet.height - 1), radius=max(2, page_w // 80), fill=200)
        shadow = Image.new("RGBA", (page_w, page_h), (0, 0, 0, 0))
        shadow.paste((0, 0, 0, 120), ((page_w - sheet.width) // 2 + 5, (page_h - sheet.height) // 2 + 12), mask)
        shadow = shadow.filter(ImageFilter.GaussianBlur(max(3, page_w // 45)))
        canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow).convert("RGB")
        x = (page_w - sheet.width) // 2
        y = (page_h - sheet.height) // 2
        canvas.paste(sheet, (x, y), sheet.convert("RGBA"))
        out = canvas
    else:
        out = get_sheet_background(paper, width, height, with_sample=True)
    out.save(path, "JPEG", quality=88, optimize=True)
    return path


def paper_background_for_layout(paper: PaperSpec, width: int, height: int) -> Image.Image:
    """Background for a flat layout page (sheet equals page)."""
    return get_sheet_background(paper, width, height)


def sheet_size_for(paper: PaperSpec, page_w: int, page_h: int) -> tuple[int, int]:
    if paper.photo:
        width = int(round(page_w * paper.sheet_scale))
        height = int(round(width / paper.sheet_ratio))
        return width, height
    return page_w, page_h


def sheet_box_for(paper: PaperSpec, page_w: int, page_h: int) -> tuple[int, int, int, int]:
    sheet_w, sheet_h = sheet_size_for(paper, page_w, page_h)
    return ((page_w - sheet_w) // 2, (page_h - sheet_h) // 2, sheet_w, sheet_h)
