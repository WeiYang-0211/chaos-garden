from __future__ import annotations

import os
from pathlib import Path

APP_NAME = "手迹 InkMark"
APP_VERSION = "1.0.0"

ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"
FONT_DIR = BACKEND_DIR / "assets" / "fonts"
LICENSE_DIR = BACKEND_DIR / "assets" / "licenses"
DATA_DIR = Path(os.environ.get("INKMARK_DATA_DIR", ROOT_DIR / "data"))
JOB_DIR = DATA_DIR / "jobs"
CACHE_DIR = DATA_DIR / "cache"

for directory in (DATA_DIR, JOB_DIR, CACHE_DIR):
    directory.mkdir(parents=True, exist_ok=True)

MAX_CHARS = int(os.environ.get("INKMARK_MAX_CHARS", "20000"))
MAX_PAGES = int(os.environ.get("INKMARK_MAX_PAGES", "12"))
MAX_UPLOAD_BYTES = int(os.environ.get("INKMARK_MAX_UPLOAD_MB", "20")) * 1024 * 1024
JOB_TTL_SECONDS = int(os.environ.get("INKMARK_JOB_TTL_HOURS", "24")) * 3600
PREVIEW_WIDTH = int(os.environ.get("INKMARK_PREVIEW_WIDTH", "1400"))
CANONICAL_DPI = 300
PREVIEW_QUALITY = 88
EXPORT_QUALITIES = {"jpg": 94, "png": 100}
RATE_LIMIT_WINDOW = 600
RATE_LIMIT_COUNT = 30

DEFAULT_TEXT = """山有木兮木有枝，心悦君兮君不知。
人生若只如初见，何事秋风悲画扇。
愿我如星君如月，夜夜流光相皎洁。

—— 手迹 · 写给时光的一封信
2026.10.24
"""

SAMPLE_TEXTS = [
    {
        "label": "一封信",
        "text": """见字如面。

最近的日子过得很快，窗外的梧桐已经落了大半。偶尔想起从前，我们在旧书店门口分吃一袋糖炒栗子，风把围巾吹得乱七八糟，你却笑得很开心。

有些话隔着屏幕总说不完整，所以还是决定写下来。愿你那里也有好天气，愿每一次出发都有归途。

此致
秋安

2026 年 10 月 24 日""",
    },
    {
        "label": "古诗",
        "text": """滕王阁序（节选）

豫章故郡，洪都新府。星分翼轸，地接衡庐。襟三江而带五湖，控蛮荆而引瓯越。物华天宝，龙光射牛斗之墟；人杰地灵，徐孺下陈蕃之榻。

层峦耸翠，上出重霄；飞阁流丹，下临无地。鹤汀凫渚，穷岛屿之萦回；桂殿兰宫，即冈峦之体势。

落霞与孤鹜齐飞，秋水共长天一色。渔舟唱晚，响穷彭蠡之滨；雁阵惊寒，声断衡阳之浦。""",
    },
    {
        "label": "笔记",
        "text": """第十章 · 关于书写的温度

键盘把文字变得很快，快到我们常常忘记一个字落在纸上的重量。笔尖压下去的时候，墨会顺着纤维慢慢散开，像一个人把话在心里过了一遍，才终于说出口。

手写并不完美。它会歪，会抖，会写错，会在句尾留下一个不太圆的句号。但也正是这些不完美，让某年某月某日的那张纸，变成只属于一个人的证据。

今日摘抄：
“慢慢来，比较快。”""",
    },
]
