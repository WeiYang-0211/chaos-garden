from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any

from .config import FONT_DIR


@dataclass(frozen=True)
class FontSpec:
    id: str
    name: str
    subtitle: str
    description: str
    file: str
    tags: tuple[str, ...]
    license: str
    license_url: str
    script: str = "简体中文"
    weight: str = "常规"

    @property
    def path(self) -> Path:
        return FONT_DIR / self.file

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data.pop("file", None)
        data["available"] = self.path.exists()
        data["sample_url"] = f"/api/assets/fonts/{self.id}/sample.png"
        return data


@dataclass(frozen=True)
class PaperSpec:
    id: str
    name: str
    subtitle: str
    description: str
    kind: str
    ratio: float
    sheet_ratio: float
    sheet_scale: float
    sheet_rotation: float
    margin_x: float
    margin_top: float
    margin_bottom: float
    font_ratio: float
    line_spacing: float
    indent: float
    paper_color: str
    line_color: str
    margin_line_color: str | None
    line_width: float
    cols: int | None = None
    rows: int | None = None
    photo: bool = False
    printable: bool = True
    badge: str = ""

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["thumbnail_url"] = f"/api/assets/papers/{self.id}/thumb.jpg"
        return data


FONTS: tuple[FontSpec, ...] = (
    FontSpec(
        id="xiaolai",
        name="小赖手写",
        subtitle="日常中性笔",
        description="字形端正、略带连笔，最接近学生时代的课堂笔记，适合长文与书信。",
        file="Xiaolai-Regular.ttf",
        tags=("日常", "中性笔", "简体"),
        license="SIL Open Font License 1.1",
        license_url="https://github.com/lxgw/kose-font",
    ),
    FontSpec(
        id="yozai",
        name="悠哉手写",
        subtitle="随性圆珠笔",
        description="松弛、圆润、有呼吸感，笔画里有不经意的停顿，适合随笔和日记。",
        file="Yozai-Regular.ttf",
        tags=("随性", "圆珠笔", "简体"),
        license="SIL Open Font License 1.1",
        license_url="https://github.com/lxgw/yozai-font",
    ),
    FontSpec(
        id="mashanzheng",
        name="马善政毛笔",
        subtitle="毛笔楷书",
        description="提按分明的毛笔字，横细竖粗，适合诗词、题字与有仪式感的短篇。",
        file="MaShanZheng-Regular.ttf",
        tags=("毛笔", "楷书", "简体"),
        license="SIL Open Font License 1.1",
        license_url="https://fonts.google.com/specimen/Ma+Shan+Zheng",
    ),
    FontSpec(
        id="zhimangxing",
        name="志莽行书",
        subtitle="行书飞白",
        description="笔画连带明显、速度感强，写长句时有一种一气呵成的气势。",
        file="ZhiMangXing-Regular.ttf",
        tags=("行书", "连笔", "简体"),
        license="SIL Open Font License 1.1",
        license_url="https://fonts.google.com/specimen/Zhi+Mang+Xing",
    ),
    FontSpec(
        id="longcang",
        name="龙藏体",
        subtitle="清瘦行楷",
        description="细瘦、清冷、略带锋芒，适合摘抄、诗句和留白较多的信纸。",
        file="LongCang-Regular.ttf",
        tags=("行楷", "清瘦", "简体"),
        license="SIL Open Font License 1.1",
        license_url="https://fonts.google.com/specimen/Long+Cang",
    ),
    FontSpec(
        id="liujianmaocao",
        name="刘建毛草",
        subtitle="草书",
        description="连绵飞动的草书，辨识度低但情绪饱满，适合短句、签名与题跋。",
        file="LiuJianMaoCao-Regular.ttf",
        tags=("草书", "飞动", "简体"),
        license="SIL Open Font License 1.1",
        license_url="https://fonts.google.com/specimen/Liu+Jian+Mao+Cao",
    ),
    FontSpec(
        id="chenyuluoyan",
        name="辰宇落雁",
        subtitle="细笔文艺",
        description="像用极细的笔慢慢写下，字形修长、气质安静，适合短诗与明信片。",
        file="ChenYuluoyan-2.0-Thin.ttf",
        tags=("细笔", "文艺", "繁体优先"),
        license="SIL Open Font License 1.1",
        license_url="https://github.com/Chenyu-otf/chenyuluoyan_thin",
        script="繁体中文",
        weight="细",
    ),
    FontSpec(
        id="wenkai",
        name="霞鹜文楷",
        subtitle="工整楷体",
        description="介于印刷楷体和手写之间，干净克制，适合需要长期阅读的正文。",
        file="LXGWWenKai-Regular.ttf",
        tags=("楷体", "工整", "简体"),
        license="SIL Open Font License 1.1",
        license_url="https://github.com/lxgw/LxgwWenKai",
    ),
)


