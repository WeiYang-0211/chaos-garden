import { useState } from "react";
import type { CSSProperties } from "react";
import { ChevronDown, Dices, Droplets, SlidersHorizontal, TriangleAlert } from "lucide-react";
import type { Ink, Settings } from "../types";

type Props = {
  settings: Settings;
  onSettings: (settings: Settings) => void;
  inks: Ink[];
  ranges: Record<string, [number, number]>;
  seed: number;
  onSeed: (seed: number) => void;
};

function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  hint?: string;
  onChange: (value: number) => void;
}) {
  const percent = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider-field">
      <div className="slider-head">
        <label>{label}</label>
        <span className="slider-value">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--range-progress": `${percent}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="slider-scale">
        <span>0%</span>
        {hint && <span className="slider-hint">{hint}</span>}
        <span>100%</span>
      </div>
    </div>
  );
}

export function Controls({ settings, onSettings, inks, ranges, seed, onSeed }: Props) {
  const [advanced, setAdvanced] = useState(false);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onSettings({ ...settings, [key]: value });
  const high = settings.messiness >= 30 || settings.stroke_random >= 30 || settings.mistake_rate >= 30;

  return (
    <section className="panel" id="details">
      <div className="section-head">
        <div className="section-heading">
          <span className="step-num">04</span>
          <div>
            <h2>加一点不完美</h2>
            <p>轻微的错位、涂改和笔画抖动，才是手写的样子。</p>
          </div>
        </div>
        <span className="section-meta">
          <SlidersHorizontal size={14} /> 细节
        </span>
      </div>

      <div className="slider-grid">
        <SliderField
          label="随机涂改"
          value={settings.mistake_rate}
          min={ranges.mistake_rate?.[0] ?? 0}
          max={ranges.mistake_rate?.[1] ?? 100}
          hint="推荐 3%"
          onChange={(value) => set("mistake_rate", value)}
        />
        <SliderField
          label="文字位置凌乱"
          value={settings.messiness}
          min={ranges.messiness?.[0] ?? 0}
          max={ranges.messiness?.[1] ?? 100}
          hint="推荐 6%"
          onChange={(value) => set("messiness", value)}
        />
        <SliderField
          label="笔画抖动"
          value={settings.stroke_random}
          min={ranges.stroke_random?.[0] ?? 0}
          max={ranges.stroke_random?.[1] ?? 100}
          hint="推荐 5%"
          onChange={(value) => set("stroke_random", value)}
        />
      </div>

      {high && (
        <div className="inline-warning">
          <TriangleAlert size={15} />
          参数偏高会让文字变得难以辨认，建议先试 5% 左右。
        </div>
      )}

      <button className={`advanced-toggle ${advanced ? "open" : ""}`} onClick={() => setAdvanced((value) => !value)}>
        <span>
          <SlidersHorizontal size={15} /> 高级设置
        </span>
        <span className="advanced-hint">字号 · 行距 · 倾斜 · 墨色 · 种子</span>
        <ChevronDown size={16} className="chevron" />
      </button>

      {advanced && (
        <div className="advanced-body">
          <div className="advanced-row">
            <SliderField
              label="字号"
              value={Math.round(settings.font_size * 100)}
              min={Math.round((ranges.font_size?.[0] ?? 0.72) * 100)}
              max={Math.round((ranges.font_size?.[1] ?? 1.45) * 100)}
              suffix="%"
              onChange={(value) => set("font_size", value / 100)}
            />
            <SliderField
              label="行距"
              value={Math.round(settings.line_spacing * 100)}
              min={Math.round((ranges.line_spacing?.[0] ?? 0.85) * 100)}
              max={Math.round((ranges.line_spacing?.[1] ?? 1.45) * 100)}
              suffix="%"
              onChange={(value) => set("line_spacing", value / 100)}
            />
          </div>

          <div className="advanced-divider" />

          <div className="inline-control">
            <div className="inline-control-label">
              <span>倾斜角度</span>
              <small>负值向左，正值向右</small>
            </div>
            <div className="slant-control">
              <input
                type="range"
                min={ranges.slant?.[0] ?? -8}
                max={ranges.slant?.[1] ?? 8}
                step={0.5}
                value={settings.slant}
                style={{ "--range-progress": `${((settings.slant + 8) / 16) * 100}%` } as CSSProperties}
                onChange={(event) => set("slant", Number(event.target.value))}
              />
              <span>{settings.slant > 0 ? "+" : ""}{settings.slant}°</span>
            </div>
          </div>

          <div className="inline-control">
            <div className="inline-control-label">
              <span>
                <Droplets size={14} /> 墨色
              </span>
              <small>不同纸张适合不同墨色</small>
            </div>
            <div className="ink-row">
              {inks.map((ink) => (
                <button
                  key={ink.id}
                  className={`ink-swatch ${settings.ink.toLowerCase() === ink.value.toLowerCase() ? "selected" : ""}`}
                  style={{ "--ink-color": ink.value } as CSSProperties}
                  onClick={() => set("ink", ink.value)}
                  title={ink.name}
                  aria-label={ink.name}
                />
              ))}
            </div>
          </div>

          <div className="inline-control">
            <div className="inline-control-label">
              <span>随机种子</span>
              <small>同一个种子会得到同一页手迹</small>
            </div>
            <div className="seed-control">
              <input
                type="number"
                value={seed}
                onChange={(event) => onSeed(Math.max(1, Number(event.target.value) || 1))}
              />
              <button className="icon-button" onClick={() => onSeed(Math.floor(Math.random() * 2_000_000_000) + 1)} title="随机种子">
                <Dices size={17} />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
