import { useRef, useState } from "react";
import { FileText, Image as ImageIcon, Paperclip, Quote, Type, Upload, X } from "lucide-react";
import type { Sample } from "../types";

type Props = {
  mode: "text" | "file";
  onMode: (mode: "text" | "file") => void;
  text: string;
  onText: (text: string) => void;
  file: File | null;
  onFile: (file: File | null) => void;
  samples: Sample[];
  maxChars: number;
  onError: (message: string) => void;
};

const ACCEPT = ".txt,.docx,.pdf,.png,.jpg,.jpeg,.webp,.bmp";
const ALLOWED = ["txt", "docx", "pdf", "png", "jpg", "jpeg", "webp", "bmp"];

export function InputPanel({ mode, onMode, text, onText, file, onFile, samples, maxChars, onError }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function acceptFile(next: File | null) {
    if (!next) {
      onFile(null);
      return;
    }
    const extension = next.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED.includes(extension)) {
      onError("支持 .txt、.docx、.pdf、.png、.jpg、.jpeg、.webp 文件。");
      return;
    }
    if (next.size > 20 * 1024 * 1024) {
      onError("文件超过 20MB，请压缩后再上传。");
      return;
    }
    onFile(next);
  }

  return (
    <section className="panel input-panel" id="studio-input">
      <div className="section-head">
        <div className="section-heading">
          <span className="step-num">01</span>
          <div>
            <h2>输入文字</h2>
            <p>粘贴一段话，或上传文档、图片，让文字落到纸上。</p>
          </div>
        </div>
        <span className="section-meta">{text.length.toLocaleString("zh-CN")} / {maxChars.toLocaleString("zh-CN")}</span>
      </div>

      <div className="input-tabs" role="tablist">
        <button className={mode === "text" ? "active" : ""} onClick={() => onMode("text")} role="tab">
          <Type size={15} /> 直接输入
        </button>
        <button className={mode === "file" ? "active" : ""} onClick={() => onMode("file")} role="tab">
          <Upload size={15} /> 上传文件
        </button>
      </div>

      {mode === "text" ? (
        <>
          <div className={`textarea-shell ${text.length > maxChars ? "over-limit" : ""}`}>
            <textarea
              value={text}
              onChange={(event) => onText(event.target.value)}
              placeholder={"见字如面。\n\n把想写的话放在这里，剩下的交给纸和笔。"}
              spellCheck={false}
              rows={8}
            />
            <div className="textarea-foot">
              <span>支持换行、段落与中英文混排</span>
              <span className="char-count">{text.length.toLocaleString("zh-CN")} 字</span>
            </div>
          </div>
          <div className="sample-row">
            <span className="sample-label">
              <Quote size={13} /> 没有灵感？
            </span>
            {samples.map((sample) => (
              <button
                key={sample.label}
                className="sample-chip"
                onClick={() => onText(sample.text)}
                title={sample.text.slice(0, 80)}
              >
                {sample.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div
          className={`dropzone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            acceptFile(event.dataTransfer.files?.[0] ?? null);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(event) => acceptFile(event.target.files?.[0] ?? null)}
          />
          {file ? (
            <div className="file-card" onClick={(event) => event.stopPropagation()}>
              <span className="file-icon">
                {/\.(png|jpe?g|webp|bmp)$/i.test(file.name) ? <ImageIcon size={20} /> : <FileText size={20} />}
              </span>
              <div className="file-info">
                <strong>{file.name}</strong>
                <span>{(file.size / 1024 / 1024).toFixed(2)} MB · 将在生成时提取文字</span>
              </div>
              <button
                className="icon-button"
                aria-label="移除文件"
                onClick={() => {
                  onFile(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <>
              <span className="drop-icon">
                <Paperclip size={22} />
              </span>
              <strong>把文件拖到这里，或点击选择</strong>
              <span className="drop-hint">.docx / .pdf / .png / .jpg / .txt，最大 20MB</span>
              <span className="drop-note">PDF 与图片会在本地 OCR，Word 会保留段落与表格文字</span>
            </>
          )}
        </div>
      )}
    </section>
  );
}
