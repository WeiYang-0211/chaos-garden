import { Check, Sparkles } from "lucide-react";
import type { FontSpec } from "../types";

type Props = {
  fonts: FontSpec[];
  selected: string;
  onSelect: (id: string) => void;
};

export function FontPicker({ fonts, selected, onSelect }: Props) {
  return (
    <section className="panel" id="fonts">
      <div className="section-head">
        <div className="section-heading">
          <span className="step-num">02</span>
          <div>
            <h2>选择一种笔迹</h2>
            <p>每一款都是真实的手写字体，不是印刷体变形。</p>
          </div>
        </div>
        <span className="section-meta">{fonts.length} 款</span>
      </div>

      <div className="font-grid">
        {fonts.map((font) => {
          const active = selected === font.id;
          return (
            <button
              key={font.id}
              className={`font-card ${active ? "selected" : ""} ${!font.available ? "disabled" : ""}`}
              onClick={() => font.available && onSelect(font.id)}
              disabled={!font.available}
              title={font.description}
            >
              <div className="font-sample">
                <img src={font.sample_url} alt={`${font.name} 字体示例`} loading="lazy" />
                {active && (
                  <span className="selected-check">
                    <Check size={12} strokeWidth={2.6} />
                  </span>
                )}
              </div>
              <div className="font-caption">
                <div className="font-name-row">
                  <strong>{font.name}</strong>
                  <span>{font.weight}</span>
                </div>
                <span className="font-sub">{font.subtitle}</span>
                <div className="tag-row">
                  {font.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className="mini-tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="section-note">
        <Sparkles size={13} />
        字体来自开源项目，可商用；具体授权协议见项目 README。
      </div>
    </section>
  );
}