PAPERS: tuple[PaperSpec, ...] = (
    PaperSpec(
        id="notebook",
        name="草稿本 · 实拍",
        subtitle="木桌 / 线圈本 / 淡绿格",
        description="摊开在木桌上的线圈草稿本，带纸张阴影和装订孔，最有生活气。",
        kind="notebook",
        ratio=3 / 4,
        sheet_ratio=1 / 1.4142,
        sheet_scale=0.80,
        sheet_rotation=1.1,
        margin_x=0.125,
        margin_top=0.070,
        margin_bottom=0.065,
        font_ratio=0.038,
        line_spacing=1.52,
        indent=2,
        paper_color="#f3efdf",
        line_color="#9fb6ac",
        margin_line_color="#d9a19a",
        line_width=0.0012,
        cols=20,
        rows=28,
        photo=True,
        badge="实拍",
    ),
    PaperSpec(
        id="letter",
        name="单红线信纸 · 实拍",
        subtitle="暖白 / 红横线 / 装订",
        description="暖白色横线信纸，红色页边线，放在深色桌面上，像刚从抽屉里抽出来。",
        kind="letter",
        ratio=3 / 4,
        sheet_ratio=1 / 1.4142,
        sheet_scale=0.80,
        sheet_rotation=-0.8,
        margin_x=0.12,
        margin_top=0.08,
        margin_bottom=0.07,
        font_ratio=0.037,
        line_spacing=1.62,
        indent=2,
        paper_color="#f6f1e4",
        line_color="#cf8f86",
        margin_line_color="#c97d74",
        line_width=0.0011,
        photo=True,
        badge="实拍",
    ),
    PaperSpec(
        id="grid_red",
        name="红格稿纸",
        subtitle="20 × 20 / 400 字",
        description="经典红格稿纸，一格一字，适合作文、抄写和需要整齐排版的文本。",
        kind="grid",
        ratio=1 / 1.4142,
        sheet_ratio=1 / 1.4142,
        sheet_scale=1.0,
        sheet_rotation=0.0,
        margin_x=0.075,
        margin_top=0.075,
        margin_bottom=0.065,
        font_ratio=0.040,
        line_spacing=1.0,
        indent=0,
        paper_color="#fbf7ec",
        line_color="#d9a09a",
        margin_line_color="#c97972",
        line_width=0.0009,
        cols=20,
        rows=20,
        printable=True,
        badge="400字",
    ),
    PaperSpec(
        id="grid_black",
        name="黑格稿纸",
        subtitle="20 × 20 / 素净",
        description="黑白稿纸，线条克制，适合练字、笔记和正式一点的抄写。",
        kind="grid",
        ratio=1 / 1.4142,
        sheet_ratio=1 / 1.4142,
        sheet_scale=1.0,
        sheet_rotation=0.0,
        margin_x=0.075,
        margin_top=0.075,
        margin_bottom=0.065,
        font_ratio=0.040,
        line_spacing=1.0,
        indent=0,
        paper_color="#faf8f2",
        line_color="#a9a49a",
        margin_line_color=None,
        line_width=0.0008,
        cols=20,
        rows=20,
        printable=True,
        badge="400字",
    ),
    PaperSpec(
        id="ruled_red",
        name="红线信纸",
        subtitle="A4 / 可打印",
        description="干净的红线信纸，留白充足，适合打印后直接使用。",
        kind="ruled",
        ratio=1 / 1.4142,
        sheet_ratio=1 / 1.4142,
        sheet_scale=1.0,
        sheet_rotation=0.0,
        margin_x=0.10,
        margin_top=0.085,
        margin_bottom=0.07,
        font_ratio=0.040,
        line_spacing=1.62,
        indent=2,
        paper_color="#fcf9f0",
        line_color="#d5a39b",
        margin_line_color="#c98077",
        line_width=0.0009,
        printable=True,
        badge="可打印",
    ),
    PaperSpec(
        id="ruled_blue",
        name="蓝线信纸",
        subtitle="A4 / 可打印",
        description="清爽的蓝线信纸，像旧时练习本，适合长信和读书笔记。",
        kind="ruled",
        ratio=1 / 1.4142,
        sheet_ratio=1 / 1.4142,
        sheet_scale=1.0,
        sheet_rotation=0.0,
        margin_x=0.10,
        margin_top=0.085,
        margin_bottom=0.07,
        font_ratio=0.040,
        line_spacing=1.62,
        indent=2,
        paper_color="#fbfaf3",
        line_color="#a8bfd0",
        margin_line_color="#9aaec0",
        line_width=0.0009,
        printable=True,
        badge="可打印",
    ),
    PaperSpec(
        id="blank",
        name="素白纸",
        subtitle="A4 / 极简",
        description="几乎没有线条的素白纸，适合题字、短诗和需要大量留白的排版。",
        kind="blank",
        ratio=1 / 1.4142,
        sheet_ratio=1 / 1.4142,
        sheet_scale=1.0,
        sheet_rotation=0.0,
        margin_x=0.12,
        margin_top=0.10,
        margin_bottom=0.09,
        font_ratio=0.043,
        line_spacing=1.55,
        indent=2,
        paper_color="#fcfaf4",
        line_color="#ded7c9",
        margin_line_color=None,
        line_width=0.0008,
        printable=True,
        badge="可打印",
    ),
    PaperSpec(
        id="exam",
        name="考试纸",
        subtitle="A4 / 横线 / 页眉",
        description="带页眉横线和密封线的考试纸，适合模拟试卷、默写和正式抄写。",
        kind="exam",
        ratio=1 / 1.4142,
        sheet_ratio=1 / 1.4142,
        sheet_scale=1.0,
        sheet_rotation=0.0,
        margin_x=0.09,
        margin_top=0.12,
        margin_bottom=0.075,
        font_ratio=0.038,
        line_spacing=1.6,
        indent=0,
        paper_color="#faf8f0",
        line_color="#aaa59a",
        margin_line_color="#b8b2a6",
        line_width=0.0008,
        printable=True,
        badge="可打印",
    ),
    PaperSpec(
        id="kraft",
        name="牛皮纸",
        subtitle="复古 / 深色墨",
        description="带纤维和折痕的牛皮纸，配深褐墨色，像旧书里夹着的一页。",
        kind="kraft",
        ratio=1 / 1.4142,
        sheet_ratio=1 / 1.4142,
        sheet_scale=1.0,
        sheet_rotation=0.0,
        margin_x=0.10,
        margin_top=0.085,
        margin_bottom=0.075,
        font_ratio=0.040,
        line_spacing=1.58,
        indent=2,
        paper_color="#c9a77a",
        line_color="#8d6e4c",
        margin_line_color="#7d5e40",
        line_width=0.0010,
        printable=True,
        badge="复古",
    ),
    PaperSpec(
        id="vintage",
        name="旧信笺",
        subtitle="泛黄 / 水渍 / 岁月感",
        description="泛黄、带水渍和细小霉点的旧信笺，适合写给很久以后的人。",
        kind="vintage",
        ratio=1 / 1.4142,
        sheet_ratio=1 / 1.4142,
        sheet_scale=1.0,
        sheet_rotation=0.0,
        margin_x=0.105,
        margin_top=0.09,
        margin_bottom=0.08,
        font_ratio=0.040,
        line_spacing=1.55,
        indent=2,
        paper_color="#e8d6b3",
        line_color="#b79a76",
        margin_line_color="#a88966",
        line_width=0.0010,
        printable=True,
        badge="复古",
    ),
    PaperSpec(
        id="dotgrid",
        name="点阵本",
        subtitle="A4 / 子弹笔记",
        description="浅灰点阵，适合笔记、手帐和想要自由安排版式的短内容。",
        kind="dotgrid",
        ratio=1 / 1.4142,
        sheet_ratio=1 / 1.4142,
        sheet_scale=1.0,
        sheet_rotation=0.0,
        margin_x=0.085,
        margin_top=0.085,
        margin_bottom=0.075,
        font_ratio=0.038,
        line_spacing=1.58,
        indent=2,
        paper_color="#fbfaf4",
        line_color="#c8c4b9",
        margin_line_color=None,
        line_width=0.0007,
        printable=True,
        badge="点阵",
    ),
)

