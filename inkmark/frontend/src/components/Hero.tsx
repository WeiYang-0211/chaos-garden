import { ArrowDown, Feather, Sparkles } from "lucide-react";

export function Hero() {
  return (
    <section className="hero">
      <div className="hero-content">
        <div className="hero-eyebrow">
          <span className="eyebrow-line" />
          TEXT TO HANDWRITING
        </div>
        <h1>
          把文字，
          <br />
          写成<span className="ink-underline">手迹</span>。
        </h1>
        <p>
          选一种笔迹，铺一张纸，让每一个字都带上一点不完美的温度。
          <br />
          8 种开源手写字体 · 11 种纸张 · 300 / 600 DPI 无水印导出
        </p>
        <div className="hero-chips">
          <span>
            <Feather size={13} /> 真字体排版
          </span>
          <span>
            <Sparkles size={13} /> 随机涂改
          </span>
          <span>完全本地</span>
        </div>
      </div>
      <div className="hero-art" aria-hidden="true">
        <span className="hero-glyph">迹</span>
        <span className="hero-stamp">见字<br />如面</span>
        <div className="hero-rule">
          <span />
          <span />
          <span />
        </div>
      </div>
      <a className="hero-scroll" href="#studio-input" aria-label="开始创作">
        <ArrowDown size={15} />
      </a>
    </section>
  );
}
