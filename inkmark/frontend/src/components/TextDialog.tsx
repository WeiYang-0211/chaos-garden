import { useEffect, useState } from "react";
import { AlertCircle, FileText, Sparkles, X } from "lucide-react";

type Props = {
  open: boolean;
  text: string;
  warning: string;
  onClose: () => void;
  onUse: (text: string) => void;
};

export function TextDialog({ open, text, warning, onClose, onUse }: Props) {
  const [draft, setDraft] = useState(text);
  useEffect(() => {
    if (open) setDraft(text);
  }, [open, text]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="text-dialog" role="dialog" aria-modal="true" aria-label="识别文本">
        <div className="dialog-head">
          <div>
            <span className="dialog-kicker">EXTRACTED TEXT</span>
            <h3>识别出来的文字</h3>
            <p>OCR 与 PDF 提取可能有错字，改好后再生成会更像你想要的那一页。</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="text-dialog-icon">
          <FileText size={18} />
          <span>识别结果可以自由修改，不会影响原文件。</span>
        </div>
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={14} />
        {warning && (
          <div className="dialog-error soft">
            <AlertCircle size={15} /> {warning}
          </div>
        )}
        <div className="dialog-actions">
          <button className="ghost-button" onClick={onClose}>取消</button>
          <button className="primary-button" onClick={() => onUse(draft)}>
            <Sparkles size={16} /> 用这段文字重新生成
          </button>
        </div>
      </div>
    </div>
  );
}
