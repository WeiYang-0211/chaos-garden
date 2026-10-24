import { Check, Printer, Sparkles } from "lucide-react";
import type { PaperSpec } from "../types";

type Props = {
  papers: PaperSpec[];
  selected: string;
  onSelect: (id: string) => void;
};

export function PaperPicker({ papers, selected, onSelect }: Props) {
  return (
    <section className="panel" id="papers">
      <div className="section-head">
        <div className="section-heading">
          <span className="step-num">03</span>
          <div>
            <h2>铺一张纸</h2>
            <p>实拍纸张有桌面的光，可打印纸张适合真的印出来。</p>
          </div>
        </div>
        <span className="section-meta">{papers.length} 种</span>
      </div>

      <div className="paper-grid">
        {papers.map((paper) => {
          const active = selected === paper.id;
          return (
            <button
              key={paper.id}
              className={`paper-card ${active ? "selected" : ""}`}
              onClick={() => onSelect(paper.id)}
              title={paper.description}
            >
              <div className="paper-thumb">
                <img src={paper.thumbnail_url} alt={`${paper.name} 纸张示例`} loading="lazy" />
                {paper.badge && <span className="paper-badge">{paper.badge}</span>}
                {active && (
                  <span className="paper-check">
                    <Check size={12} strokeWidth={2.6} />
                  </span>
                )}
                {paper.printable && (
                  <span className="print-mark">
                    <Printer size={11} />
                  </span>
                )}
              </div>
              <div className="paper-caption">
                <strong>{paper.name}</strong>
                <span>{paper.subtitle}</span>
              </div>
            </button>
          );
        })}
      </div>
      <div className="section-note">
        <Sparkles size={13} />
        实拍系列包含桌面、装订孔与纸张阴影；导出时会一起保留。
      </div>
    </section>
  );
}
