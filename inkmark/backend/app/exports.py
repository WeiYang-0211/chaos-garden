from __future__ import annotations

from datetime import datetime
import json
from pathlib import Path
import re
import zipfile

import img2pdf


def safe_filename(value: str, fallback: str = "手迹") -> str:
    value = (value or fallback).strip()
    value = re.sub(r'[\\/:*?"<>|\r\n\t]+', " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return (value or fallback)[:60]


def _readme(job, export) -> str:
    return f"""手迹 InkMark · 导出说明
========================================

标题：{job.title}
字体：{job.font_id}
纸张：{job.paper_id}
种子：{job.seed}
页数：{job.page_count}
字符数：{job.char_count}
导出格式：{export.format.upper()}
图片格式：{export.image_format.upper() if export.format == "zip" else "JPEG（嵌入 PDF）"}
分辨率：{export.dpi} DPI
生成时间：{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

说明：
- 这是本地部署版本，导出文件不包含预览水印。
- 预览和导出使用同一个排版种子，页面内容应保持一致。
- 字体与纸张素材来自各自的开放源代码项目，授权信息见项目 README。

由 手迹 InkMark 生成
"""


def build_zip(
    pages: list[Path],
    output_path: Path,
    job,
    export,
) -> int:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for page in pages:
            archive.write(page, arcname=page.name)
        archive.writestr("导出说明.txt", _readme(job, export).encode("utf-8"))
        archive.writestr(
            "settings.json",
            json.dumps(
                {
                    "title": job.title,
                    "font_id": job.font_id,
                    "paper_id": job.paper_id,
                    "settings": job.settings,
                    "seed": job.seed,
                    "dpi": export.dpi,
                },
                ensure_ascii=False,
                indent=2,
            ).encode("utf-8"),
        )
    return output_path.stat().st_size


def build_pdf(
    pages: list[Path],
    output_path: Path,
    dpi: int,
) -> int:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    # img2pdf embeds the JPEG bytes rather than recompressing them. The page
    # images are saved with an explicit DPI tag, which img2pdf uses to derive
    # the physical page size.
    with open(output_path, "wb") as handle:
        img2pdf.convert(*[str(page) for page in pages], outputstream=handle)
    return output_path.stat().st_size
