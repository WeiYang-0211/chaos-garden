import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  Download,
  FileArchive,
  FileText,
  Loader2,
  X,
} from "lucide-react";
import type { ExportRecord, Job } from "../types";
import { createExport, formatBytes, getExport } from "../api";

type Props = {
  open: boolean;
  job: Job | null;
  fontName: string;
  paperName: string;
  onClose: () => void;
  onToast: (message: string) => void;
};

export function DownloadDialog({ open, job, fontName, paperName, onClose, onToast }: Props) {
  const [format, setFormat] = useState<"zip" | "pdf">("zip");
  const [dpi, setDpi] = useState<300 | 600>(300);
  const [imageFormat, setImageFormat] = useState<"jpg" | "png">("jpg");
  const [exportRecord, setExportRecord] = useState<ExportRecord | null>(null);
  const [exportId, setExportId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setExportRecord(null);
    setExportId(null);
    setBusy(false);
    setError("");
  }, [open]);

  useEffect(() => {
    if (!open || !job || !exportId) return;
    let active = true;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const next = await getExport(job.id, exportId);
        if (!active) return;
        setExportRecord(next);
        if (next.status === "ready") {
          return;
        }
        if (next.status === "failed") {
          setBusy(false);
          setError(next.error || "导出失败，请重试。");
          return;
        }
        timer = window.setTimeout(tick, 900);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "查询导出状态失败");
      }
    };
    tick();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [open, job, exportId]);

  if (!open || !job) return null;

  async function submit() {
    if (!job) return;
    setBusy(true);
    setError("");
    try {
      const record = await createExport(job.id, { format, dpi, image_format: imageFormat });
      setExportRecord(record);
      setExportId(record.id);
      if (record.status === "failed") {
        setError(record.error || "导出失败");
        setBusy(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "导出失败");
      setBusy(false);
    }
  }

  const ready = exportRecord?.status === "ready" && exportRecord.file_url;
  const working = exportRecord && ["queued", "rendering", "packaging"].includes(exportRecord.status);
  const progress = exportRecord?.progress ?? 0;

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !working && onClose()}>
      <div className="download-dialog" role="dialog" aria-modal="true" aria-label="导出手迹">
        <div className="dialog-head">
          <div>
            <span className="dialog-kicker">EXPORT</span>
            <h3>导出手迹</h3>
            <p>源文件不含预览水印，分辨率越高，打印越清晰。</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭" disabled={Boolean(working)}>
            <X size={18} />
          </button>
        </div>

        <div className="format-row">
          <button className={`format-card ${format === "zip" ? "selected" : ""}`} onClick={() => setFormat("zip")}>
            <span className="format-icon"><FileArchive size={20} /></span>
            <strong>图片 ZIP</strong>
            <small>每页一张高清图，适合自己排版</small>
            {format === "zip" && <Check size={14} className="format-check" />}
          </button>
          <button className={`format-card ${format === "pdf" ? "selected" : ""}`} onClick={() => setFormat("pdf")}>
            <span className="format-icon"><FileText size={20} /></span>
            <strong>PDF 文档</strong>
            <small>按纸张尺寸拼好，直接打印或发送</small>
            {format === "pdf" && <Check size={14} className="format-check" />}
          </button>
        </div>

        <div className="option-block">
          <div className="option-label">
            <span>分辨率</span>
            <small>300 DPI 适合屏幕与普通打印，600 DPI 适合照片级打印</small>
          </div>
          <div className="segment">
            {[300, 600].map((value) => (
              <button
                key={value}
                className={dpi === value ? "active" : ""}
                onClick={() => setDpi(value as 300 | 600)}
              >
                {value} DPI
                <span>{value === 300 ? "均衡" : "超清"}</span>
              </button>
            ))}
          </div>
        </div>

        {format === "zip" && (
          <div className="option-block">
            <div className="option-label">
              <span>图片格式</span>
              <small>JPG 体积更小，PNG 更适合二次编辑</small>
            </div>
            <div className="segment compact">
              {(["jpg", "png"] as const).map((value) => (
                <button
                  key={value}
                  className={imageFormat === value ? "active" : ""}
                  onClick={() => setImageFormat(value)}
                >
                  {value.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="export-summary">
          <div>
            <span>文件</span>
            <strong>{job.title} · {job.page_count} 页</strong>
          </div>
          <div>
            <span>字体 / 纸张</span>
            <strong>{fontName} / {paperName}</strong>
          </div>
          <div>
            <span>种子</span>
            <strong className="mono">{job.seed}</strong>
          </div>
        </div>

        {error && (
          <div className="dialog-error">
            <AlertCircle size={15} /> {error}
          </div>
        )}

        {working && (
          <div className="export-progress">
            <div className="export-progress-head">
              <span><Loader2 size={14} className="spin" /> {exportRecord?.phase || "正在导出"}</span>
              <strong>{progress}%</strong>
            </div>
            <div className="progress-track">
              <span style={{ width: `${Math.max(3, progress)}%` }} />
            </div>
          </div>
        )}

        {ready && (
          <a className="download-ready" href={exportRecord.file_url} download onClick={() => onToast("已开始下载")}>
            <span className="ready-icon"><Check size={18} /></span>
            <span>
              <strong>文件已准备好</strong>
              <small>{exportRecord.filename} · {formatBytes(exportRecord.size_bytes)}</small>
            </span>
            <Download size={18} />
          </a>
        )}

        <div className="dialog-actions">
          <button className="ghost-button" onClick={onClose} disabled={Boolean(working)}>
            {ready ? "完成" : "取消"}
          </button>
          {!ready && (
            <button className="primary-button" onClick={submit} disabled={busy || Boolean(working)}>
              {busy || working ? <><Loader2 size={16} className="spin" /> 正在导出</> : <><Download size={16} /> 开始导出</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
