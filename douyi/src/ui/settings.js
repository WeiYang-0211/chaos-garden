import { DEFAULT_SETTINGS, PACE_OPTIONS } from "../data/personas.js";
import { collectChat, isAbortError } from "../core/llm.js";
import { connectionTestMessages } from "../core/prompts.js";
import { h, replace, setText } from "./dom.js";

const PRESETS = {
  deepseek: {
    label: "DeepSeek",
    endpoint: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
  openai: {
    label: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  ollama: {
    label: "Ollama",
    endpoint: "http://localhost:11434/v1",
    model: "qwen2.5:7b",
  },
};

function engineChoice(value, title, detail, draft, onPick) {
  return h(
    "button",
    {
      type: "button",
      class: `engine-choice ${draft.engine === value ? "is-selected" : ""}`,
      'aria-pressed': draft.engine === value ? "true" : "false",
      onClick: () => onPick(value),
    },
    h("span", { class: "engine-choice__mark", "aria-hidden": "true" }, value === "local" ? "本" : "联"),
    h("strong", null, title),
    h("span", null, detail)
  );
}

function paceOption(id, draft, onChange) {
  const pace = PACE_OPTIONS[id];
  return h(
    "button",
    {
      type: "button",
      class: `segment ${draft.pace === id ? "is-selected" : ""}`,
      "aria-pressed": draft.pace === id ? "true" : "false",
      onClick: () => {
        draft.pace = id;
        onChange();
      },
    },
    h("strong", null, pace.name),
    h("small", null, pace.hint)
  );
}

export function openSettingsDialog({ settings }) {
  const layer = document.getElementById("layer-root") || document.body;
  const draft = {
    ...DEFAULT_SETTINGS,
    ...settings,
    modelA: settings.modelA || DEFAULT_SETTINGS.modelA,
    modelB: settings.modelB || DEFAULT_SETTINGS.modelB,
    modelJudge: settings.modelJudge || DEFAULT_SETTINGS.modelJudge,
  };

  return new Promise((resolve) => {
    let settled = false;
    let testAbort = null;
    let cleanup = () => {};

    const dialog = h("dialog", { class: "dialog sheet sheet--settings", "aria-label": "模型与席面" });
    const body = h("div", { class: "sheet__body settings-body" });
    const head = h("div", { class: "sheet__head" });
    const foot = h("div", { class: "sheet__foot" });

    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
      if (dialog.open) dialog.close();
      dialog.remove();
    };

    cleanup = () => {
      testAbort?.abort();
      testAbort = null;
    };

    const closeButton = h(
      "button",
      { type: "button", class: "icon-button", "aria-label": "关闭设置", onClick: () => finish(null) },
      "×"
    );

    const statusLine = h("span", { class: "test-status", "aria-live": "polite" });
    const testButton = h("button", { type: "button", class: "button button--ghost button--small" }, "测试连接");
    const footNoteText = h("span", null, "本地推演 · 不联网");

    const render = () => {
      testAbort?.abort();
      testAbort = null;
      setText(statusLine, "");
      setText(footNoteText, draft.engine === "llm" ? "在线模型 · 请求经本机代理" : "本地推演 · 不联网");
      const online = draft.engine === "llm";
      const engineZone = h(
        "div",
        { class: "settings-zone" },
        h(
          "div",
          { class: "settings-zone__head" },
          h("span", { class: "settings-zone__num" }, "壹"),
          h("h3", null, "引擎"),
          h("p", null, "本地推演不联网；在线模型经本机代理转发。")
        ),
        h(
          "div",
          { class: "engine-choices" },
          engineChoice(
            "local",
            "本地演示",
            "内置推演与诗库，零配置，立刻开席。",
            draft,
            (value) => {
              draft.engine = value;
              render();
            }
          ),
          engineChoice(
            "llm",
            "在线模型",
            "接任意 OpenAI 兼容接口，可让两个模型分席对垒。",
            draft,
            (value) => {
              draft.engine = value;
              render();
            }
          )
        )
      );

      const fieldset = h(
        "fieldset",
        { class: "settings-fieldset", disabled: !online },
        h(
          "div",
          { class: "settings-zone__head settings-zone__head--inside" },
          h("span", { class: "settings-zone__num" }, "贰"),
          h("h3", null, "接口与分工"),
          h("p", null, online ? "三家可用同一个模型，也可让 A、B 与裁判各用其模型。" : "切换到在线模型后，以下字段才会生效。")
        ),
        h(
          "div",
          { class: "preset-row" },
          ...Object.entries(PRESETS).map(([key, preset]) =>
            h(
              "button",
              {
                type: "button",
                class: "chip",
                onClick: () => {
                  draft.endpoint = preset.endpoint;
                  draft.modelA = preset.model;
                  draft.modelB = preset.model;
                  draft.modelJudge = preset.model;
                  render();
                },
              },
              preset.label
            )
          ),
          h("span", { class: "preset-hint" }, "选择预设会覆盖三个模型名")
        ),
        h(
          "label",
          { class: "field" },
          h("span", { class: "field__label" }, "API 地址"),
          h("input", {
            type: "url",
            class: "input",
            value: draft.endpoint,
            placeholder: "https://api.deepseek.com/v1",
            spellcheck: "false",
            onInput: (event) => {
              draft.endpoint = event.target.value;
            },
          }),
          h("small", { class: "field__hint" }, "可填以 /v1 结尾的基地址，也可直接填 /chat/completions 完整地址。")
        ),
        h(
          "div",
          { class: "field" },
          h("span", { class: "field__label" }, "API 密钥"),
          h(
            "div",
            { class: "input-with-action" },
            h("input", {
              id: "api-key-input",
              "aria-label": "API 密钥",
              type: "password",
              class: "input",
              value: draft.apiKey || "",
              placeholder: "sk-...",
              spellcheck: "false",
              autocomplete: "off",
              onInput: (event) => {
                draft.apiKey = event.target.value;
              },
            }),
            h(
              "button",
              {
                type: "button",
                class: "input-action",
                onClick: (event) => {
                  const input = dialog.querySelector("#api-key-input");
                  if (!input) return;
                  const show = input.type === "password";
                  input.type = show ? "text" : "password";
                  event.currentTarget.textContent = show ? "隐藏" : "显示";
                },
              },
              "显示"
            )
          ),
          h(
            "div",
            { class: "field__hint-row" },
            h("small", { class: "field__hint" }, "只保存在此浏览器 localStorage。请求经本机 Node 代理转发，不写入日志。"),
            h(
              "button",
              {
                type: "button",
                class: "text-button",
                onClick: () => {
                  draft.apiKey = "";
                  render();
                },
              },
              "清除密钥"
            )
          )
        ),
        h(
          "div",
          { class: "field-grid field-grid--three" },
          h(
            "label",
            { class: "field" },
            h("span", { class: "field__label" }, "正方 / 甲席模型"),
            h("input", {
              type: "text",
              class: "input",
              value: draft.modelA,
              spellcheck: "false",
              onInput: (event) => {
                draft.modelA = event.target.value;
              },
            })
          ),
          h(
            "label",
            { class: "field" },
            h("span", { class: "field__label" }, "反方 / 乙席模型"),
            h("input", {
              type: "text",
              class: "input",
              value: draft.modelB,
              spellcheck: "false",
              onInput: (event) => {
                draft.modelB = event.target.value;
              },
            })
          ),
          h(
            "label",
            { class: "field" },
            h("span", { class: "field__label" }, "裁判模型"),
            h("input", {
              type: "text",
              class: "input",
              value: draft.modelJudge,
              spellcheck: "false",
              onInput: (event) => {
                draft.modelJudge = event.target.value;
              },
            })
          )
        ),
        h(
          "div",
          { class: "test-row" },
          testButton,
          statusLine,
          h("span", { class: "test-hint" }, "用正方模型发一句问候，确认地址、密钥与模型名。")
        )
      );

      testButton.disabled = !online;
      testButton.onclick = async () => {
        if (!online) return;
        const endpoint = draft.endpoint.trim();
        const model = draft.modelA.trim() || draft.modelJudge.trim();
        if (!endpoint || !model) {
          replace(statusLine, h("span", { class: "is-error" }, "先填好地址与模型名。"));
          return;
        }
        try {
          new URL(endpoint);
        } catch {
          replace(statusLine, h("span", { class: "is-error" }, "地址不是合法 URL。"));
          return;
        }

        testAbort?.abort();
        testAbort = new AbortController();
        const timer = setTimeout(() => testAbort?.abort(), 20_000);
        testButton.disabled = true;
        replace(statusLine, h("span", { class: "is-pending" }, "连接中…"));
        try {
          const answer = await collectChat(
            {
              endpoint,
              apiKey: draft.apiKey,
              model,
              messages: connectionTestMessages(model),
              temperature: 0,
              maxTokens: 12,
            },
            testAbort.signal
          );
          replace(statusLine, h("span", { class: "is-ok" }, `通了 · ${answer.trim().slice(0, 30) || "模型已响应"}`));
        } catch (error) {
          if (isAbortError(error) && testAbort?.signal.aborted) {
            replace(statusLine, h("span", { class: "is-error" }, "连接超时，或已取消。"));
          } else {
            replace(statusLine, h("span", { class: "is-error" }, error.message || "连接失败。"));
          }
        } finally {
          clearTimeout(timer);
          testButton.disabled = false;
        }
      };

      const experience = h(
        "div",
        { class: "settings-zone" },
        h(
          "div",
          { class: "settings-zone__head" },
          h("span", { class: "settings-zone__num" }, "叁"),
          h("h3", null, "席面"),
          h("p", null, "节奏影响本地推演的落字速度；在线模型按网络实际返回。")
        ),
        h(
          "div",
          { class: "field" },
          h("span", { class: "field__label" }, "默认节奏"),
          h(
            "div",
            { class: "segment-row segment-row--pace" },
            ...Object.keys(PACE_OPTIONS).map((id) => paceOption(id, draft, render))
          )
        ),
        h(
          "div",
          { class: "switch-row" },
          h(
            "div",
            null,
            h("strong", null, "音效"),
            h("small", null, "开席醒木、落子与落槌。默认关闭。")
          ),
          h(
            "button",
            {
              type: "button",
              class: `switch ${draft.sound ? "is-on" : ""}`,
              role: "switch",
              "aria-checked": draft.sound ? "true" : "false",
              "aria-label": "音效开关",
              onClick: () => {
                draft.sound = !draft.sound;
                render();
              },
            },
            h("span", { class: "switch__knob" })
          )
        )
      );

      replace(
        body,
        engineZone,
        fieldset,
        experience,
        h(
          "p",
          { class: "settings-privacy" },
          "斗文台不会上传你的密钥，也不会在服务端保存对局。浏览器与本地 Node 服务之外，请求只发往你填写的模型地址。"
        )
      );
    };

    const save = () => {
      if (draft.engine === "llm") {
        const endpoint = draft.endpoint.trim();
        if (!endpoint) {
          replace(statusLine, h("span", { class: "is-error" }, "先填 API 地址。"));
          return;
        }
        try {
          const parsed = new URL(endpoint);
          if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("protocol");
        } catch {
          replace(statusLine, h("span", { class: "is-error" }, "API 地址必须是 http 或 https。"));
          return;
        }
        for (const key of ["modelA", "modelB", "modelJudge"]) {
          draft[key] = draft[key].trim();
          if (!draft[key]) {
            replace(statusLine, h("span", { class: "is-error" }, "三个模型名都要填。"));
            return;
          }
        }
      }
      draft.endpoint = draft.endpoint.trim();
      draft.apiKey = (draft.apiKey || "").trim();
      draft.modelA = (draft.modelA || DEFAULT_SETTINGS.modelA).trim();
      draft.modelB = (draft.modelB || DEFAULT_SETTINGS.modelB).trim();
      draft.modelJudge = (draft.modelJudge || DEFAULT_SETTINGS.modelJudge).trim();
      finish({ ...draft });
    };

    replace(
      head,
      h(
        "div",
        { class: "sheet__title" },
        h("span", { class: "seal seal--small" }, "设"),
        h(
          "div",
          null,
          h("p", { class: "eyebrow" }, "ENGINE / SETTINGS"),
          h("h2", null, "模型与席面")
        )
      ),
      closeButton
    );

    replace(
      foot,
      h(
        "div",
        { class: "sheet__foot-note" },
        h("span", { class: "dot dot--gold" }),
        footNoteText
      ),
      h(
        "div",
        { class: "sheet__foot-actions" },
        h("button", { type: "button", class: "button button--ghost", onClick: () => finish(null) }, "取消"),
        h("button", { type: "button", class: "button button--primary", onClick: save }, "存下")
      )
    );

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) finish(null);
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(null);
    });
    dialog.addEventListener("close", () => {
      if (!settled) finish(null);
    });

    render();
    replace(dialog, head, body, foot);
    layer.appendChild(dialog);
    dialog.showModal();
  });
}
