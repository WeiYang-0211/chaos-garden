import { BookOpen, Feather, Github, Layers, PenLine, Sparkles } from "lucide-react";

type Props = {
  active: string;
  onNavigate: (id: string) => void;
  onGuide: () => void;
};

const nav = [
  { id: "studio", label: "创作台", hint: "写一页手迹", icon: PenLine },
  { id: "fonts", label: "字体与纸张", hint: "挑一种笔迹", icon: Feather },
  { id: "details", label: "手写细节", hint: "让它更像真的", icon: Layers },
];

export function Sidebar({ active, onNavigate, onGuide }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <button className="brand" onClick={() => onNavigate("studio")} aria-label="回到创作台">
          <span className="brand-seal">手</span>
          <span className="brand-type">
            <strong>手迹</strong>
            <small>INKMARK</small>
          </span>
        </button>

        <div className="sidebar-label">创作</div>
        <nav className="side-nav" aria-label="主导航">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`side-nav-item ${active === item.id ? "active" : ""}`}
                onClick={() => onNavigate(item.id)}
              >
                <span className="side-nav-icon">
                  <Icon size={17} strokeWidth={1.6} />
                </span>
                <span className="side-nav-copy">
                  <span>{item.label}</span>
                  <small>{item.hint}</small>
                </span>
                {active === item.id && <span className="active-mark" />}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-label spaced">阅读</div>
        <button className="side-nav-item" onClick={onGuide}>
          <span className="side-nav-icon">
            <BookOpen size={17} strokeWidth={1.6} />
          </span>
          <span className="side-nav-copy">
            <span>使用说明</span>
            <small>字体、纸张与导出</small>
          </span>
        </button>
      </div>

      <div className="sidebar-bottom">
        <div className="local-card">
          <div className="local-card-head">
            <Sparkles size={15} />
            <span>本地全功能版</span>
          </div>
          <p>无需登录，预览与导出都在你自己的机器上完成。</p>
          <div className="local-status">
            <span className="pulse-dot" />
            服务运行中
          </div>
        </div>
        <div className="sidebar-foot">
          <span>v1.0 · 开源字体</span>
          <a href="https://github.com/lxgw/LxgwWenKai" target="_blank" rel="noreferrer" aria-label="字体项目">
            <Github size={14} />
          </a>
        </div>
      </div>
    </aside>
  );
}
