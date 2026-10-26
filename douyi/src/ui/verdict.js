import { sideName } from "../data/personas.js";
import { copyText, formatDuration, h, replace } from "./dom.js";

function scoreRow(rubric, scores, side) {
  return h(
    "div",
    { class: "score-rows" },
    ...rubric.map((item) => {
      const value = Number(scores?.[side]?.[item.key] || 0);
      const percent = Math.max(0, Math.min(100, (value / item.max) * 100));
      return h(
        "div",
        { class: "score-row" },
        h("span", { class: "score-row__label" }, item.label),
        h(
          "span",
          { class: "score-row__bar", "aria-hidden": "true" },
          h("i", { style: { width: `${percent}%` } })
        ),
        h("span", { class: "score-row__value" }, `${value}`)
      );
    })
  );
}

function contestantCard(verdict, side) {
  const fighter = verdict.fighters[side];
  const winner = verdict.winner === side;
  const draw = verdict.winner === "draw";
  return h(
    "div",
    { class: `verdict-fighter verdict-fighter--${side.toLowerCase()} ${winner ? "is-winner" : ""}` },
    h(
      "div",
      { class: "verdict-fighter__top" },
      h("span", { class: `verdict-badge verdict-badge--${side.toLowerCase()}` }, fighter.badge || fighter.name.slice(0, 1)),
      h(
        "div",
        { class: "verdict-fighter__names" },
        h("span", { class: `side-chip side-chip--${side.toLowerCase()}` }, sideName(side, verdict.mode)),
        h("strong", null, fighter.name),
        h("small", null, fighter.title)
      ),
      h(
        "div",
        { class: "verdict-total" },
        h("strong", null, verdict.totals[side].toFixed(1)),
        h("span", null, "/ 100")
      )
    ),
    scoreRow(verdict.rubric, verdict.scores, side),
    h(
      "div",
      { class: "verdict-verdict" },
      draw ? "判和" : winner ? "胜" : "负"
    )
  );
}

function forfeitLabel(reason) {
  switch (reason) {
    case "duplicate":
      return "重句";
    case "keyword":
      return "失律";
    case "timeout":
      return "超时";
    case "start":
      return "断字";
    case "empty":
    case "no_line":
      return "词穷";
    default:
      return "失律";
  }
}

