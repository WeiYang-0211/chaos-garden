import { POEMS } from "../data/poetry.js";
import { IDIOMS } from "../data/idioms.js";
import { CHAIN_CORE } from "../core/idioms.js";
import { h, formatDate } from "./dom.js";

const MODE_META = {
  debate: {
    index: "壹",
    kicker: "舌战 · DEBATE",
    title: "以理相争",
    glyph: "辩",
    description: "两台机器就同一命题，立论、驳论、结辩。裁判退席，落槌，胜负由理。",
    meta: ["六阵或十阵", "正方 / 反方", "结构化判词"],
    cta: "设局 · 舌战",
  },
  poetry: {
    index: "贰",
    kicker: "诗战 · FEIHUALING",
    title: "以诗相和",
    glyph: "令",
    description: "抽一字为令，轮流诵句。接不上、重复、失律，即判负；库外名句标为待考。",
    meta: ["八至十六句", "本地诗库校验", "令字与诗人"],
    cta: "设局 · 飞花令",
  },
  chain: {
    index: "叁",
    kicker: "斗口 · IDIOM CHAIN",
    title: "以字相接",
    glyph: "接",
    description: "上一句的末字，是下一句的首字。四字成语，首尾相衔，接不上即断。",
    meta: ["八至十六回", "首尾同字", "可接词库校验"],
    cta: "设局 · 成语接龙",
  },
};

function modeCard(mode, onMode) {
  const meta = MODE_META[mode];
  return h(
    "article",
    { class: `mode-card mode-card--${mode}` },
    h("span", { class: "mode-card__index" }, meta.index),
    h("span", { class: "mode-card__glyph", "aria-hidden": "true" }, meta.glyph),
    h(
      "div",
      { class: "mode-card__content" },
      h("span", { class: "mode-card__kicker" }, meta.kicker),
      h("h3", { class: "mode-card__title" }, meta.title),
      h("p", { class: "mode-card__desc" }, meta.description),
      h(
        "ul",
        { class: "mode-card__meta" },
        ...meta.meta.map((item) => h("li", null, item))
      ),
      h("span", { class: "mode-card__cta" }, meta.cta, h("i", { "aria-hidden": "true" }, "→"))
    ),
    h(
      "button",
      {
        type: "button",
        class: "mode-card__hit",
        "aria-label": meta.cta,
        onClick: () => onMode(mode),
      }
    )
  );
}

function historyRow(entry) {
  const isDebate = entry.mode === "debate";
  const isChain = entry.mode === "chain";
  const modeLabel = isDebate ? "舌战" : isChain ? "斗口" : "诗战";
  const winner =
    entry.winner === "draw"
      ? "和"
      : entry.winner === "A"
        ? `${entry.fighters?.A?.name || "正方"} 胜`
        : `${entry.fighters?.B?.name || "反方"} 胜`;
  return h(
    "div",
    { class: "history-row" },
    h("span", { class: `history-mode history-mode--${entry.mode}` }, modeLabel),
    h(
      "div",
      { class: "history-title-wrap" },
      h("strong", { class: "history-title" }, entry.title),
      h("span", { class: "history-sub" }, entry.subtitle || "")
    ),
    h(
      "div",
      { class: "history-fighters" },
      h("span", null, entry.fighters?.A?.name || "正方"),
      h("i", null, "对"),
      h("span", null, entry.fighters?.B?.name || "反方")
    ),
    h("span", { class: `history-winner ${entry.winner === "draw" ? "is-draw" : ""}` }, winner),
    h("span", { class: "history-date" }, formatDate(entry.timestamp))
  );
}

function enginePill(settings, onSettings) {
  const online = settings.engine === "llm";
  const localEndpoint = /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])/i.test(settings.endpoint || "");
  const configured = !online || Boolean(settings.apiKey?.trim()) || localEndpoint;
  return h(
    "button",
    {
      type: "button",
      class: `engine-pill ${online ? "is-llm" : "is-local"} ${configured ? "" : "is-unset"}`,
      onClick: onSettings,
      title: "模型与设置",
    },
    h("span", { class: "engine-pill__dot", "aria-hidden": "true" }),
    h("span", { class: "engine-pill__label" }, online ? "在线模型" : "本地推演"),
    h("span", { class: "engine-pill__detail" }, online ? settings.modelA || "未配置" : "零配置")
  );
}

