from __future__ import annotations

from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path
import logging
import re
import secrets
import time
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .catalog import (
    DEFAULT_SETTINGS,
    LIMITS,
    PAPER_MAP,
    FONT_MAP,
    catalog_payload,
    get_font,
    get_paper,
)
from .config import (
    APP_NAME,
    APP_VERSION,
    FRONTEND_DIST,
    JOB_DIR,
    MAX_CHARS,
    MAX_UPLOAD_BYTES,
    PREVIEW_WIDTH,
    RATE_LIMIT_COUNT,
    RATE_LIMIT_WINDOW,
)
from .fonts import registry
from .jobs import JobManager
from .models import Job, JobStore
from .papers import paper_thumbnail
from .extract import normalize_text

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("inkmark")

DATA_JOBS = JOB_DIR
STORE = JobStore(DATA_JOBS)
MANAGER = JobManager(STORE)


class RateLimiter:
    def __init__(self, limit: int, window: int):
        self.limit = limit
        self.window = window
        self.hits: dict[str, deque[float]] = defaultdict(deque)
        self.lock = __import__("threading").Lock()

    def check(self, key: str) -> None:
        now = time.time()
        with self.lock:
            bucket = self.hits[key]
            while bucket and now - bucket[0] > self.window:
                bucket.popleft()
            if len(bucket) >= self.limit:
                retry = max(1, int(self.window - (now - bucket[0])))
                raise HTTPException(
                    status_code=429,
                    detail=f"操作太频繁，请 {retry} 秒后再试。",
                )
            bucket.append(now)
            if len(self.hits) > 4000:
                for old_key in list(self.hits.keys())[:1000]:
                    if not self.hits[old_key]:
                        self.hits.pop(old_key, None)


LIMITER = RateLimiter(RATE_LIMIT_COUNT, RATE_LIMIT_WINDOW)


@asynccontextmanager
async def lifespan(app: FastAPI):
    MANAGER.start()
    logger.info("%s %s starting, data=%s", APP_NAME, APP_VERSION, DATA_JOBS)
    yield
    MANAGER.shutdown()


app = FastAPI(title=APP_NAME, version=APP_VERSION, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ExportBody(BaseModel):
    format: Literal["zip", "pdf"] = Field(default="zip")
    dpi: Literal[300, 600] = Field(default=300)
    image_format: Literal["jpg", "png"] = Field(default="jpg")


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _public_job(job: Job, include_text: bool = False) -> dict:
    data = job.public_dict(include_text=include_text)
    for export_id, export in job.exports.items():
        if export.status == "ready":
            data["exports"][export_id]["file_url"] = f"/api/jobs/{job.id}/exports/{export_id}/file"
    return data


def _get_job(job_id: str) -> Job:
    if not re.fullmatch(r"[a-f0-9]{32}", job_id or ""):
        raise HTTPException(status_code=404, detail="任务不存在或已过期。")
    job = STORE.load(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="任务不存在或已过期。")
    return job


def _safe_title(value: str, fallback: str) -> str:
    value = (value or "").strip()
    value = re.sub(r"[\\/:*?\"<>|\r\n\t]+", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return (value or fallback)[:80]


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, float(value)))


@app.get("/api/health")
async def health():
    return {
        "ok": True,
        "app": APP_NAME,
        "version": APP_VERSION,
        "fonts": sum(1 for font in FONT_MAP.values() if font.path.exists()),
        "papers": len(PAPER_MAP),
    }


@app.get("/api/catalog")
async def catalog():
    data = catalog_payload()
    data["preview_width"] = PREVIEW_WIDTH
    data["version"] = APP_VERSION
    return data


@app.get("/api/assets/fonts/{font_id}/sample.png")
async def font_sample(font_id: str):
    if font_id not in FONT_MAP:
        raise HTTPException(status_code=404, detail="字体不存在。")
    try:
        path = registry.sample_path(font_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"字体预览生成失败：{exc}") from exc
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": "public, max-age=3600"})


