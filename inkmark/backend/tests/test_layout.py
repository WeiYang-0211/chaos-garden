from __future__ import annotations

from app.catalog import DEFAULT_SETTINGS
from app.layout import build_layout


def test_grid_paginates_at_400_cells():
    layout = build_layout("字" * 401, "xiaolai", "grid_red", DEFAULT_SETTINGS, 7)
    assert len(layout.pages) == 2
    assert len(layout.pages[0].glyphs) == 400
    assert len(layout.pages[0].lines) == 20
    assert all(len(line.text) <= 20 for line in layout.pages[0].lines)
    assert layout.char_count == 401


def test_same_seed_is_deterministic():
    text = "山有木兮木有枝，心悦君兮君不知。\n\n愿我如星君如月，夜夜流光相皎洁。"
    first = build_layout(text, "yozai", "notebook", DEFAULT_SETTINGS, 20261024)
    second = build_layout(text, "yozai", "notebook", DEFAULT_SETTINGS, 20261024)
    assert first.to_dict() == second.to_dict()


def test_closing_punctuation_does_not_start_a_line():
    text = "字" * 20 + "。" + "字" * 20 + "，" + "结束"
    layout = build_layout(text, "xiaolai", "grid_red", DEFAULT_SETTINGS, 11)
    for page in layout.pages:
        for line in page.lines:
            assert line.text
            assert line.text[0] not in "，。！？；：、）》】」』”’"
    assert layout.pages[0].lines[0].text.endswith("。")


def test_missing_glyph_is_reported_and_left_blank():
    layout = build_layout("正常文字𠮷", "xiaolai", "ruled_red", DEFAULT_SETTINGS, 3)
    assert "𠮷" in layout.missing
    assert any("缺少" in warning for warning in layout.warnings)


def test_ruled_paper_has_pagination():
    text = "这是一行用来测试长文本分页的中文内容。" * 80
    layout = build_layout(text, "xiaolai", "ruled_red", DEFAULT_SETTINGS, 9)
    assert len(layout.pages) >= 2
    assert sum(len(page.glyphs) for page in layout.pages) == layout.char_count