function buildMarkdown(verdict) {
  const a = verdict.fighters.A;
  const b = verdict.fighters.B;
  const result =
    verdict.winner === "draw" ? "和局" : verdict.winner === "A" ? `${a.name} 胜` : `${b.name} 胜`;
  const rubricHeader = `| 维度 | ${a.name} | ${b.name} |\n| --- | --- | --- |`;
  const rows = verdict.rubric
    .map((item) => `| ${item.label}（${item.max}） | ${verdict.scores.A[item.key]} | ${verdict.scores.B[item.key]} |`)
    .join("\n");
  return [
    `# 斗文台 · ${verdict.mode === "debate" ? "舌战" : verdict.mode === "poetry" ? "飞花令" : "成语接龙"}判词`,
    "",
    `**${verdict.mode === "debate" ? "辩题" : verdict.mode === "poetry" ? "令字" : "起字"}**：${verdict.title}`,
    `**正方 / 甲席**：${a.name}（${a.title}）`,
    `**反方 / 乙席**：${b.name}（${b.title}）`,
    `**结果**：${result}`,
    verdict.forfeit
      ? `**终局事由**：${forfeitLabel(verdict.forfeit.reason)} · ${verdict.forfeit.message}`
      : "",
    `**比分**：${a.name} ${verdict.totals.A.toFixed(1)} / ${b.name} ${verdict.totals.B.toFixed(1)}`,
    "",
    rubricHeader,
    rows,
    "",
    `**判词**：${verdict.commentary}`,
    verdict.bestLine ? `\n**${verdict.mode === "chain" ? "最佳一接" : "最佳一句"}**：${verdict.bestLine}` : "",
    verdict.highlights?.length ? `\n**旁注**：\n${verdict.highlights.map((item) => `- ${item}`).join("\n")}` : "",
    "",
    `**裁判**：${verdict.engine === "llm" ? `在线模型 ${verdict.judgeModel || ""}` : "本地判准（结构启发式）"}`,
    `**引擎**：${verdict.degraded ? "在线中断，本地兜底" : verdict.engine === "llm" ? "在线模型" : "本地推演"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function showVerdictDialog({ verdict, onRematch, onLobby, onClose }) {
  const layer = document.getElementById("layer-root") || document.body;
  const duelName = verdict.mode === "debate" ? "舌战" : verdict.mode === "poetry" ? "飞花令" : "斗口";
  const winnerName = verdict.winner === "draw" ? "不分伯仲" : verdict.fighters[verdict.winner].name;
  let settled = false;

  const dialog = h("dialog", { class: "dialog verdict-dialog", "aria-labelledby": "verdict-title" });
  const close = () => {
    if (!dialog.open) return;
    dialog.close();
  };

  const finish = (action) => {
    if (settled) return;
    settled = true;
    if (dialog.open) dialog.close();
    dialog.remove();
    onClose?.();
    action?.();
  };

  const copyButton = h(
    "button",
    {
      type: "button",
      class: "button button--ghost button--small",
      onClick: async () => {
        const ok = await copyText(buildMarkdown(verdict));
        copyButton.textContent = ok ? "已复制" : "复制失败";
        copyButton.classList.toggle("is-success", ok);
        setTimeout(() => {
          copyButton.textContent = "复制判词";
          copyButton.classList.remove("is-success");
        }, 1800);
      },
    },
    "复制判词"
  );

  const stats = verdict.stats || {};
  const engineLabel =
    verdict.engine === "llm"
      ? `在线裁判 · ${verdict.judgeModel || "模型"}`
      : "本地判准 · 结构启发式";

  const body = h(
    "div",
    { class: "verdict-body" },
    h(
      "div",
      { class: "verdict-masthead" },
      h(
        "div",
        null,
        h("p", { class: "eyebrow" }, `MATCH VERDICT / ${duelName}`),
        h("h2", { class: "verdict-title", id: "verdict-title" }, verdict.title),
        h("p", { class: "verdict-subtitle" }, verdict.subtitle || "")
      ),
      h(
        "div",
        { class: "verdict-meta" },
        h("span", { class: `tag ${verdict.engine === "llm" ? "tag--jade" : "tag--gold"}` }, engineLabel),
        verdict.degraded ? h("span", { class: "tag tag--warn" }, "在线中断 · 本地兜底") : null
      )
    ),
    verdict.forfeit
      ? h(
          "div",
          { class: "verdict-forfeit" },
          h("span", null, "终局事由"),
          h("p", null, `${forfeitLabel(verdict.forfeit.reason)} · ${verdict.forfeit.message}`)
        )
      : null,
    h(
      "div",
      { class: "verdict-hero" },
      h(
        "div",
        { class: `verdict-stamp ${verdict.winner === "draw" ? "is-draw" : ""}`, "aria-hidden": "true" },
        verdict.winner === "draw" ? "和" : "胜"
      ),
      h(
        "div",
        { class: "verdict-hero__copy" },
        h("span", { class: "eyebrow" }, verdict.winner === "draw" ? "THE MATCH IS EVEN" : "THE MATCH IS DECIDED"),
        h("h3", null, verdict.winner === "draw" ? "不分伯仲" : `${winnerName}胜出`),
        h(
          "p",
          null,
          verdict.winner === "draw"
            ? "双方各有所长，裁判没有落下一记独断的槌。"
            : `以 ${Math.abs(verdict.totals.A - verdict.totals.B).toFixed(1)} 分之差收席。`
        )
      )
    ),
    h(
      "div",
      { class: "verdict-scoreboard" },
      contestantCard(verdict, "A"),
      h(
        "div",
        { class: "verdict-scoreboard__center" },
        h("span", { class: "verdict-vs" }, "判"),
        h("span", { class: "verdict-total-label" }, "总评")
      ),
      contestantCard(verdict, "B")
    ),
    h(
      "div",
      { class: `verdict-reading ${verdict.bestLine ? "has-bestline" : ""}` },
      h(
        "div",
        { class: "verdict-commentary" },
        h("span", { class: "verdict-commentary__label" }, "判词"),
        h("p", null, verdict.commentary)
      ),
      verdict.bestLine
        ? h(
            "div",
            { class: "verdict-bestline" },
            h("span", { class: "eyebrow" }, verdict.bestLabel || "BEST LINE"),
            h("p", null, "「", verdict.bestLine, "」"),
            verdict.bestEntry
              ? h("span", { class: "verdict-bestline__source" }, `${verdict.bestEntry.dynasty} · ${verdict.bestEntry.author}《${verdict.bestEntry.title}》`)
              : verdict.mode === "chain"
                ? h("span", { class: "verdict-bestline__source" }, "四字成语 · 首尾相接")
                : null
          )
        : null
    ),
    verdict.highlights?.length
      ? h(
          "ul",
          { class: "verdict-highlights" },
          ...verdict.highlights.map((item) => h("li", null, item))
        )
      : null,
    h(
      "div",
      { class: "verdict-stats" },
      h(
        "div",
        null,
        h("span", null, "用时"),
        h("strong", null, formatDuration(stats.durationMs || 0))
      ),
      h(
        "div",
        null,
        h("span", null, verdict.mode === "debate" ? "阵数" : verdict.mode === "poetry" ? "句数" : "回数"),
        h("strong", null, String(stats.turns || 0))
      ),
      verdict.mode !== "debate"
        ? h(
            "div",
            null,
            h("span", null, "库中命中"),
            h("strong", null, `${stats.verifiedA || 0} / ${stats.verifiedB || 0}`)
          )
        : h(
            "div",
            null,
            h("span", null, "陈词"),
            h("strong", null, `${stats.speechesA || 0} / ${stats.speechesB || 0}`)
          ),
      h(
        "div",
        null,
        h("span", null, "引擎"),
        h("strong", null, verdict.degraded ? "本地兜底" : verdict.engine === "llm" ? "在线模型" : "本地推演")
      )
    )
  );

  const foot = h(
    "div",
    { class: "verdict-foot" },
    h(
      "div",
      { class: "verdict-foot__note" },
      h("span", { class: "seal seal--small" }, "判"),
      h("span", null, verdict.engine === "llm" ? "判词由在线裁判生成，请结合自己的判断阅读。" : "本地裁判只按结构启发式评分，不冒充文学判断。")
    ),
    h(
      "div",
      { class: "verdict-foot__actions" },
      copyButton,
      h("button", { type: "button", class: "button button--ghost", onClick: () => finish(onLobby) }, "另开一局"),
      h("button", { type: "button", class: "button button--primary", onClick: () => finish(onRematch) }, "再战此局", h("i", { "aria-hidden": "true" }, "→"))
    )
  );

  const head = h(
    "div",
    { class: "verdict-top" },
    h(
      "div",
      { class: "verdict-top__brand" },
      h("span", { class: "seal seal--small" }, "斗"),
      h("span", null, "斗文台 · 本局判词")
    ),
    h("button", { type: "button", class: "icon-button", "aria-label": "收起判词", onClick: close }, "×")
  );

  replace(dialog, head, body, foot);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("close", () => {
    if (!dialog.isConnected) return;
    dialog.remove();
    if (!settled) {
      settled = true;
      onClose?.();
    }
  });

  layer.appendChild(dialog);
  dialog.showModal();
  return dialog;
}
