from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import json
import logging
from pathlib import Path
import threading
import traceback
from uuid import uuid4

from .catalog import DEFAULT_SETTINGS, get_font, get_paper
from .config import JOB_TTL_SECONDS, PREVIEW_WIDTH
from .exports import build_pdf, build_zip, safe_filename
from .extract import ExtractionError, extract_bytes
from .layout import build_layout
from .models import ExportRecord, Job, JobStore, utcnow
from .renderer import RenderOptions, render_export_pages, render_preview_pages

logger = logging.getLogger("inkmark.jobs")


class JobManager:
    def __init__(self, store: JobStore):
        self.store = store
        self.executor: ThreadPoolExecutor | None = None
        self._lock = threading.RLock()
        self._futures: dict[str, object] = {}
        self._cleanup_stop = threading.Event()
        self._cleanup_thread: threading.Thread | None = None
        self._started = False

    def start(self) -> None:
        if self._started:
            return
        self._started = True
        self.store.cleanup(JOB_TTL_SECONDS)
        self._cleanup_stop = threading.Event()
        self._cleanup_thread = threading.Thread(
            target=self._cleanup_loop,
            daemon=True,
            name="inkmark-cleanup",
        )
        self._cleanup_thread.start()
        self.executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="inkmark-render")

    def shutdown(self) -> None:
        self._cleanup_stop.set()
        if self.executor is not None:
            self.executor.shutdown(wait=False, cancel_futures=True)
        self.executor = None
        self._started = False

    def _cleanup_loop(self) -> None:
        while not self._cleanup_stop.wait(3600):
            try:
                self.store.cleanup(JOB_TTL_SECONDS)
            except Exception:
                logger.exception("cleanup failed")

    def _load(self, job_id: str) -> Job:
        job = self.store.load(job_id)
        if job is None:
            raise FileNotFoundError("任务不存在或已过期。")
        return job

    def _update(self, job_id: str, **changes) -> Job:
        with self._lock:
            job = self._load(job_id)
            for key, value in changes.items():
                setattr(job, key, value)
            job.progress = max(0, min(100, int(job.progress)))
            job.updated_at = utcnow()
            self.store.save(job)
            return job

    def submit_preview(self, job_id: str) -> None:
        executor = self.executor
        if executor is None:
            raise RuntimeError("任务队列尚未启动")
        future = executor.submit(self._run_preview, job_id)
        self._futures[job_id] = future
        future.add_done_callback(lambda _future: self._futures.pop(job_id, None))

    def _run_preview(self, job_id: str) -> None:
        job = None
        try:
            job = self._load(job_id)
            self._update(job_id, status="processing", phase="准备输入", progress=3, error="")

            if job.source_type != "text" and not job.text.strip():
                file_path = self._input_path(job)
                self._update(job_id, phase="提取文字", progress=8)
                data = file_path.read_bytes()
                document = extract_bytes(job.source_name or file_path.name, data)
                text = document.normalized()
                warnings = list(document.warnings)
                if not text:
                    raise ExtractionError("没有提取到可排版的文字。")
                job = self._update(
                    job_id,
                    text=text,
                    title=document.title or job.title,
                    source_type=document.source_type,
                    warning="；".join(warnings),
                    phase="排版",
                    progress=18,
                )
            else:
                if not job.text.strip():
                    raise ExtractionError("请输入要转换的文字，或上传一个文件。")
                self._update(job_id, phase="排版", progress=18)

            settings = {**DEFAULT_SETTINGS, **(job.settings or {})}
            paper = get_paper(job.paper_id)
            get_font(job.font_id)
            self._update(job_id, phase="计算字格与版式", progress=24)
            layout = build_layout(job.text, job.font_id, job.paper_id, settings, job.seed)
            layout_data = layout.to_dict()
            (self.store.job_dir(job_id) / "layout.json").write_text(
                json.dumps(layout_data, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8",
            )

            warnings = []
            if job.warning:
                warnings.extend(part for part in job.warning.split("；") if part)
            warnings.extend(layout.warnings)
            unique_warnings = list(dict.fromkeys(warnings))
            self._update(
                job_id,
                status="rendering",
                phase="渲染纸张与字迹",
                progress=32,
                page_count=len(layout.pages),
                char_count=layout.char_count,
                unsupported=len(layout.missing),
                warning="；".join(unique_warnings),
            )

            preview_dir = self.store.job_dir(job_id) / "preview"

            def on_page(done: int, total: int) -> None:
                progress = 35 + int(60 * done / max(1, total))
                self._update(
                    job_id,
                    phase=f"渲染第 {done}/{total} 页",
                    progress=progress,
                )

            options = RenderOptions(
                font_id=job.font_id,
                ink=str(settings.get("ink") or "#1f1e1b"),
                watermark=True,
            )
            paths = render_preview_pages(
                layout,
                paper,
                options,
                PREVIEW_WIDTH,
                preview_dir,
                progress=on_page,
            )
            preview_urls = [f"/api/jobs/{job_id}/preview/{index + 1}" for index in range(len(paths))]
            self._update(
                job_id,
                status="ready",
                phase="已生成预览",
                progress=100,
                page_count=len(layout.pages),
                preview_urls=preview_urls,
                error="",
            )
            logger.info("preview ready job=%s pages=%s chars=%s", job_id, len(layout.pages), layout.char_count)
        except ExtractionError as exc:
            logger.warning("preview extraction failed job=%s: %s", job_id, exc)
            self._fail_preview(job_id, str(exc))
        except Exception as exc:
            logger.error("preview failed job=%s\n%s", job_id, traceback.format_exc())
            self._fail_preview(job_id, f"生成失败：{exc}")
        finally:
            job = None

    def _fail_preview(self, job_id: str, message: str) -> None:
        try:
            self._update(
                job_id,
                status="failed",
                phase="生成失败",
                progress=100,
                error=message,
            )
        except Exception:
            logger.exception("could not persist failure for %s", job_id)

    def _input_path(self, job: Job) -> Path:
        directory = self.store.job_dir(job.id)
        candidates = list(directory.glob("input.*"))
        if not candidates:
            raise ExtractionError("上传的文件已丢失，请重新上传。")
        return candidates[0]

    def submit_export(self, job_id: str, file_format: str, dpi: int, image_format: str) -> ExportRecord:
        with self._lock:
            job = self._load(job_id)
            if job.status != "ready":
                raise ValueError("请先等待预览生成完成。")
            export = ExportRecord(
                id=uuid4().hex[:16],
                format=file_format,
                dpi=dpi,
                image_format=image_format,
                status="queued",
                phase="排队中",
                progress=0,
            )
            job.exports[export.id] = export
            self.store.save(job)
        executor = self.executor
        if executor is None:
            raise RuntimeError("任务队列尚未启动")
        executor.submit(self._run_export, job_id, export.id)
        return export

    def _run_export(self, job_id: str, export_id: str) -> None:
        try:
            job = self._load(job_id)
            export = job.exports.get(export_id)
            if export is None:
                return
            self._update_export(
                job_id,
                export_id,
                status="rendering",
                phase="准备高清渲染",
                progress=3,
            )
            layout_path = self.store.job_dir(job_id) / "layout.json"
            if not layout_path.exists():
                raise ValueError("布局文件已丢失，请重新生成预览。")
            layout_data = json.loads(layout_path.read_text(encoding="utf-8"))
            layout = _layout_from_dict(layout_data)
            paper = get_paper(job.paper_id)
            settings = {**DEFAULT_SETTINGS, **(job.settings or {})}
            options = RenderOptions(
                font_id=job.font_id,
                ink=str(settings.get("ink") or "#1f1e1b"),
                watermark=False,
            )
            export_dir = self.store.job_dir(job_id) / "export" / export_id
            image_format = "jpg" if export.format == "pdf" else export.image_format
            self._update_export(
                job_id,
                export_id,
                phase="渲染高清页面",
                progress=8,
            )

            def on_page(done: int, total: int) -> None:
                self._update_export(
                    job_id,
                    export_id,
                    phase=f"渲染第 {done}/{total} 页",
                    progress=8 + int(78 * done / max(1, total)),
                )

            pages = render_export_pages(
                layout,
                paper,
                options,
                export.dpi,
                export_dir,
                image_format=image_format,
                progress=on_page,
            )
            self._update_export(
                job_id,
                export_id,
                status="packaging",
                phase="打包文件",
                progress=90,
            )
            extension = "pdf" if export.format == "pdf" else "zip"
            filename = f"{safe_filename(job.title)}_{job.seed}.{extension}"
            output_path = self.store.job_dir(job_id) / "export" / export_id / filename
            if export.format == "pdf":
                size = build_pdf(pages, output_path, export.dpi)
            else:
                size = build_zip(pages, output_path, job, export)
            # Page images are no longer needed once the archive exists.
            for page in pages:
                try:
                    page.unlink(missing_ok=True)
                except OSError:
                    pass
            self._update_export(
                job_id,
                export_id,
                status="ready",
                phase="可以下载",
                progress=100,
                filename=filename,
                size_bytes=size,
            )
            logger.info("export ready job=%s export=%s file=%s", job_id, export_id, filename)
        except Exception as exc:
            logger.error("export failed job=%s export=%s\n%s", job_id, export_id, traceback.format_exc())
            self._update_export(
                job_id,
                export_id,
                status="failed",
                phase="导出失败",
                progress=100,
                error=f"导出失败：{exc}",
            )

    def _update_export(self, job_id: str, export_id: str, **changes) -> None:
        with self._lock:
            job = self._load(job_id)
            export = job.exports.get(export_id)
            if export is None:
                return
            for key, value in changes.items():
                setattr(export, key, value)
            export.updated_at = utcnow()
            job.updated_at = utcnow()
            self.store.save(job)

    def export_path(self, job_id: str, export_id: str) -> tuple[Path, ExportRecord]:
        job = self._load(job_id)
        export = job.exports.get(export_id)
        if export is None:
            raise FileNotFoundError("导出记录不存在。")
        path = self.store.job_dir(job_id) / "export" / export_id / export.filename
        if export.status != "ready" or not path.exists():
            raise FileNotFoundError("导出文件尚未就绪。")
        return path, export


def _layout_from_dict(data: dict):
    # Rehydrate dataclasses without importing the private parser from layout.
    from .layout import Glyph, Line, PageLayout, LayoutResult

    pages = []
    for page_data in data.get("pages", []):
        glyphs = [Glyph(**glyph) for glyph in page_data.get("glyphs", [])]
        lines = [Line(**line) for line in page_data.get("lines", [])]
        pages.append(
            PageLayout(
                index=page_data["index"],
                width=page_data["width"],
                height=page_data["height"],
                sheet_width=page_data["sheet_width"],
                sheet_height=page_data["sheet_height"],
                sheet_box=tuple(page_data["sheet_box"]),
                glyphs=glyphs,
                lines=lines,
            )
        )
    return LayoutResult(
        pages=pages,
        font_id=data.get("font_id", ""),
        paper_id=data.get("paper_id", ""),
        settings=data.get("settings", {}),
        seed=int(data.get("seed", 0)),
        char_count=int(data.get("char_count", 0)),
        missing=data.get("missing", []),
        warnings=data.get("warnings", []),
    )