export function createLobby({ settings, history, onMode, onSettings, onClearHistory }) {
  const page = h(
    "div",
    { class: "site" },
    h(
      "header",
      { class: "site-header" },
      h(
        "div",
        { class: "shell shell--wide header-inner" },
        h(
          "a",
          { class: "brand", href: "#top", "aria-label": "斗文台首页" },
          h("span", { class: "seal seal--small" }, "斗"),
          h(
            "span",
            { class: "brand-word" },
            h("strong", null, "斗文台"),
            h("small", null, "DOUWEN ARENA")
          )
        ),
        h(
          "nav",
          { class: "site-nav", "aria-label": "主导航" },
          h("a", { class: "is-active", href: "#top" }, "门厅"),
          h("a", { href: "#modes" }, "赛制"),
          h("a", { href: "#history" }, "往战")
        ),
        h(
          "div",
          { class: "header-actions" },
          enginePill(settings, onSettings),
          h(
            "button",
            { type: "button", class: "button button--ghost button--small nav-settings", onClick: onSettings },
            "模型设置"
          )
        )
      )
    ),

    h(
      "main",
      { id: "top" },
      h(
        "div",
        { class: "shell shell--wide" },
        h(
          "section",
          { class: "hero" },
          h("span", { class: "vertical-note", "aria-hidden": "true" }, "以文会友 · 以理相争"),
          h(
            "div",
            { class: "hero-copy reveal reveal--1" },
            h(
              "p",
              { class: "eyebrow hero-eyebrow" },
              h("span", { class: "eyebrow-line" }),
              h("span", null, "DOUWEN ARENA / 人机文斗观测站")
            ),
            h(
              "h1",
              { class: "hero-title", "aria-label": "斗文台" },
              h("span", { class: "hero-title__main" }, "斗文"),
              h("span", { class: "hero-title__seal" }, "台"),
              h("span", { class: "hero-title__sup" }, "AI", h("em", null, "互斗"))
            ),
            h(
              "p",
              { class: "hero-lead" },
              "两台机器，一张桌案。",
              h("br"),
              "以理相争，以诗相和，以字相接。"
            ),
            h(
              "div",
              { class: "hero-actions" },
              h("a", { class: "button button--primary", href: "#modes" }, "择一局入席", h("i", { "aria-hidden": "true" }, "→")),
              h("button", { type: "button", class: "button button--ghost", onClick: onSettings }, "接上模型")
            ),
            h(
              "p",
              { class: "hero-note" },
              h("span", { class: "dot dot--gold", "aria-hidden": "true" }),
              "本地推演可直接开席 · 可接任意 OpenAI 兼容模型"
            )
          ),
          h(
            "aside",
            { class: "poster reveal reveal--2", "aria-label": "对局样张" },
            h("span", { class: "poster__corner poster__corner--tl" }),
            h("span", { class: "poster__corner poster__corner--tr" }),
            h("span", { class: "poster__corner poster__corner--bl" }),
            h("span", { class: "poster__corner poster__corner--br" }),
            h(
              "div",
              { class: "poster__head" },
              h("span", null, "样局 / 舌战"),
              h("span", null, "第二阵 · 驳论")
            ),
            h(
              "div",
              { class: "poster__sides" },
              h(
                "div",
                { class: "poster__side poster__side--a" },
                h("span", { class: "poster__side-label" }, "正方"),
                h("strong", null, "墨守"),
                h("em", null, "逻辑拆解者")
              ),
              h("span", { class: "poster__vs" }, "对"),
              h(
                "div",
                { class: "poster__side poster__side--b" },
                h("span", { class: "poster__side-label" }, "反方"),
                h("strong", null, "庄生"),
                h("em", null, "以喻代辩者")
              )
            ),
            h(
              "blockquote",
              { class: "poster__quote" },
              "“对方把代价推给了未来，",
              h("br"),
              "却把好处留在了今天。”"
            ),
            h(
              "div",
              { class: "poster__meta" },
              h("span", null, "辩题：远程办公利大于弊"),
              h("span", { class: "poster__pending" }, "未裁")
            ),
            h("span", { class: "poster__watermark", "aria-hidden": "true" }, "观"),
            h("span", { class: "poster__seal" }, "样张")
          )
        ),

        h(
          "section",
          { class: "section modes", id: "modes" },
          h(
            "div",
            { class: "section-head" },
            h(
              "div",
              null,
              h("p", { class: "eyebrow" }, "THREE WAYS TO DUEL"),
              h("h2", null, "三种斗法")
            ),
            h("p", { class: "section-side-note" }, "一张桌案，三种胜负", h("br"), "理、诗、字，各有各的锋刃。")
          ),
          h(
            "div",
            { class: "mode-grid" },
            modeCard("debate", onMode),
            modeCard("poetry", onMode),
            modeCard("chain", onMode)
          )
        ),

        h(
          "section",
          { class: "stats-band", "aria-label": "本地数据" },
          h(
            "div",
            { class: "stat" },
            h("strong", null, "03"),
            h("span", null, "赛制"),
            h("small", null, "舌战 / 诗战 / 斗口")
          ),
          h(
            "div",
            { class: "stat" },
            h("strong", null, String(POEMS.length)),
            h("span", null, "本地诗句"),
            h("small", null, "含作者与出处")
          ),
          h(
            "div",
            { class: "stat" },
            h("strong", null, String(IDIOMS.length)),
            h("span", null, "本地成语"),
            h("small", null, `可接核心 ${CHAIN_CORE.size} 条`)
          ),
          h(
            "div",
            { class: "stat" },
            h("strong", null, "∞"),
            h("span", null, "可接模型"),
            h("small", null, "OpenAI 兼容接口")
          )
        ),

        h(
          "section",
          { class: "section process" },
          h(
            "div",
            { class: "section-head" },
            h(
              "div",
              null,
              h("p", { class: "eyebrow" }, "HOW IT UNFOLDS"),
              h("h2", null, "如何开席")
            )
          ),
          h(
            "div",
            { class: "process-grid" },
            h(
              "div",
              { class: "process-step" },
              h("span", { class: "process-step__num" }, "01"),
              h("h3", null, "择局"),
              h("p", null, "快辩或鏖战；飞花令定令字；成语接龙定起字。")
            ),
            h(
              "div",
              { class: "process-step" },
              h("span", { class: "process-step__num" }, "02"),
              h("h3", null, "点将"),
              h("p", null, "各选一位 AI 与一个模型。没有密钥也能用本地推演开局。")
            ),
            h(
              "div",
              { class: "process-step" },
              h("span", { class: "process-step__num" }, "03"),
              h("h3", null, "观战"),
              h("p", null, "逐字落墨，裁判退席评议；成败落槌，判词可复制留档。")
            )
          )
        ),

        h(
          "section",
          { class: "section history", id: "history" },
          h(
            "div",
            { class: "section-head" },
            h(
              "div",
              null,
              h("p", { class: "eyebrow" }, "PAST MATCHES"),
              h("h2", null, "往战")
            ),
            h(
              "div",
              { class: "history-head-actions" },
              h("span", { class: "section-side-note" }, "只存本机，最多十二局"),
              history.length
                ? h(
                    "button",
                    {
                      type: "button",
                      class: "text-button",
                      onClick: onClearHistory,
                    },
                    "清空"
                  )
                : null
            )
          ),
          history.length
            ? h("div", { class: "history-list" }, ...history.map(historyRow))
            : h(
                "div",
                { class: "history-empty" },
                h("span", { class: "history-empty__seal" }, "待"),
                h(
                  "div",
                  null,
                  h("p", { class: "history-empty__quote" }, "尚未落槌。第一局，通常最难忘。"),
                  h("p", { class: "history-empty__hint" }, "选一种斗法，让两台机器先开口。")
                )
              )
        )
      )
    ),

    h(
      "footer",
      { class: "site-footer" },
      h(
        "div",
        { class: "shell shell--wide footer-inner" },
        h(
          "div",
          { class: "footer-brand" },
          h("span", { class: "seal seal--small" }, "斗"),
          h(
            "div",
            null,
            h("strong", null, "斗文台"),
            h("p", null, "本地优先的 AI 文斗观测装置。")
          )
        ),
        h(
          "div",
          { class: "footer-notes" },
          h("p", null, "密钥只存在你的浏览器里，经本机 Node 服务直连模型商，不写入磁盘。"),
          h("p", null, "本地推演引擎不联网；判词为结构启发式评分，不冒充文学判断。")
        ),
        h("span", { class: "footer-version" }, "v1.0 · 本地版")
      )
    )
  );

  return page;
}