FONT_MAP = {font.id: font for font in FONTS}
PAPER_MAP = {paper.id: paper for paper in PAPERS}

DEFAULT_SETTINGS: dict[str, Any] = {
    "font_size": 1.0,
    "line_spacing": 1.0,
    "messiness": 6,
    "stroke_random": 5,
    "mistake_rate": 3,
    "slant": 0.0,
    "ink": "#1f1e1b",
}

INK_COLORS = (
    {"id": "ink", "name": "墨黑", "value": "#1f1e1b"},
    {"id": "blue", "name": "钢蓝", "value": "#223a54"},
    {"id": "blueblack", "name": "蓝黑", "value": "#26323f"},
    {"id": "brown", "name": "褐墨", "value": "#4a3324"},
    {"id": "gray", "name": "铅笔灰", "value": "#4d4a44"},
)

LIMITS = {
    "max_chars": 20000,
    "max_pages": 12,
    "max_upload_mb": 20,
    "preview_width": 1400,
    "export_dpi": [300, 600],
    "image_formats": ["jpg", "png"],
    "export_formats": ["zip", "pdf"],
}

SETTING_RANGES = {
    "font_size": [0.72, 1.45],
    "line_spacing": [0.85, 1.45],
    "messiness": [0, 100],
    "stroke_random": [0, 100],
    "mistake_rate": [0, 100],
    "slant": [-8, 8],
}


def get_font(font_id: str) -> FontSpec:
    if font_id not in FONT_MAP:
        raise KeyError(f"未知字体: {font_id}")
    font = FONT_MAP[font_id]
    if not font.path.exists():
        raise FileNotFoundError(f"字体文件不存在: {font.file}")
    return font


def get_paper(paper_id: str) -> PaperSpec:
    if paper_id not in PAPER_MAP:
        raise KeyError(f"未知纸张: {paper_id}")
    return PAPER_MAP[paper_id]


def catalog_payload() -> dict[str, Any]:
    from .config import SAMPLE_TEXTS

    return {
        "fonts": [font.to_dict() for font in FONTS],
        "papers": [paper.to_dict() for paper in PAPERS],
        "inks": list(INK_COLORS),
        "defaults": DEFAULT_SETTINGS,
        "limits": LIMITS,
        "ranges": SETTING_RANGES,
        "samples": SAMPLE_TEXTS,
    }
