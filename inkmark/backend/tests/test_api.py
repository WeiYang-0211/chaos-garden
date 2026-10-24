from __future__ import annotations

import time

from fastapi.testclient import TestClient

from app.main import app


def test_health_and_catalog():
    with TestClient(app) as client:
        health = client.get("/api/health")
        assert health.status_code == 200
        assert health.json()["fonts"] == 8
        catalog = client.get("/api/catalog")
        assert catalog.status_code == 200
        data = catalog.json()
        assert len(data["fonts"]) == 8
        assert len(data["papers"]) == 11


def test_text_job_preview_and_cleanup():
    with TestClient(app) as client:
        response = client.post(
            "/api/jobs",
            data={
                "mode": "text",
                "text": "见字如面。这是一次接口测试，山有木兮木有枝。",
                "font_id": "xiaolai",
                "paper_id": "notebook",
                "seed": "123456",
            },
        )
        assert response.status_code == 200, response.text
        job_id = response.json()["job_id"]
        job = None
        for _ in range(40):
            time.sleep(0.2)
            status = client.get(f"/api/jobs/{job_id}")
            assert status.status_code == 200, status.text
            job = status.json()
            if job["status"] in {"ready", "failed"}:
                break
        assert job is not None
        assert job["status"] == "ready", job
        assert job["page_count"] >= 1
        preview = client.get(job["preview_urls"][0])
        assert preview.status_code == 200
        assert preview.headers["content-type"].startswith("image/jpeg")
        deleted = client.delete(f"/api/jobs/{job_id}")
        assert deleted.status_code == 200
