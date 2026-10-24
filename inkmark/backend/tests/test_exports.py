from __future__ import annotations

from pathlib import Path

import img2pdf
import pymupdf
from PIL import Image

from app.exports import build_pdf, build_zip
from app.models import ExportRecord, Job


def make_job() -> Job:
    return Job(
        id="test",
        title="测试手迹",
        source_type="text",
        text="测试",
        font_id="xiaolai",
        paper_id="ruled_red",
        settings={},
        seed=1,
    )


def test_pdf_keeps_physical_page_size(tmp_path: Path):
    pages = []
    for index in range(2):
        path = tmp_path / f"page-{index}.jpg"
        Image.new("RGB", (1240, 1754), "#f7f1e6").save(path, dpi=(300, 300), quality=90)
        pages.append(path)
    output = tmp_path / "out.pdf"
    size = build_pdf(pages, output, 300)
    assert size > 0
    document = pymupdf.open(output)
    try:
        assert document.page_count == 2
        rect = document[0].rect
        assert abs(rect.width / 72 * 25.4 - 105) < 2
        assert abs(rect.height / 72 * 25.4 - 148.5) < 2
    finally:
        document.close()


def test_zip_contains_pages_and_readme(tmp_path: Path):
    pages = []
    for index in range(2):
        path = tmp_path / f"page-0{index + 1}.jpg"
        Image.new("RGB", (400, 566), "white").save(path)
        pages.append(path)
    job = make_job()
    export = ExportRecord(id="e1", format="zip", dpi=300, image_format="jpg")
    output = tmp_path / "out.zip"
    size = build_zip(pages, output, job, export)
    assert size > 0
    import zipfile

    with zipfile.ZipFile(output) as archive:
        names = set(archive.namelist())
        assert "page-01.jpg" in names
        assert "page-02.jpg" in names
        assert "导出说明.txt" in names
        assert "settings.json" in names
