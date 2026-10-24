import { Menu, ScanText, ShieldCheck, Sparkles } from "lucide-react";

type Props = {
  onMenu: () => void;
  fontCount: number;
  paperCount: number;
};

export function Topbar({ onMenu, fontCount, paperCount }: Props) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="icon-button mobile-menu" onClick={onMenu} aria-label="打开导航">
          <Menu size={19} />
        </button>
        <div className="crumbs">
          <span>创作台</span>
          <span className="crumb-slash">/</span>
          <strong>文字转手写</strong>
        </div>
      </div>
      <div className="topbar-right">
        <span className="top-chip">
          <ScanText size={14} /> {fontCount} 款字体 · {paperCount} 种纸张
        </span>
        <span className="top-chip hide-small">
          <ShieldCheck size={14} /> 无云端上传
        </span>
        <span className="top-badge">
          <Sparkles size={13} /> 全功能
        </span>
      </div>
    </header>
  );
}
