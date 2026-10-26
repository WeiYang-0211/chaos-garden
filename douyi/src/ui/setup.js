import {
  DEBATE_FORMATS,
  DEBATE_PERSONAS,
  DEBATE_PRESETS,
  IDIOM_PERSONAS,
  CHAIN_TURN_OPTIONS,
  PACE_OPTIONS,
  POETRY_PERSONAS,
  POETRY_TURN_OPTIONS,
  getPersona,
} from "../data/personas.js";
import { INDEX, featuredKeywords, isSingleHanChar, keywordCount } from "../core/poetry.js";
import { CHAIN_CORE_INDEX, chainStartStats } from "../core/idioms.js";
import { h, replace, setText } from "./dom.js";

function sideLabels(mode) {
  return mode === "debate" ? { A: "正方", B: "反方" } : { A: "甲席", B: "乙席" };
}

function randomSeed() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function topicLength(text) {
  return [...text.trim()].length;
}

function personaOption(persona, selected, side) {
  return h(
    "button",
    {
      type: "button",
      class: `persona-option ${selected ? "is-selected" : ""}`,
      "data-persona": persona.id,
      "data-side": side,
      "aria-pressed": selected ? "true" : "false",
      onClick: null,
    },
    h("span", { class: "persona-option__badge" }, persona.badge),
    h(
      "span",
      { class: "persona-option__copy" },
      h("strong", null, persona.name),
      h("em", null, persona.title),
      h("small", null, persona.blurb)
    )
  );
}

function fighterBlock(mode, side, selectedId) {
  const list =
    mode === "debate"
      ? DEBATE_PERSONAS
      : mode === "poetry"
        ? POETRY_PERSONAS
        : IDIOM_PERSONAS;
  const labels = sideLabels(mode);
  const persona = getPersona(mode, selectedId);
  return h(
    "div",
    { class: `fighter-block fighter-block--${side.toLowerCase()}`, "data-fighter": side },
    h(
      "div",
      { class: "fighter-block__head" },
      h("span", { class: `side-chip side-chip--${side.toLowerCase()}` }, labels[side]),
      h("span", { class: "fighter-block__hint" }, side === "A" ? "先开口" : "后应战")
    ),
    h(
      "div",
      { class: "persona-grid" },
      ...list.map((item) => personaOption(item, item.id === selectedId, side))
    ),
    h(
      "blockquote",
      { class: "fighter-quote" },
      "“",
      persona.quote,
      "”"
    )
  );
}

function engineStrip(settings, onAdjust) {
  const online = settings.engine === "llm";
  const localEndpoint = /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])/i.test(settings.endpoint || "");
  const hasKey = Boolean(settings.apiKey?.trim()) || localEndpoint;
  return h(
    "div",
    { class: "engine-strip" },
    h("span", { class: `dot ${online ? "dot--jade" : "dot--gold"}` }),
    h(
      "div",
      { class: "engine-strip__copy" },
      h("strong", null, online ? "在线模型" : "本地推演"),
      h(
        "small",
        null,
        online
          ? hasKey
            ? `A ${settings.modelA} / B ${settings.modelB}`
            : "密钥未配置，开席后将自动降级为本地推演"
          : "内置辩手与诗库，不联网"
      )
    ),
    h(
      "button",
      { type: "button", class: "text-button", onClick: onAdjust },
      "调整"
    )
  );
}

