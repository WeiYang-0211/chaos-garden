from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass
class ExportRecord:
    id: str
    format: str
    dpi: int
    image_format: str
    status: str = "queued"
    progress: int = 0
    phase: str = "排队中"
    filename: str = ""
    size_bytes: int = 0
    error: str = ""
    created_at: str = field(default_factory=utcnow)
    updated_at: str = field(default_factory=utcnow)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Job:
    id: str
    title: str
    source_type: str
    source_name: str = ""
    text: str = ""
    font_id: str = ""
    paper_id: str = ""
    settings: dict[str, Any] = field(default_factory=dict)
    seed: int = 0
    status: str = "queued"
    phase: str = "排队中"
    progress: int = 0
    error: str = ""
    warning: str = ""
    page_count: int = 0
    char_count: int = 0
    unsupported: int = 0
    preview_urls: list[str] = field(default_factory=list)
    exports: dict[str, ExportRecord] = field(default_factory=dict)
    created_at: str = field(default_factory=utcnow)
    updated_at: str = field(default_factory=utcnow)

    def touch(self) -> None:
        self.updated_at = utcnow()

    def public_dict(self, include_text: bool = False) -> dict[str, Any]:
        data = {
            "id": self.id,
            "title": self.title,
            "source_type": self.source_type,
            "source_name": self.source_name,
            "font_id": self.font_id,
            "paper_id": self.paper_id,
            "settings": self.settings,
            "seed": self.seed,
            "status": self.status,
            "phase": self.phase,
            "progress": self.progress,
            "error": self.error,
            "warning": self.warning,
            "page_count": self.page_count,
            "char_count": self.char_count,
            "unsupported": self.unsupported,
            "preview_urls": self.preview_urls,
            "exports": {key: value.to_dict() for key, value in self.exports.items()},
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }
        if include_text:
            data["text"] = self.text
        return data


class JobStore:
    """Small filesystem-backed job store.

    Metadata is written atomically. A process-local lock is enough for the
    single-node deployment this project targets.
    """

    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        import threading

        self._lock = threading.RLock()

    def job_dir(self, job_id: str) -> Path:
        return self.root / job_id

    def create(self, job: Job) -> None:
        with self._lock:
            directory = self.job_dir(job.id)
            (directory / "preview").mkdir(parents=True, exist_ok=True)
            (directory / "export").mkdir(parents=True, exist_ok=True)
            self.save(job)

    def save(self, job: Job) -> None:
        with self._lock:
            directory = self.job_dir(job.id)
            directory.mkdir(parents=True, exist_ok=True)
            job.touch()
            payload = job.public_dict(include_text=True)
            tmp = directory / "job.json.tmp"
            tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            tmp.replace(directory / "job.json")

    def load(self, job_id: str) -> Job | None:
        with self._lock:
            path = self.job_dir(job_id) / "job.json"
            if not path.exists():
                return None
            try:
                raw = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                return None
            exports = {
                key: ExportRecord(**value) for key, value in (raw.pop("exports", {}) or {}).items()
            }
            job = Job(**raw)
            job.exports = exports
            return job

    def delete(self, job_id: str) -> None:
        import shutil

        with self._lock:
            shutil.rmtree(self.job_dir(job_id), ignore_errors=True)

    def cleanup(self, ttl_seconds: int) -> int:
        import time

        removed = 0
        now = time.time()
        with self._lock:
            for directory in self.root.iterdir():
                if not directory.is_dir():
                    continue
                meta = directory / "job.json"
                try:
                    age = now - meta.stat().st_mtime
                except OSError:
                    age = ttl_seconds + 1
                if age > ttl_seconds:
                    import shutil

                    shutil.rmtree(directory, ignore_errors=True)
                    removed += 1
        return removed