@app.get("/api/assets/papers/{paper_id}/thumb.jpg")
async def paper_thumb(paper_id: str):
    if paper_id not in PAPER_MAP:
        raise HTTPException(status_code=404, detail="纸张不存在。")
    try:
        path = paper_thumbnail(paper_id, 420)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"纸张预览生成失败：{exc}") from exc
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=3600"})


@app.post("/api/jobs")
async def create_job(
    request: Request,
    mode: str = Form("text"),
    text: str = Form(""),
    font_id: str = Form("xiaolai"),
    paper_id: str = Form("notebook"),
    title: str = Form(""),
    font_size: float = Form(1.0),
    line_spacing: float = Form(1.0),
    messiness: float = Form(6),
    stroke_random: float = Form(5),
    mistake_rate: float = Form(3),
    slant: float = Form(0),
    ink: str = Form("#1f1e1b"),
    seed: str = Form(""),
    file: UploadFile | None = File(default=None),
):
    LIMITER.check(_client_key(request))
    if font_id not in FONT_MAP:
        raise HTTPException(status_code=400, detail="请选择有效的字体。")
    if paper_id not in PAPER_MAP:
        raise HTTPException(status_code=400, detail="请选择有效的纸张。")
    try:
        get_font(font_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    settings = {
        "font_size": _clamp(font_size, 0.72, 1.45),
        "line_spacing": _clamp(line_spacing, 0.85, 1.45),
        "messiness": _clamp(messiness, 0, 100),
        "stroke_random": _clamp(stroke_random, 0, 100),
        "mistake_rate": _clamp(mistake_rate, 0, 100),
        "slant": _clamp(slant, -8, 8),
        "ink": ink if re.fullmatch(r"#[0-9a-fA-F]{6}", ink or "") else DEFAULT_SETTINGS["ink"],
    }
    try:
        seed_value = int(seed) if seed.strip() else secrets.randbelow(2_000_000_000) + 1
        if seed_value <= 0 or seed_value > 4_000_000_000:
            seed_value = secrets.randbelow(2_000_000_000) + 1
    except ValueError:
        seed_value = secrets.randbelow(2_000_000_000) + 1

    job_id = uuid4().hex
    job_title = _safe_title(title, "未命名手稿")
    source_name = ""
    source_type = "text"
    job_text = ""
    input_warning = ""

    if mode == "file":
        if file is None or not file.filename:
            raise HTTPException(status_code=400, detail="请选择要上传的文件。")
        suffix = Path(file.filename).suffix.lower()
        if suffix == ".doc":
            raise HTTPException(status_code=400, detail="旧版 .doc 请先另存为 .docx 再上传。")
        if suffix not in {".txt", ".docx", ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".bmp"}:
            raise HTTPException(status_code=400, detail="支持 .txt、.docx、.pdf、.png、.jpg、.jpeg、.webp 文件。")
        data = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail=f"文件超过 {MAX_UPLOAD_BYTES // 1024 // 1024}MB，请压缩后再上传。")
        if not data:
            raise HTTPException(status_code=400, detail="上传的文件是空的。")
        source_name = file.filename
        source_type = "file"
        job_title = _safe_title(title, Path(file.filename).stem or "未命名手稿")
    else:
        normalized = normalize_text(text)
        if not normalized:
            raise HTTPException(status_code=400, detail="请输入要转换的文字。")
        if len(normalized) > MAX_CHARS:
            normalized = normalized[:MAX_CHARS]
            input_warning = f"文本超过 {MAX_CHARS:,} 字，已截取前 {MAX_CHARS:,} 字。"
        job_text = normalized
        if not title.strip():
            first_line = next((line.strip() for line in normalized.splitlines() if line.strip()), "")
            job_title = _safe_title(first_line, "未命名手稿")

    job = Job(
        id=job_id,
        title=job_title,
        source_type=source_type,
        source_name=source_name,
        text=job_text,
        font_id=font_id,
        paper_id=paper_id,
        settings=settings,
        seed=seed_value,
        status="queued",
        phase="排队中",
        warning=input_warning,
    )
    STORE.create(job)
    if mode == "file" and file is not None:
        suffix = Path(file.filename or "input.bin").suffix.lower() or ".bin"
        (STORE.job_dir(job_id) / f"input{suffix}").write_bytes(data)
    MANAGER.submit_preview(job_id)
    logger.info("job created id=%s font=%s paper=%s mode=%s", job_id, font_id, paper_id, mode)
    return {"job_id": job_id, "status": "queued", "seed": seed_value}


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str, include_text: bool = Query(False)):
    job = _get_job(job_id)
    return _public_job(job, include_text=include_text)


