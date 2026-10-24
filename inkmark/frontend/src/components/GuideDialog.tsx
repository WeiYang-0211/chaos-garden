import { BookOpen, CheckCircle2, FileText, ScanText, ShieldCheck, Sparkles, X } from "lucide-react";

type Props = { open: boolean; onClose: () => void };

const steps = [
  { icon: FileText, title: "输入或上传", text: "粘贴文字，或上传 .docx / .pdf / 图片。PDF 和图片会在本机 OCR。" },
  { icon: Sparkles, title: "挑一种笔迹", text: "8 款开源手写字体，从日常中性笔到毛笔、草书都有。" },
  { icon: CheckCircle2, title: "生成预览", text: "服务端按字格排版，叠加涂改与位置抖动，输出带水印的预览。" },
  { icon: ShieldCheck, title: "导出无水印", text: "同一颗随机种子保证预览与导出完全一致，可选 300/600 DPI。" },
];

export function GuideDialog({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="guide-dialog" role="dialog" aria-modal="true" aria-label="使用说明">
        <div className="dialog-head">
          <div>
            <span className="dialog-kicker">HOW IT WORKS</span>
            <h3>把手写，做得像一点</h3>
            <p>这不是 AI 画字，而是字体、纸纹、排版与随机瑕疵的合成。</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="guide-steps">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div className="guide-step" key={step.title}>
                <span className="guide-step-num">0{index + 1}</span>
                <span className="guide-step-icon"><Icon size={18} /></span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.text}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="guide-tips">
          <h4><BookOpen size={15} /> 让效果更自然</h4>
          <ul>
            <li>涂改 3%、凌乱 6%、笔画抖动 5% 是一个很好的起点。</li>
            <li>实拍纸适合屏幕与照片；要打印就选「可打印」纸张。</li>
            <li>同一个种子会得到同一页；换种子即可换一种手气。</li>
            <li>不支持的生僻字会留空，换一款字体可能就能写出来。</li>
          </ul>
        </div>
        <div className="guide-license">
          <ScanText size={15} />
          字体来自 Google Fonts、霞鹜文楷、小赖字体、悠哉字体、辰宇落雁体等开源项目，均为 SIL OFL 1.1 授权。纸张纹理由程序生成，可自由使用。
        </div>
        <div className="dialog-actions">
          <button className="primary-button" onClick={onClose}>开始写一页</button>
        </div>
      </div>
    </div>
  );
}