export function openSetupDialog({ mode, settings, onStart, onConfigure }) {
  const layer = document.getElementById("layer-root") || document.body;
  const debate = mode === "debate";
  const poetry = mode === "poetry";
  const chain = mode === "chain";
  const modeTitle = debate ? "设局 · 舌战" : poetry ? "设局 · 飞花令" : "设局 · 成语接龙";
  const labels = sideLabels(mode);
  const draft = {
    mode,
    topic: DEBATE_PRESETS[0],
    formatId: "quick",
    keyword: "月",
    totalTurns: 12,
    startChar: "一",
    idiomTurns: 12,
    pace: settings.pace,
    debateFighters: { A: DEBATE_PERSONAS[0].id, B: DEBATE_PERSONAS[1].id },
    poetryFighters: { A: POETRY_PERSONAS[0].id, B: POETRY_PERSONAS[1].id },
    chainFighters: { A: IDIOM_PERSONAS[0].id, B: IDIOM_PERSONAS[1].id },
  };
  let currentSettings = settings;
  let presetPool = DEBATE_PRESETS.slice(0, 4);

  const dialog = h("dialog", { class: `dialog sheet sheet--setup sheet--${mode}`, "aria-label": modeTitle });
  const head = h("div", { class: "sheet__head" });
  const body = h("div", { class: "sheet__body" });
  const foot = h("div", { class: "sheet__foot setup-foot" });
  const errorLine = h("p", { class: "setup-error", role: "alert" });
  const startButton = h("button", { type: "button", class: "button button--primary button--wide" }, "开席", h("i", { "aria-hidden": "true" }, "→"));

  let engineNode = null;
  let keywordPreview = null;
  let keywordWarning = null;
  let chainPreview = null;
  let chainWarning = null;
  let mirrorHint = null;

  const close = () => {
    if (dialog.open) dialog.close();
    dialog.remove();
  };

  const updateMirror = () => {
    if (!mirrorHint) return;
    const fighters = debate ? draft.debateFighters : poetry ? draft.poetryFighters : draft.chainFighters;
    mirrorHint.textContent = fighters.A === fighters.B ? "镜像同门：两席风格相同，只看临场。" : "";
  };

  const updateEngine = () => {
    if (!engineNode) return;
    replace(
      engineNode,
      engineStrip(currentSettings, async () => {
        if (!onConfigure) return;
        const updated = await onConfigure();
        if (updated) {
          currentSettings = updated;
          updateEngine();
          updateKeywordWarning();
          updateChainWarning();
        }
      })
    );
  };

  const updateKeywordUI = () => {
    if (!keywordPreview) return;
    const count = keywordCount(INDEX, draft.keyword);
    replace(
      keywordPreview,
      h("span", { class: "keyword-preview__label" }, "令"),
      h("strong", { class: "keyword-preview__char" }, draft.keyword || "—"),
      h("small", { class: "keyword-preview__count" }, `库中 ${count} 句`)
    );
    for (const button of keywordPreview.closest(".keyword-zone")?.querySelectorAll(".keyword-cell") || []) {
      const selected = button.dataset.char === draft.keyword;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    }
    updateKeywordWarning();
  };

  const updateKeywordWarning = () => {
    if (!keywordWarning) return;
    const count = keywordCount(INDEX, draft.keyword);
    if (count < 4) {
      keywordWarning.textContent = "本地库中此字不足四句，请换一个字。";
      keywordWarning.className = "keyword-warning is-error";
    } else if (currentSettings.engine === "local" && count < draft.totalTurns) {
      keywordWarning.textContent = `本地库中此字仅 ${count} 句，可能提前词穷；在线模型不受此限。`;
      keywordWarning.className = "keyword-warning";
    } else {
      keywordWarning.textContent = "";
      keywordWarning.className = "keyword-warning";
    }
  };

  const chainCount = (char) => CHAIN_CORE_INDEX.byFirst.get(char)?.length ?? 0;

  const updateChainUI = () => {
    if (!chainPreview) return;
    const count = chainCount(draft.startChar);
    replace(
      chainPreview,
      h("span", { class: "keyword-preview__label" }, "起"),
      h("strong", { class: "keyword-preview__char" }, draft.startChar || "—"),
      h("small", { class: "keyword-preview__count" }, `可接 ${count} 条`)
    );
    for (const button of chainPreview.closest(".keyword-zone")?.querySelectorAll(".keyword-cell") || []) {
      const selected = button.dataset.char === draft.startChar;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    }
    updateChainWarning();
  };

  const updateChainWarning = () => {
    if (!chainWarning) return;
    const count = chainCount(draft.startChar);
    if (count < 1) {
      chainWarning.textContent = "本地词库里没有以这个字开头的可接成语，请换一个字。";
      chainWarning.className = "keyword-warning is-error";
    } else if (currentSettings.engine === "local" && count < 4) {
      chainWarning.textContent = `此字本地可接 ${count} 条，牌路较窄，可能提前断链。`;
      chainWarning.className = "keyword-warning";
    } else {
      chainWarning.textContent = "";
      chainWarning.className = "keyword-warning";
    }
  };

  const topicZone = () => {
    const textarea = h("textarea", {
      class: "input textarea",
      rows: "3",
      maxlength: "80",
      placeholder: "例如：远程办公利大于弊",
      onInput: (event) => {
        draft.topic = event.target.value;
        setText(counter, `${topicLength(draft.topic)} / 60`);
        errorLine.textContent = "";
      },
    });
    textarea.value = draft.topic;
    const counter = h("span", { class: "field__counter" }, `${topicLength(draft.topic)} / 60`);

    const chipRow = h("div", { class: "topic-chips" });
    const renderPresets = () => {
      replace(
        chipRow,
        ...presetPool.map((topic) =>
          h(
            "button",
            {
              type: "button",
              class: `chip ${draft.topic === topic ? "is-selected" : ""}`,
              onClick: () => {
                draft.topic = topic;
                textarea.value = topic;
                setText(counter, `${topicLength(topic)} / 60`);
                errorLine.textContent = "";
                renderPresets();
              },
            },
            topic
          )
        ),
        h(
          "button",
          {
            type: "button",
            class: "chip chip--action",
            onClick: () => {
              const remaining = DEBATE_PRESETS.filter((topic) => !presetPool.includes(topic));
              const pick = remaining[Math.floor(Math.random() * remaining.length)] || DEBATE_PRESETS[0];
              draft.topic = pick;
              textarea.value = pick;
              setText(counter, `${topicLength(pick)} / 60`);
              presetPool = [pick, ...presetPool.slice(0, 3)];
              errorLine.textContent = "";
              renderPresets();
            },
          },
          "换一题"
        )
      );
    };
    renderPresets();

    const formatRow = h(
      "div",
      { class: "format-grid" },
      ...Object.values(DEBATE_FORMATS).map((format) =>
        h(
          "button",
          {
            type: "button",
            class: `format-card ${draft.formatId === format.id ? "is-selected" : ""}`,
            "data-format": format.id,
            "aria-pressed": draft.formatId === format.id ? "true" : "false",
            onClick: (event) => {
              draft.formatId = format.id;
              const group = event.currentTarget.closest(".format-grid");
              for (const button of group.children) {
                const selected = button.dataset.format === format.id;
                button.classList.toggle("is-selected", selected);
                button.setAttribute("aria-pressed", selected ? "true" : "false");
              }
            },
          },
          h("span", { class: "format-card__tag" }, format.tag),
          h("strong", null, format.name),
          h("small", null, format.description)
        )
      )
    );

    return h(
      "section",
      { class: "setup-zone" },
      h(
        "div",
        { class: "setup-zone__head" },
        h("span", { class: "setup-zone__num" }, "壹"),
        h("h3", null, "立题"),
        h("p", null, "一句话，越具体越好。立场由赛制分配：左席为正方，右席为反方。")
      ),
      h(
        "label",
        { class: "field" },
        h(
          "div",
          { class: "field__label-row" },
          h("span", { class: "field__label" }, "辩题"),
          counter
        ),
        textarea
      ),
      h("div", { class: "preset-row preset-row--topics" }, chipRow),
      h(
        "div",
        { class: "field" },
        h("span", { class: "field__label" }, "赛制"),
        formatRow
      ),
      h(
        "aside",
        { class: "setup-aside-note" },
        h("span", { class: "setup-aside-note__mark" }, "记"),
        h(
          "p",
          null,
          "开席后，每阵发言逐字落墨；裁判退席后写判词，可复制留档。模型密钥只留在本机浏览器，不写入磁盘。"
        )
      )
    );
  };

  const poetryZone = () => {
    const stats = featuredKeywords(INDEX);
    const grid = h(
      "div",
      { class: "keyword-grid" },
      ...stats.map((item) =>
        h(
          "button",
          {
            type: "button",
            class: `keyword-cell ${draft.keyword === item.char ? "is-selected" : ""}`,
            "data-char": item.char,
            "aria-pressed": draft.keyword === item.char ? "true" : "false",
            onClick: (event) => {
              draft.keyword = item.char;
              customInput.value = "";
              errorLine.textContent = "";
              updateKeywordUI();
            },
          },
          h("strong", null, item.char),
          h("small", null, String(item.count))
        )
      )
    );

    keywordPreview = h("div", { class: "keyword-preview" });
    keywordPreview.append(
      h("span", { class: "keyword-preview__label" }, "令"),
      h("strong", { class: "keyword-preview__char" }, draft.keyword),
      h("small", { class: "keyword-preview__count" }, `库中 ${keywordCount(INDEX, draft.keyword)} 句`)
    );
    keywordWarning = h("p", { class: "keyword-warning" });

    const customInput = h("input", {
      type: "text",
      class: "input",
      placeholder: "自定一字，如：雪",
      maxlength: "4",
      onInput: () => {
        errorLine.textContent = "";
      },
      onKeydown: (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          useCustom();
        }
      },
    });

    const useCustom = () => {
      const value = customInput.value.trim();
      if (!isSingleHanChar(value)) {
        errorLine.textContent = "令字必须是一个汉字。";
        return;
      }
      const count = keywordCount(INDEX, value);
      if (count < 4) {
        errorLine.textContent = `本地库中「${value}」不足四句，换一个字。`;
        return;
      }
      draft.keyword = value;
      errorLine.textContent = "";
      updateKeywordUI();
    };

    const turnRow = h(
      "div",
      { class: "turn-grid" },
      ...POETRY_TURN_OPTIONS.map((option) =>
        h(
          "button",
          {
            type: "button",
            class: `turn-card ${draft.totalTurns === option.value ? "is-selected" : ""}`,
            "data-turns": String(option.value),
            "aria-pressed": draft.totalTurns === option.value ? "true" : "false",
            onClick: (event) => {
              draft.totalTurns = option.value;
              const group = event.currentTarget.closest(".turn-grid");
              for (const button of group.children) {
                const selected = Number(button.dataset.turns) === option.value;
                button.classList.toggle("is-selected", selected);
                button.setAttribute("aria-pressed", selected ? "true" : "false");
              }
              updateKeywordWarning();
            },
          },
          h("strong", null, option.label),
          h("small", null, option.hint)
        )
      )
    );

    return h(
      "section",
      { class: "setup-zone keyword-zone" },
      h(
        "div",
        { class: "setup-zone__head" },
        h("span", { class: "setup-zone__num" }, "壹"),
        h("h3", null, "定令"),
        h("p", null, "选一个字作令；每句必须含此字，且不得重复。库外名句标为待考。")
      ),
      h(
        "div",
        { class: "keyword-top" },
        keywordPreview,
        h(
          "div",
          { class: "keyword-custom" },
          h(
            "label",
            { class: "field field--flush" },
            h("span", { class: "field__label" }, "自定义"),
            h(
              "div",
              { class: "input-with-action" },
              customInput,
              h("button", { type: "button", class: "input-action", onClick: useCustom }, "用此字")
            )
          ),
          keywordWarning
        )
      ),
      h("div", { class: "field" }, h("span", { class: "field__label" }, "常用令字"), grid),
      h(
        "div",
        { class: "field" },
        h("span", { class: "field__label" }, "句数"),
        turnRow
      ),
      h(
        "aside",
        { class: "setup-aside-note" },
        h("span", { class: "setup-aside-note__mark" }, "记"),
        h(
          "p",
          null,
          "本地推演从诗库取句，库外句在在线模式下标为待考。一场最多十六句，判词可复制留档。"
        )
      )
    );
  };

  const chainZone = () => {
    const stats = chainStartStats();
    const customInput = h("input", {
      type: "text",
      class: "input",
      placeholder: "自定一字，如：龙",
      maxlength: "4",
      onInput: () => {
        errorLine.textContent = "";
      },
      onKeydown: (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          useCustom();
        }
      },
    });

    const useCustom = () => {
      const value = customInput.value.trim();
      if (!isSingleHanChar(value)) {
        errorLine.textContent = "起字必须是一个汉字。";
        return;
      }
      if (chainCount(value) < 1) {
        errorLine.textContent = `本地词库里没有以「${value}」开头的可接成语。`;
        return;
      }
      draft.startChar = value;
      errorLine.textContent = "";
      updateChainUI();
    };

    const grid = h(
      "div",
      { class: "keyword-grid" },
      ...stats.map((item) =>
        h(
          "button",
          {
            type: "button",
            class: `keyword-cell ${draft.startChar === item.char ? "is-selected" : ""}`,
            "data-char": item.char,
            "aria-pressed": draft.startChar === item.char ? "true" : "false",
            onClick: () => {
              draft.startChar = item.char;
              customInput.value = "";
              errorLine.textContent = "";
              updateChainUI();
            },
          },
          h("strong", null, item.char),
          h("small", null, String(item.count))
        )
      )
    );

    chainPreview = h(
      "div",
      { class: "keyword-preview" },
      h("span", { class: "keyword-preview__label" }, "起"),
      h("strong", { class: "keyword-preview__char" }, draft.startChar),
      h("small", { class: "keyword-preview__count" }, `可接 ${chainCount(draft.startChar)} 条`)
    );
    chainWarning = h("p", { class: "keyword-warning" });

    const turnRow = h(
      "div",
      { class: "turn-grid" },
      ...CHAIN_TURN_OPTIONS.map((option) =>
        h(
          "button",
          {
            type: "button",
            class: `turn-card ${draft.idiomTurns === option.value ? "is-selected" : ""}`,
            "data-turns": String(option.value),
            "aria-pressed": draft.idiomTurns === option.value ? "true" : "false",
            onClick: (event) => {
              draft.idiomTurns = option.value;
              const group = event.currentTarget.closest(".turn-grid");
              for (const button of group.children) {
                const selected = Number(button.dataset.turns) === option.value;
                button.classList.toggle("is-selected", selected);
                button.setAttribute("aria-pressed", selected ? "true" : "false");
              }
              updateChainWarning();
            },
          },
          h("strong", null, option.label),
          h("small", null, option.hint)
        )
      )
    );

    return h(
      "section",
      { class: "setup-zone keyword-zone chain-zone" },
      h(
        "div",
        { class: "setup-zone__head" },
        h("span", { class: "setup-zone__num" }, "壹"),
        h("h3", null, "定起"),
        h("p", null, "先定一个字，第一回成语必须以此字开头；其后每一回以上一句的末字起头。")
      ),
      h(
        "div",
        { class: "keyword-top" },
        chainPreview,
        h(
          "div",
          { class: "keyword-custom" },
          h(
            "label",
            { class: "field field--flush" },
            h("span", { class: "field__label" }, "自定义"),
            h(
              "div",
              { class: "input-with-action" },
              customInput,
              h("button", { type: "button", class: "input-action", onClick: useCustom }, "用此字")
            )
          ),
          chainWarning
        )
      ),
      h("div", { class: "field" }, h("span", { class: "field__label" }, "常用起字"), grid),
      h(
        "div",
        { class: "field" },
        h("span", { class: "field__label" }, "回数"),
        turnRow
      ),
      h(
        "aside",
        { class: "setup-aside-note" },
        h("span", { class: "setup-aside-note__mark" }, "记"),
        h(
          "p",
          null,
          "严格同字相接，不取谐音。每回只接一个四字成语；库外成语标待考；两次不合格或超时判负。"
        )
      )
    );
  };

  const fighterZone = () => {
    const fighters = debate ? draft.debateFighters : poetry ? draft.poetryFighters : draft.chainFighters;
    const blocks = [fighterBlock(mode, "A", fighters.A), fighterBlock(mode, "B", fighters.B)];
    mirrorHint = h("p", { class: "mirror-hint" });

    const container = h(
      "section",
      { class: "setup-zone fighters-zone" },
      h(
        "div",
        { class: "setup-zone__head" },
        h("span", { class: "setup-zone__num" }, "贰"),
        h("h3", null, "点将"),
        h(
          "p",
          null,
          debate
            ? "两席各选一位辩手；同一套模型也可以打出不同的辩风。"
            : poetry
              ? "两席各选一位诗人；取句偏好会直接影响本地推演。"
              : "两席各选一位词客；取词偏好会直接影响本地接龙。"
        )
      ),
      ...blocks,
      mirrorHint
    );

    for (const block of container.querySelectorAll(".fighter-block")) {
      const side = block.dataset.fighter;
      block.addEventListener("click", (event) => {
        const button = event.target.closest(".persona-option");
        if (!button) return;
        const fighters = debate ? draft.debateFighters : poetry ? draft.poetryFighters : draft.chainFighters;
        fighters[side] = button.dataset.persona;
        for (const option of block.querySelectorAll(".persona-option")) {
          const selected = option.dataset.persona === fighters[side];
          option.classList.toggle("is-selected", selected);
          option.setAttribute("aria-pressed", selected ? "true" : "false");
        }
        const persona = getPersona(mode, fighters[side]);
        const quote = block.querySelector(".fighter-quote");
        if (quote) quote.textContent = `“${persona.quote}”`;
        updateMirror();
      });
    }
    updateMirror();
    return container;
  };

  const renderFooter = () => {
    engineNode = h("div", { class: "engine-strip-wrap" });
    updateEngine();
    replace(
      foot,
      h(
        "div",
        { class: "setup-foot__meta" },
        engineNode,
        h(
          "div",
          { class: "setup-foot__pace" },
          h("span", { class: "field__label" }, "节奏"),
          h(
            "div",
            { class: "segment-row segment-row--compact" },
            ...Object.values(PACE_OPTIONS).map((pace) =>
              h(
                "button",
                {
                  type: "button",
                  class: `segment segment--compact ${draft.pace === pace.id ? "is-selected" : ""}`,
                  "data-pace": pace.id,
                  "aria-pressed": draft.pace === pace.id ? "true" : "false",
                  onClick: (event) => {
                    draft.pace = pace.id;
                    const group = event.currentTarget.closest(".segment-row");
                    for (const button of group.children) {
                      const selected = button.dataset.pace === pace.id;
                      button.classList.toggle("is-selected", selected);
                      button.setAttribute("aria-pressed", selected ? "true" : "false");
                    }
                  },
                },
                pace.name
              )
            )
          )
        )
      ),
      h(
        "div",
        { class: "setup-foot__action" },
        errorLine,
        startButton
      )
    );
  };

  const tryStart = () => {
    errorLine.textContent = "";
    if (debate) {
      const length = topicLength(draft.topic);
      if (length < 4) {
        errorLine.textContent = "辩题至少四个字，把问题说具体一点。";
        return;
      }
      if (length > 60) {
        errorLine.textContent = "辩题最多六十个字。";
        return;
      }
      close();
      onStart({
        mode: "debate",
        topic: draft.topic.trim(),
        formatId: draft.formatId,
        fighters: {
          A: getPersona("debate", draft.debateFighters.A),
          B: getPersona("debate", draft.debateFighters.B),
        },
        pace: draft.pace,
        seed: randomSeed(),
      });
      return;
    }

    if (chain) {
      const chainAvailable = CHAIN_CORE_INDEX.byFirst.get(draft.startChar)?.length ?? 0;
      if (!isSingleHanChar(draft.startChar) || chainAvailable < 1) {
        errorLine.textContent = "请选一个本地词库里接得上的起字。";
        return;
      }
      close();
      onStart({
        mode: "chain",
        startChar: draft.startChar,
        totalTurns: draft.idiomTurns,
        fighters: {
          A: getPersona("chain", draft.chainFighters.A),
          B: getPersona("chain", draft.chainFighters.B),
        },
        pace: draft.pace,
        seed: randomSeed(),
      });
      return;
    }

    const count = keywordCount(INDEX, draft.keyword);
    if (!isSingleHanChar(draft.keyword) || count < 4) {
      errorLine.textContent = "请选一个本地库中至少四句的令字。";
      return;
    }
    close();
    onStart({
      mode: "poetry",
      keyword: draft.keyword,
      totalTurns: draft.totalTurns,
      fighters: {
        A: getPersona("poetry", draft.poetryFighters.A),
        B: getPersona("poetry", draft.poetryFighters.B),
      },
      pace: draft.pace,
      seed: randomSeed(),
    });
  };

  startButton.addEventListener("click", tryStart);

  replace(
    head,
    h(
      "div",
      { class: "sheet__title" },
      h("span", { class: "seal seal--small" }, debate ? "辩" : poetry ? "令" : "接"),
      h(
        "div",
        null,
        h(
          "p",
          { class: "eyebrow" },
          debate ? "MATCH SETUP / DEBATE" : poetry ? "MATCH SETUP / FEIHUALING" : "MATCH SETUP / IDIOM CHAIN"
        ),
        h("h2", null, modeTitle),
        h(
          "p",
          { class: "sheet__subtitle" },
          debate
            ? "先立题，再点将。开席后不再更改。"
            : poetry
              ? "先定令字，再点将。开席后不再更改。"
              : "先定起字，再点将。开席后不再更改。"
        )
      )
    ),
    h("button", { type: "button", class: "icon-button", "aria-label": "关闭设局", onClick: close }, "×")
  );

  const mainZone = debate ? topicZone() : poetry ? poetryZone() : chainZone();
  const sideZone = h(
    "div",
    { class: "setup-side" },
    fighterZone()
  );

  replace(body, h("div", { class: "setup-grid" }, mainZone, sideZone));
  renderFooter();
  replace(dialog, head, body, foot);

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });

  layer.appendChild(dialog);
  dialog.showModal();
  if (window.matchMedia("(pointer: fine)").matches) {
    requestAnimationFrame(() => {
      const focusTarget = dialog.querySelector(".textarea, .keyword-custom .input");
      focusTarget?.focus({ preventScroll: true });
    });
  }
}
