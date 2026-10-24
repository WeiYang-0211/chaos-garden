import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Loader2,
  Maximize2,
  RefreshCw,
  ScanText,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import type { FontSpec, Job, PaperSpec } from "../types";
import { previewUrl } from "../api";

type Props = {
  job: Job | null;
  font: FontSpec | undefined;
  paper: PaperSpec | undefined;
  page: number;
  onPage: (page: number) => void;
  generating: boolean;
  stale: boolean;
  onGenerate: () => void;
  onReroll: () => void;
  onDownload: () => void;
  onShowText: () => void;
};

function ProgressOrb({ progress }: { progress: number }) {
  return (
    <div className="progress-orb" style={{ "--progress": `${progress * 3.6}deg` } as CSSProperties}>
      <div className="progress-orb-inner">
        <strong>{progress}</strong>
        <span>%</span>
      </div>
    </div>
  );
}

export function PreviewPanel({
  job,
  font,
  paper,
  page,
  onPage,
  generating,
  stale,
  onGenerate,
  onReroll,
  onDownload,
  onShowText,
}: Props) {
  const [zoomOpen, setZoomOpen] = useState(false);

  useEffect(() => {
    if (!zoomOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomOpen]);

  const ready = job?.status === "ready" && job.preview_urls.length > 0;
  const processing = generating || (job && !["ready", "failed"].includes(job.status));
  const currentPage = Math.min(Math.max(page, 0), Math.max(0, (job?.page_count ?? 1) - 1));
  const imageUrl = job && ready ? previewUrl(job.id, currentPage + 1, job.updated_at) : "";

  return (
    <aside className="preview-panel">
      <div className="preview-head">
        <div className="preview-title">
          <span className={`status-dot ${ready ? "ready" : processing ? "working" : job?.status === "failed" ? "error" : ""}`} />
          <div>
            <h2>预览</h2>
            <span>{ready ? "所见即所得 · 已加水印" : processing ? "正在落笔…" : "等待一张纸"}</span>
          </div>
        </div>
        <div className="preview-actions">
          {ready && (
            <>
              <button className="ghost-button compact" onClick={onReroll} title="换一个随机种子">
                <RefreshCw size={14} /> 换一种手写
              </button>
              <button className="icon-button light" onClick={() => setZoomOpen(true)} title="放大预览">
                <Maximize2 size={16} />
              </button>
            </>
          )}
        </div>
      </div>

      {stale && ready && (
        <div className="stale-banner">
          <Sparkles size={14} />
          参数已改动，当前仍是上一次的预览
          <button onClick={onGenerate}>重新生成</button>
        </div>
      )}

      <div className={`preview-stage ${ready ? "has-image" : ""}`}>
        {ready ? (
          <div className="preview-paper-wrap">
            <img src={imageUrl} alt={`手写稿第 ${currentPage + 1} 页预览`} className="preview-image" />
            {job.page_count > 1 && (
              <div className="page-floating">
                <button className="page-btn" onClick={() => onPage(Math.max(0, currentPage - 1))} disabled={currentPage === 0}>
                  <ChevronLeft size={15} />
                </button>
                <span>
                  {currentPage + 1} <i>/</i> {job.page_count}
                </span>
                <button
                  className="page-btn"
                  onClick={() => onPage(Math.min(job.page_count - 1, currentPage + 1))}
                  disabled={currentPage >= job.page_count - 1}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>
        ) : processing ? (
          <div className="preview-loading">
            <ProgressOrb progress={Math.max(4, Math.round(job?.progress ?? 4))} />
            <strong>{job?.phase || "正在准备纸墨"}</strong>
            <p>正在服务端渲染高清页面，请稍候。</p>
            <div className="loading-lines">
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        ) : job?.status === "failed" ? (
          <div className="preview-error">
            <span className="error-orb">
              <AlertCircle size={22} />
            </span>
            <strong>这一页没有写成</strong>
            <p>{job.error || "生成失败，请检查输入后重试。"}</p>
            <button className="primary-button small" onClick={onGenerate}>
              再试一次
            </button>
          </div>
        ) : (
          <div className="preview-empty">
            <div className="empty-paper-stack" aria-hidden="true">
              <span className="empty-sheet back-two" />
              <span className="empty-sheet back-one" />
              <span className="empty-sheet front">
                <span className="empty-watermark">手迹</span>
                <span className="empty-lines">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </span>
            </div>
            <div className="empty-copy">
              <span className="empty-kicker">YOUR FIRST PAGE</span>
              <strong>左边写点什么，<br />这里就会出现一页手迹。</strong>
              <p>选好字体和纸张，点击「生成预览」。第一版通常只要两秒。</p>
              <button className="primary-button" onClick={onGenerate}>
                <WandSparkles size={16} /> 生成第一页
              </button>
            </div>
          </div>
        )}

        {ready && (
          <div className="preview-corner">
            <Eye size={13} /> 预览压缩图
          </div>
        )}
      </div>

      {ready && job && (
        <>
          <div className="preview-meta">
            <div className="meta-pair">
              <span>字体</span>
              <strong>{font?.name ?? job.font_id}</strong>
            </div>
            <div className="meta-pair">
              <span>纸张</span>
              <strong>{paper?.name ?? job.paper_id}</strong>
            </div>
            <div className="meta-pair">
              <span>页数 / 字数</span>
              <strong>{job.page_count} 页 · {job.char_count} 字</strong>
            </div>
            <div className="meta-pair">
              <span>种子</span>
              <strong className="mono">{job.seed}</strong>
            </div>
          </div>

          {job.warning && (
            <div className="preview-warning">
              <AlertCircle size={14} /> {job.warning}
            </div>
          )}

          <div className="preview-footer">
            <div className="preview-note">
              <span className="check-badge"><Check size={12} /></span>
              预览已压缩并加水印，下载版本为原始分辨率、无水印。
            </div>
            <div className="preview-buttons">
              {job.source_type !== "text" && (
                <button className="ghost-button" onClick={onShowText}>
                  <FileText size={15} /> 识别文本
                </button>
              )}
              <button className="primary-button" onClick={onDownload}>
                <ArrowDownToLine size={16} /> 下载手迹
              </button>
            </div>
          </div>
        </>
      )}

      {!ready && !processing && (
        <div className="preview-foot-note">
          <ScanText size={14} />
          支持 Word / PDF / 图片 OCR，所有处理都在本机完成。
        </div>
      )}

      {zoomOpen && imageUrl && (
        <div className="zoom-overlay" onClick={() => setZoomOpen(false)}>
          <button className="zoom-close" aria-label="关闭">
            <X size={20} />
          </button>
          <img src={imageUrl} alt="手写稿放大预览" onClick={(event) => event.stopPropagation()} />
        </div>
      )}

      {processing && (
        <div className="preview-status-bar">
          <Loader2 size={13} className="spin" />
          {job?.phase || "准备中"}
        </div>
      )}
    </aside>
  );
}