@app.get("/api/jobs/{job_id}/preview/{page_number}")
async def get_preview(job_id: str, page_number: int):
    job = _get_job(job_id)
    if page_number < 1 or page_number > len(job.preview_urls):
        raise HTTPException(status_code=404, detail="预览页不存在。")
    path = STORE.job_dir(job_id) / "preview" / f"page-{page_number}.jpg"
    if not path.exists():
        raise HTTPException(status_code=404, detail="预览页尚未生成。")
    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store, max-age=0"},
    )


@app.post("/api/jobs/{job_id}/exports")
async def create_export(job_id: str, body: ExportBody):
    job = _get_job(job_id)
    if job.status != "ready":
        raise HTTPException(status_code=409, detail="请等待预览生成完成后再下载。")
    # Reuse a recent completed export with identical settings.
    for export in job.exports.values():
        if export.status == "ready" and export.format == body.format and export.dpi == body.dpi and export.image_format == body.image_format:
            data = export.to_dict()
            data["file_url"] = f"/api/jobs/{job_id}/exports/{export.id}/file"
            return data
    try:
        export = MANAGER.submit_export(job_id, body.format, body.dpi, body.image_format)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return export.to_dict()


@app.get("/api/jobs/{job_id}/exports/{export_id}")
async def get_export(job_id: str, export_id: str):
    job = _get_job(job_id)
    if not re.fullmatch(r"[a-f0-9]{16}", export_id or ""):
        raise HTTPException(status_code=404, detail="导出记录不存在。")
    export = job.exports.get(export_id)
    if export is None:
        raise HTTPException(status_code=404, detail="导出记录不存在。")
    data = export.to_dict()
    if export.status == "ready":
        data["file_url"] = f"/api/jobs/{job_id}/exports/{export_id}/file"
    return data


@app.get("/api/jobs/{job_id}/exports/{export_id}/file")
async def download_export(job_id: str, export_id: str):
    _get_job(job_id)
    if not re.fullmatch(r"[a-f0-9]{16}", export_id or ""):
        raise HTTPException(status_code=404, detail="导出记录不存在。")
    try:
        path, export = MANAGER.export_path(job_id, export_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    media_type = "application/pdf" if export.format == "pdf" else "application/zip"
    return FileResponse(path, media_type=media_type, filename=path.name)


@app.delete("/api/jobs/{job_id}")
async def delete_job(job_id: str):
    _get_job(job_id)
    STORE.delete(job_id)
    return {"ok": True}


@app.exception_handler(HTTPException)
async def http_error(_request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail if isinstance(exc.detail, str) else exc.detail},
        headers=getattr(exc, "headers", None),
    )


if (FRONTEND_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="frontend-assets")


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_frontend(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="接口不存在。")
    index = FRONTEND_DIST / "index.html"
    if not index.exists():
        return JSONResponse(
            status_code=200,
            content={
                "message": "手迹后端已启动，但前端尚未构建。",
                "hint": "在 frontend 目录运行 pnpm install && pnpm build，然后刷新。",
            },
        )
    requested = FRONTEND_DIST / full_path
    if full_path and requested.is_file() and FRONTEND_DIST in requested.resolve().parents:
        return FileResponse(requested)
    return FileResponse(index)
