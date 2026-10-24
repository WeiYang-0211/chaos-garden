import type { Catalog, CreateJobInput, ExportRecord, Job } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let message = `请求失败（${response.status}）`;
    try {
      const data = await response.json();
      if (typeof data?.detail === "string") message = data.detail;
      else if (Array.isArray(data?.detail)) message = data.detail.map((item: { msg?: string }) => item.msg).join("；");
    } catch {
      const text = await response.text().catch(() => "");
      if (text) message = text;
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export function getCatalog(): Promise<Catalog> {
  return request<Catalog>("/api/catalog");
}

export function createJob(input: CreateJobInput): Promise<{ job_id: string; status: string; seed: number }> {
  const body = new FormData();
  body.append("mode", input.mode);
  body.append("text", input.text);
  body.append("title", input.title);
  body.append("font_id", input.fontId);
  body.append("paper_id", input.paperId);
  body.append("font_size", String(input.settings.font_size));
  body.append("line_spacing", String(input.settings.line_spacing));
  body.append("messiness", String(input.settings.messiness));
  body.append("stroke_random", String(input.settings.stroke_random));
  body.append("mistake_rate", String(input.settings.mistake_rate));
  body.append("slant", String(input.settings.slant));
  body.append("ink", input.settings.ink);
  body.append("seed", String(input.seed));
  if (input.file) body.append("file", input.file);
  return request<{ job_id: string; status: string; seed: number }>("/api/jobs", {
    method: "POST",
    body,
  });
}

export function getJob(id: string, includeText = false): Promise<Job> {
  return request<Job>(`/api/jobs/${encodeURIComponent(id)}${includeText ? "?include_text=true" : ""}`);
}

export function createExport(
  jobId: string,
  payload: { format: "zip" | "pdf"; dpi: 300 | 600; image_format: "jpg" | "png" },
): Promise<ExportRecord> {
  return request<ExportRecord>(`/api/jobs/${encodeURIComponent(jobId)}/exports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getExport(jobId: string, exportId: string): Promise<ExportRecord> {
  return request<ExportRecord>(`/api/jobs/${encodeURIComponent(jobId)}/exports/${encodeURIComponent(exportId)}`);
}

export function previewUrl(jobId: string, page: number, version: string): string {
  return `/api/jobs/${encodeURIComponent(jobId)}/preview/${page}?v=${encodeURIComponent(version)}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
