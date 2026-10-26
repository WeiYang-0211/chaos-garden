import {
  currentChainTurn,
  currentDebatePhase,
  currentPoetryTurn,
  createChainState,
  createDebateState,
  createPoetryState,
  forfeitChain,
  forfeitPoetry,
  recordChainTurn,
  recordDebateSpeech,
  recordPoetryTurn,
} from "../core/battle.js";
import {
  DEBATE_FORMATS,
  DEBATE_RUBRIC,
  IDIOM_RUBRIC,
  PACE_OPTIONS,
  POETRY_RUBRIC,
  sideName,
} from "../data/personas.js";
import {
  INDEX,
  findPoemEntry,
  keywordCount,
  validatePoetryAttempt,
} from "../core/poetry.js";
import { CHAIN_CORE_INDEX, IDIOM_INDEX, validateChainAttempt } from "../core/idioms.js";
import {
  createChainMemory,
  createDebateMemory,
  createPoetryMemory,
  generateDebateSpeech,
  judgeChainOffline,
  judgeDebateOffline,
  judgePoetryOffline,
  validatedOfflineChainPick,
  validatedOfflinePick,
} from "../core/offline.js";
import {
  chainJudgeMessages,
  chainMessages,
  debateJudgeMessages,
  debateMessages,
  feihualingMessages,
  poetryJudgeMessages,
} from "../core/prompts.js";
import { isAbortError, modelForSide, streamChat } from "../core/llm.js";
import { parseJudgeResponse } from "../core/judge.js";
import {
  confirmDialog,
  formatClock,
  h,
  prefersReducedMotion,
  randomId,
  replace,
  setText,
  sleep,
  toast,
} from "./dom.js";
import { showVerdictDialog } from "./verdict.js";

const PACE_ORDER = ["immersive", "brisk", "instant"];
const TURN_BUDGET = 90_000;

function shortLine(text, max = 16) {
  const chars = [...String(text || "")];
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : chars.join("");
}

function countChars(text) {
  return [...String(text || "").replace(/\s/g, "")].length;
}

function highlightNodes(text, keyword) {
  const nodes = [];
  let buffer = "";
  for (const char of String(text)) {
    if (char === keyword) {
      if (buffer) {
        nodes.push(document.createTextNode(buffer));
        buffer = "";
      }
      nodes.push(h("mark", null, char));
    } else {
      buffer += char;
    }
  }
  if (buffer) nodes.push(document.createTextNode(buffer));
  return nodes;
}

function foulLabel(reason) {
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
    case "aborted":
      return "撤席";
    default:
      return "失律";
  }
}

function thinking(text = "推演中") {
  return h(
    "span",
    { class: "thinking" },
    h("span", null, text),
    h("i", null),
    h("i", null),
    h("i", null)
  );
}

export class Arena {
  constructor({ mount, spec, settings, sound, callbacks }) {
    this.mount = mount;
    this.spec = spec;
    this.settings = settings;
    this.sound = sound;
    this.callbacks = callbacks || {};
    this.mode = spec.mode;
    this.pace = PACE_OPTIONS[spec.pace] || PACE_OPTIONS.immersive;
    this.master = new AbortController();
    this.calls = new Set();
    this.intervals = new Set();
    this.startedAt = performance.now();
    this.localFallback = settings.engine !== "llm";
    this.degraded = false;
    this.judgeFallback = false;
    this.finished = false;
    this.exiting = false;
    this.disposed = false;
    this.state = null;
    this.verdict = null;
    this.verdictDialog = null;
    this.nearBottom = true;
    this.els = {};
    this.onScroll = () => {
      const distance = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      this.nearBottom = distance < 220;
    };
  }

  async start() {
    this.renderShell();
    this.showCurtain();
    this.sound.arm();
    this.sound.knock();
    try {
      if (this.mode === "debate") await this.runDebate();
      else if (this.mode === "poetry") await this.runPoetry();
      else await this.runChain();
    } catch (error) {
      if (this.master.signal.aborted || isAbortError(error)) return;
      console.error(error);
      this.showFatal(error);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.master.abort();
    for (const record of [...this.calls]) record.controller.abort();
    this.calls.clear();
    for (const id of this.intervals) clearInterval(id);
    this.intervals.clear();
    window.removeEventListener("scroll", this.onScroll);
    if (this.verdictDialog?.open) this.verdictDialog.close();
    this.verdictDialog?.remove();
    this.verdictDialog = null;
  }

  renderShell() {
    const isDebate = this.mode === "debate";
    const isPoetry = this.mode === "poetry";
    const isChain = this.mode === "chain";
    const spec = this.spec;
    const fighters = spec.fighters;
    const format = isDebate ? DEBATE_FORMATS[spec.formatId] : null;
    const totalA = isDebate
      ? format.phases.filter((phase) => phase.side === "A").length
      : Math.ceil(spec.totalTurns / 2);
    const totalB = isDebate
      ? format.phases.filter((phase) => phase.side === "B").length
      : Math.floor(spec.totalTurns / 2);
    const sideLabel = (side) => sideName(side, this.mode);

    const counts = {};
    const makeContestant = (side) => {
      const fighter = fighters[side];
      const total = side === "A" ? totalA : totalB;
      const count = h("strong", { class: "contestant__number", "data-count": side }, "0");
      counts[side] = count;
      return h(
        "div",
        { class: `contestant contestant--${side.toLowerCase()}`, "data-contestant": side },
        h("span", { class: `contestant__badge contestant__badge--${side.toLowerCase()}` }, fighter.badge || fighter.name.slice(0, 1)),
        h(
          "div",
          { class: "contestant__info" },
          h("span", { class: "contestant__side" }, sideLabel(side)),
          h("strong", { class: "contestant__name" }, fighter.name),
          h("small", { class: "contestant__title" }, fighter.title)
        ),
        h(
          "div",
          { class: "contestant__count" },
          count,
          h("span", null, isDebate ? `陈词 / ${total}` : isPoetry ? `句 / ${total}` : `接 / ${total}`)
        )
      );
    };

    const kicker = h(
      "p",
      { class: "match-kicker" },
      isDebate
        ? `${format.name} · 共 ${format.phases.length} 阵`
        : isPoetry
          ? `飞花令 · ${spec.totalTurns} 句`
          : `成语接龙 · ${spec.totalTurns} 回`
    );
    const title = isDebate
      ? h("h1", { class: "match-title" }, spec.topic)
      : isPoetry
        ? h(
            "div",
            { class: "keyword-oracle" },
            h("span", { class: "keyword-oracle__label" }, "令"),
            h("strong", { class: "keyword-oracle__char" }, spec.keyword)
          )
        : h(
            "div",
            { class: "chain-oracle" },
            h("span", { class: "chain-oracle__label" }, "接"),
            h("strong", { class: "chain-oracle__char", "data-chain-char": "" }, spec.startChar)
          );
    const sub = h(
      "p",
      { class: "match-sub", "aria-live": "polite" },
      isDebate
        ? `${format.phases[0].label} · ${format.phases[0].scene} · ${sideLabel("A")}陈词`
        : isPoetry
          ? `${sideLabel("A")}先起 · 库中 ${keywordCount(INDEX, spec.keyword)} 句`
          : `第 1 / ${spec.totalTurns} 回 · ${sideLabel("A")}先起 · 可接 ${CHAIN_CORE_INDEX.byFirst.get(spec.startChar)?.length ?? 0} 条`
    );
    const track = h("div", { class: "phase-track", "aria-hidden": "true" });

    const status = h("div", { class: "arena-topbar__status", "aria-live": "polite" }, "开席");
    const engine = h("span", {
      class: `arena-engine ${this.settings.engine === "llm" ? "is-llm" : "is-local"}`,
      title: this.settings.engine === "llm" ? `${this.settings.modelA} / ${this.settings.modelB}` : "本地推演",
    });
    const paceButton = h("button", { type: "button", class: "arena-tool" }, this.pace.name);
    const soundButton = h(
      "button",
      {
        type: "button",
        class: `arena-tool arena-tool--sound ${this.sound.enabled ? "is-on" : ""}`,
        "aria-pressed": this.sound.enabled ? "true" : "false",
        "aria-label": "音效开关",
      },
      "声"
    );
    const exitButton = h("button", { type: "button", class: "arena-tool arena-tool--exit" }, "离席");
    const bannerSlot = h("div", { class: "arena-banner-slot" });

    paceButton.addEventListener("click", () => {
      const index = PACE_ORDER.indexOf(this.pace.id);
      const next = PACE_OPTIONS[PACE_ORDER[(index + 1) % PACE_ORDER.length]];
      this.pace = next;
      paceButton.textContent = next.name;
      toast(`节奏 · ${next.name}`, { tone: "info", duration: 1800 });
    });

    soundButton.addEventListener("click", () => {
      const enabled = !this.sound.enabled;
      this.sound.setEnabled(enabled);
      soundButton.classList.toggle("is-on", enabled);
      soundButton.setAttribute("aria-pressed", enabled ? "true" : "false");
      this.callbacks.onSoundChange?.(enabled);
      if (enabled) {
        this.sound.arm();
        this.sound.tick();
      }
    });

    const handleExit = () => this.handleExit();
    exitButton.addEventListener("click", handleExit);

    const topbar = h(
      "header",
      { class: "site-header arena-topbar" },
      h(
        "div",
        { class: "shell shell--wide header-inner" },
        h(
          "div",
          { class: "arena-topbar__left" },
          h("button", { type: "button", class: "icon-button arena-back", "aria-label": "离席", onClick: handleExit }, "←"),
          h("span", { class: "seal seal--small" }, "斗"),
          h("span", { class: "arena-topbar__word" }, "斗文台"),
          h("span", { class: "arena-topbar__divider", "aria-hidden": "true" }),
          h("span", { class: "arena-topbar__mode" }, isDebate ? "舌战" : isPoetry ? "诗战" : "斗口")
        ),
        status,
        h(
          "div",
          { class: "arena-topbar__tools" },
          engine,
          paceButton,
          soundButton,
          exitButton
        )
      )
    );

    const scoreboard = h(
      "section",
      { class: "scoreboard", "aria-label": "对局双方" },
      makeContestant("A"),
      h(
        "div",
        { class: "match-core" },
        kicker,
        title,
        isDebate
          ? null
          : isPoetry
            ? h("p", { class: "match-title match-title--poetry" }, `以「${spec.keyword}」为令`)
            : h("p", { class: "match-title match-title--poetry" }, `以「${spec.startChar}」起字 · 四字成语`),
        track,
        sub
      ),
      makeContestant("B")
    );

    const feed = h("div", { class: "arena-feed", role: "log", "aria-label": "对局记录" });
    const foot = h(
      "footer",
      { class: "arena-foot" },
      h(
        "span",
        null,
        isDebate
          ? "立场由赛制分配 · 裁判退席后落槌 · 判词可复制留档"
          : isPoetry
            ? "接句须含令字 · 不得重复 · 库外句标待考 · 接不上即判负"
            : "末字必接首字 · 不取谐音 · 库外成语标待考 · 两次不过即断"
      ),
      h("span", { class: "arena-foot__engine" }, this.settings.engine === "llm" ? "在线模型" : "本地推演")
    );

    const page = h(
      "div",
      { class: `arena-page arena-page--${this.mode}` },
      topbar,
      bannerSlot,
      h("main", { class: "shell shell--wide arena-main" }, scoreboard, feed, foot)
    );

    replace(this.mount, page);
    this.page = page;
    this.feed = feed;
    this.els = {
      status,
      engine,
      kicker,
      title,
      sub,
      track,
      counts,
      contestantsA: page.querySelector('[data-contestant="A"]'),
      contestantsB: page.querySelector('[data-contestant="B"]'),
      bannerSlot,
      footEngine: foot.querySelector(".arena-foot__engine"),
      chainChar: page.querySelector("[data-chain-char]"),
      paceButton,
      soundButton,
    };
    this.setEngineBadge();
    this.buildTrack();
    this.updateCounts();
    window.addEventListener("scroll", this.onScroll, { passive: true });
    this.onScroll();
  }

  setEngineBadge() {
    if (!this.els.engine) return;
    const online = this.settings.engine === "llm" && !this.localFallback;
    this.els.engine.className = `arena-engine ${online ? "is-llm" : "is-local"}`;
    replace(
      this.els.engine,
      h("i", { "aria-hidden": "true" }),
      online ? `LLM · ${shortLine(this.settings.modelA, 18)}` : "本地"
    );
    if (this.els.footEngine) {
      setText(this.els.footEngine, online ? `在线模型 · ${this.settings.modelA} / ${this.settings.modelB}` : "本地推演");
    }
  }

  showCurtain() {
    if (prefersReducedMotion() || this.pace.id === "instant") return;
    const seal = this.mode === "debate" ? "辩" : this.mode === "poetry" ? "令" : "接";
    const title = this.mode === "debate" ? "舌战" : this.mode === "poetry" ? "飞花令" : "斗口";
    const subtitle =
      this.mode === "debate"
        ? shortLine(this.spec.topic, 24)
        : this.mode === "poetry"
          ? `以「${this.spec.keyword}」为令`
          : `以「${this.spec.startChar}」起字，末字相接`;
    const curtain = h(
      "div",
      { class: "arena-curtain", "aria-hidden": "true" },
      h("span", { class: "arena-curtain__seal" }, seal),
      h("strong", null, title),
      h("small", null, subtitle)
    );
    this.page.appendChild(curtain);
    setTimeout(() => curtain.remove(), 1500);
  }

  showBanner(message, detail = "") {
    if (!this.els.bannerSlot) return;
    replace(
      this.els.bannerSlot,
      h(
        "div",
        { class: "arena-banner", role: "status" },
        h("span", { class: "arena-banner__mark" }, "警"),
        h("div", null, h("strong", null, message), detail ? h("small", null, detail) : null)
      )
    );
  }

  degrade(error) {
    if (this.degraded) return;
    this.degraded = true;
    this.localFallback = true;
    const detail = String(error?.message || "模型服务未响应").slice(0, 160);
    this.showBanner("在线模型中断，本局已切换本地推演。", detail);
    toast(`在线模型未应席：${shortLine(detail, 56)}。已改用本地推演。`, {
      tone: "warn",
      duration: 6500,
    });
    this.setEngineBadge();
  }

  degradeJudge(error) {
    if (this.degraded) return;
    this.degraded = true;
    this.judgeFallback = true;
    const detail = String(error?.message || "裁判未回席").slice(0, 160);
    this.showBanner("在线裁判未回席，本局改用本地判准。", detail);
    toast("在线裁判未回席，已改用本地判准。", { tone: "warn", duration: 5500 });
  }

  setStatus(text) {
    setText(this.els.status, text);
  }

  setActive(side) {
    if (this.els.contestantsA) this.els.contestantsA.classList.toggle("is-active", side === "A");
    if (this.els.contestantsB) this.els.contestantsB.classList.toggle("is-active", side === "B");
  }

  updateCounts() {
    if (!this.state) return;
    if (this.mode === "debate") {
      this.els.counts.A.textContent = String(this.state.transcript.filter((item) => item.side === "A").length);
      this.els.counts.B.textContent = String(this.state.transcript.filter((item) => item.side === "B").length);
      return;
    }
    this.els.counts.A.textContent = String(this.state.turns.filter((item) => item.side === "A").length);
    this.els.counts.B.textContent = String(this.state.turns.filter((item) => item.side === "B").length);
  }

  buildTrack() {
    const track = this.els.track;
    replace(track);
    if (this.mode === "debate") {
      for (const phase of DEBATE_FORMATS[this.spec.formatId].phases) {
        track.appendChild(
          h("i", {
            class: `track-seg side-${phase.side.toLowerCase()}`,
            title: `第 ${phase.index} 阵 · ${phase.label}`,
          })
        );
      }
      return;
    }
    for (let index = 1; index <= this.spec.totalTurns; index += 1) {
      const side = index % 2 === 1 ? "a" : "b";
      track.appendChild(h("i", { class: `track-seg side-${side}`, title: `第 ${index} 句` }));
    }
  }

  updateTrack() {
    const track = this.els.track;
    if (!track) return;
    const segments = [...track.children];
    if (this.mode === "debate") {
      const current = this.state?.phaseIndex ?? 0;
      segments.forEach((segment, index) => {
        segment.classList.toggle("is-done", index < current || this.finished);
        segment.classList.toggle("is-current", !this.finished && index === current);
      });
      return;
    }
    const done = this.state?.turns.length ?? 0;
    const current = this.state?.status === "running" ? this.state.turn - 1 : -1;
    segments.forEach((segment, index) => {
      const turn = this.state?.turns[index];
      segment.classList.toggle("is-done", index < done);
      segment.classList.toggle("side-a", turn ? turn.side === "A" : index % 2 === 0);
      segment.classList.toggle("side-b", turn ? turn.side === "B" : index % 2 === 1);
      segment.classList.toggle("is-current", !this.finished && index === current);
      segment.classList.toggle(
        "is-failed",
        Boolean(this.state?.forfeit && index === this.state.forfeit.turn - 1)
      );
    });
  }

  updateDebateCenter(phase) {
    setText(this.els.kicker, `${this.state.format.name} · 第 ${phase.index} 阵 / 共 ${phase.total} 阵`);
    setText(
      this.els.sub,
      `${phase.label} · ${phase.scene} · ${sideName(phase.side, "debate")} ${this.state.fighters[phase.side].name}`
    );
    this.updateTrack();
  }

  updatePoetryCenter(current, state = "thinking") {
    setText(this.els.kicker, `飞花令 · ${this.state.totalTurns} 句`);
    if (this.state.status === "forfeit") {
      setText(this.els.sub, "失律 · 本局终 · 退席评议");
      return;
    }
    if (this.state.status === "judging") {
      setText(this.els.sub, "句数已尽 · 退席评议");
      return;
    }
    const label = sideName(current.side, "poetry");
    const action = state === "answered" ? "已接令" : "沉吟中";
    setText(this.els.sub, `第 ${current.turn} / ${this.state.totalTurns} 句 · ${label} · ${action}`);
    this.updateTrack();
  }

  updateChainCenter(current, state = "thinking") {
    setText(this.els.kicker, `成语接龙 · ${this.state.totalTurns} 回`);
    const shownChar = state === "answered" ? this.state.requiredChar : current.requiredChar;
    if (this.els.chainChar) setText(this.els.chainChar, shownChar);
    if (this.state.status === "forfeit") {
      setText(this.els.sub, "断链 · 本局终 · 退席评议");
      return;
    }
    if (this.state.status === "judging") {
      setText(this.els.sub, "回数已尽 · 退席评议");
      return;
    }
    const label = sideName(current.side, "chain");
    const action = state === "answered" ? `下一接「${this.state.requiredChar}」` : "沉吟中";
    setText(this.els.sub, `第 ${current.turn} / ${this.state.totalTurns} 回 · ${label} · ${action}`);
    this.updateTrack();
  }

  startClock(element) {
    const started = performance.now();
    const tick = () => {
      const elapsed = performance.now() - started;
      element.textContent = formatClock(elapsed / 1000);
      element.classList.toggle("is-late", elapsed > 60_000);
      element.classList.toggle("is-critical", elapsed > 85_000);
    };
    tick();
    const id = setInterval(tick, 500);
    this.intervals.add(id);
    return (finalMs) => {
      clearInterval(id);
      this.intervals.delete(id);
      element.classList.remove("is-late", "is-critical");
      element.textContent = formatClock((finalMs ?? performance.now() - started) / 1000);
    };
  }

  scrollToRow(row) {
    if (!this.nearBottom) return;
    requestAnimationFrame(() => {
      row.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "center",
      });
    });
  }

  addDebateRow(phase, fighter) {
    const side = phase.side;
    const clock = h("span", { class: "speech-clock" }, "00:00");
    const body = h("div", { class: "speech-body" }, thinking());
    const word = h("span", { class: "speech-word" }, "— 字");
    const source = h("span", { class: "speech-source" }, this.localFallback ? "本地推演" : "在线模型");
    const card = h(
      "article",
      { class: `speech-card speech-card--${side.toLowerCase()} is-thinking` },
      h(
        "div",
        { class: "speech-head" },
        h(
          "span",
          { class: "speech-who" },
          h("i", { class: `dot dot--${side === "A" ? "cinnabar" : "jade"}` }),
          `${sideName(side, "debate")} · ${fighter.name}`
        ),
        h("span", { class: "speech-phase" }, `第 ${phase.index} 阵 · ${phase.label}`),
        clock
      ),
      body,
      h("div", { class: "speech-foot" }, word, source)
    );
    const row = h(
      "div",
      { class: `feed-row feed-row--${side.toLowerCase()}` },
      h("div", { class: "feed-marker" }, h("span", null, String(phase.index).padStart(2, "0"))),
      card
    );
    this.feed.appendChild(row);
    this.scrollToRow(row);
    const stopClock = this.startClock(clock);
    return { row, card, body, clock, stopClock, word, source, side };
  }

  showThinking(row, text = "推演中") {
    row.card.classList.add("is-thinking");
    row.card.classList.remove("is-streaming");
    replace(row.body, thinking(text));
  }

  setSpeechText(row, text) {
    row.card.classList.remove("is-thinking");
    row.card.classList.add("is-streaming");
    row.body.textContent = text;
    row.word.textContent = `${countChars(text)} 字`;
  }

  async streamOffline(row, text) {
    row.card.classList.remove("is-thinking");
    row.body.textContent = "";
    row.card.classList.add("is-streaming");
    const chars = Array.from(text);
    if (this.pace.perChar === 0) {
      row.body.textContent = text;
    } else {
      for (let index = 0; index < chars.length; index += 1) {
        row.body.textContent += chars[index];
        if (index % 12 === 0) {
          row.word.textContent = `${countChars(row.body.textContent)} 字`;
        }
        await sleep(this.pace.perChar + Math.random() * this.pace.charJitter, this.master.signal);
      }
    }
    row.card.classList.remove("is-streaming");
    row.word.textContent = `${countChars(text)} 字`;
  }

  completeDebateRow(row, text, elapsed, source) {
    row.stopClock(elapsed);
    row.card.classList.remove("is-streaming", "is-thinking");
    row.card.classList.add("is-complete");
    row.body.textContent = text.trim();
    row.word.textContent = `${countChars(text)} 字`;
    row.source.textContent =
      source === "llm" ? `在线 · ${modelForSide(this.settings, row.side)}` : "本地推演";
  }

  async runDebate() {
    this.state = createDebateState({
      topic: this.spec.topic,
      formatId: this.spec.formatId,
      fighters: this.spec.fighters,
    });
    this.memory = createDebateMemory(this.spec.seed || randomId("debate"));
    this.buildTrack();
    this.updateCounts();
    this.updateDebateCenter(this.state.format.phases[0]);

    while (!this.master.signal.aborted) {
      const phase = currentDebatePhase(this.state);
      if (!phase) break;
      await this.playDebateTurn(phase);
      if (this.master.signal.aborted) return;
      if (this.state.status === "running") {
        await sleep(this.pace.phasePause, this.master.signal);
      }
    }
    if (this.master.signal.aborted) return;
    await this.judge();
  }

  async playDebateTurn(phase) {
    const fighter = this.state.fighters[phase.side];
    const label = sideName(phase.side, "debate");
    this.setActive(phase.side);
    this.updateDebateCenter(phase);
    this.setStatus(`第 ${phase.index} 阵 · ${phase.label} · ${label} ${fighter.name}`);
    this.sound.tick();
    const row = this.addDebateRow(phase, fighter);
    const started = performance.now();
    let text = "";
    let source = this.localFallback ? "local" : "llm";
    let ok = false;

    if (!this.localFallback) {
      try {
        text = await this.callLLM({
          messages: debateMessages({
            topic: this.spec.topic,
            fighter,
            side: phase.side,
            phase,
            transcript: this.state.transcript,
            format: this.state.format,
          }),
          model: modelForSide(this.settings, phase.side),
          maxTokens: 1300,
          temperature: 0.9,
          timeoutMs: 180_000,
          onDelta: (delta) => {
            if (this.master.signal.aborted) return;
            text += delta;
            this.setSpeechText(row, text);
          },
        });
        ok = Boolean(text.trim());
        if (!ok) {
          this.degrade(new Error("模型没有返回正文"));
          source = "local";
          this.showThinking(row);
        }
      } catch (error) {
        if (this.master.signal.aborted) throw error;
        this.degrade(error);
        source = "local";
        this.showThinking(row);
        text = "";
      }
    }

    if (!ok) {
      source = "local";
      this.showThinking(row);
      const delay =
        this.pace.thinkMax > 0
          ? this.pace.thinkMin + Math.random() * (this.pace.thinkMax - this.pace.thinkMin)
          : 0;
      await sleep(delay, this.master.signal);
      text = generateDebateSpeech({
        topic: this.spec.topic,
        side: phase.side,
        phase,
        fighter,
        transcript: this.state.transcript,
        memory: this.memory,
      });
      this.showThinking(row);
      await this.streamOffline(row, text);
    }

    if (this.master.signal.aborted) return;
    const elapsed = performance.now() - started;
    this.completeDebateRow(row, text, elapsed, source);
    recordDebateSpeech(this.state, { text, latencyMs: elapsed, source });
    this.updateCounts();
    this.updateTrack();
    this.setStatus(`${label} ${fighter.name} 陈词已毕`);
    this.sound.tick();
  }

  addPoemRow(current, fighter) {
    const side = current.side;
    const clock = h("span", { class: "poem-clock" }, "00:00");
    const note = h("p", { class: "poem-note" });
    const stage = h("div", { class: "poem-stage" }, thinking("沉吟中"));
    const source = h("span", { class: "poem-source" }, "—");
    const badge = h("span", { class: "poem-badge" }, "—");
    const card = h(
      "article",
      { class: `poem-slip poem-slip--${side.toLowerCase()} is-thinking`, "data-foul": "" },
      h(
        "div",
        { class: "poem-head" },
        h(
          "span",
          { class: "poem-who" },
          h("i", { class: `dot dot--${side === "A" ? "cinnabar" : "jade"}` }),
          `${sideName(side, "poetry")} · ${fighter.name}`
        ),
        h("span", { class: "poem-turn" }, `第 ${current.turn} 句`),
        clock
      ),
      note,
      stage,
      h("div", { class: "poem-meta" }, source, badge)
    );
    const row = h(
      "div",
      { class: `feed-row feed-row--${side.toLowerCase()}` },
      h("div", { class: "feed-marker" }, h("span", null, String(current.turn).padStart(2, "0"))),
      card
    );
    this.feed.appendChild(row);
    this.scrollToRow(row);
    const stopClock = this.startClock(clock);
    return { row, card, clock, note, stage, source, badge, stopClock };
  }

  async revealPoem(row, selected, decisionMs) {
    row.stopClock(decisionMs);
    row.card.classList.remove("is-thinking");
    row.card.classList.add("is-revealed");
    row.card.classList.toggle("is-pending", !selected.verified);
    replace(row.stage, h("div", { class: "poem-line" }));
    const line = row.stage.firstElementChild;
    const chars = Array.from(selected.line);
    const perChar =
      this.pace.id === "instant" ? 0 : Math.min(110, Math.max(42, this.pace.perChar * 4));
    if (perChar === 0) {
      line.textContent = selected.line;
    } else {
      for (const char of chars) {
        line.textContent += char;
        await sleep(perChar, this.master.signal);
      }
    }
    replace(line, ...highlightNodes(selected.line, this.spec.keyword));
    replace(
      row.source,
      selected.entry
        ? `${selected.entry.dynasty} · ${selected.entry.author}《${selected.entry.title}》`
        : "库外句 · 待考"
    );
    replace(row.badge, selected.verified ? "库中" : "待考");
    row.badge.classList.add(selected.verified ? "is-verified" : "is-pending");
    if (!selected.verified) {
      row.card.classList.add("is-pending");
    }
    row.card.dataset.foul = "";
  }

  markPoemFoul(row, forfeit) {
    row.stopClock();
    row.card.classList.remove("is-thinking", "is-revealed");
    row.card.classList.add("is-foul");
    const label = foulLabel(forfeit.reason);
    row.card.dataset.foul = label;
    replace(
      row.stage,
      h(
        "div",
        { class: "poem-foul" },
        h("strong", null, label),
        h("span", null, forfeit.message)
      )
    );
    replace(row.source, "本局于此收席");
    replace(row.badge, "判负");
    row.badge.classList.add("is-failed");
    row.note.textContent = "";
    row.clock.classList.remove("is-late", "is-critical");
  }

  async runPoetry() {
    this.state = createPoetryState({
      keyword: this.spec.keyword,
      totalTurns: this.spec.totalTurns,
      fighters: this.spec.fighters,
    });
    this.memory = createPoetryMemory(this.spec.seed || randomId("poetry"));
    this.buildTrack();
    this.updateCounts();
    const first = currentPoetryTurn(this.state);
    this.updatePoetryCenter(first, "thinking");

    while (!this.master.signal.aborted && this.state.status === "running") {
      const current = currentPoetryTurn(this.state);
      if (!current) break;
      await this.playPoetryTurn(current);
      if (this.master.signal.aborted) return;
      if (this.state.status === "running") {
        await sleep(this.pace.phasePause * 0.55, this.master.signal);
      }
    }
    if (this.master.signal.aborted) return;
    await this.judge();
  }

  async playPoetryTurn(current) {
    const side = current.side;
    const fighter = this.state.fighters[side];
    const label = sideName(side, "poetry");
    this.setActive(side);
    this.updatePoetryCenter(current, "thinking");
    this.setStatus(`第 ${current.turn} / ${this.state.totalTurns} 句 · ${label} ${fighter.name} 沉吟中`);
    this.sound.tick();
    const row = this.addPoemRow(current, fighter);
    const turnStart = performance.now();
    let selected = null;
    let forfeit = null;
    let feedback = "";
    let attempt = 0;
    let useLocal = this.localFallback;
    let source = "local";

    if (!useLocal) {
      while (attempt < 2 && !selected && !forfeit) {
        attempt += 1;
        const remaining = TURN_BUDGET - (performance.now() - turnStart);
        if (remaining < 2000) {
          forfeit = { reason: "timeout", message: "迟迟没有接令" };
          break;
        }
        row.note.textContent = attempt > 1 ? `首句未过：${feedback}` : "";
        let raw = "";
        try {
          raw = await this.callLLM({
            messages: feihualingMessages({
              keyword: this.spec.keyword,
              fighter,
              used: this.state.used,
              feedback,
              turn: current.turn,
              limit: this.state.totalTurns,
              constraint: "不限",
            }),
            model: modelForSide(this.settings, side),
            maxTokens: 120,
            temperature: 1,
            timeoutMs: remaining,
          });
        } catch (error) {
          if (this.master.signal.aborted) throw error;
          if (error.code === "timeout") {
            forfeit = { reason: "timeout", message: "迟迟没有接令" };
          } else {
            this.degrade(error);
            useLocal = true;
          }
          break;
        }

        if (/^词穷[。！!]?$/.test(raw.trim())) {
          forfeit = { reason: "no_line", message: "再想不出一句" };
          break;
        }

        const check = validatePoetryAttempt(raw, {
          keyword: this.spec.keyword,
          used: this.state.used,
          index: INDEX,
        });
        if (check.ok) {
          selected = check;
          source = "llm";
          break;
        }
        feedback = check.message;
        if (attempt >= 2) {
          forfeit = { reason: check.reason, message: check.message };
        } else {
          this.setStatus(`首句失律 · ${fighter.name} 再吟`);
        }
      }
    }

    if (!selected && !forfeit) {
      useLocal = true;
      source = "local";
      this.updatePoetryCenter(current, "thinking");
      const delay =
        this.pace.thinkMax > 0
          ? this.pace.thinkMin + Math.random() * (this.pace.thinkMax - this.pace.thinkMin)
          : 0;
      await sleep(delay, this.master.signal);
      const pick = validatedOfflinePick({
        keyword: this.spec.keyword,
        used: this.state.used,
        persona: fighter,
        index: INDEX,
        memory: this.memory,
      });
      if (pick.ok) selected = pick;
      else forfeit = { reason: pick.reason || "no_line", message: "本地库里也没有可接的句子了" };
    }

    if (this.master.signal.aborted) return;

    if (forfeit) {
      const recorded = forfeitPoetry(this.state, forfeit);
      this.markPoemFoul(row, recorded);
      this.setActive(null);
      this.updateCounts();
      this.updateTrack();
      this.updatePoetryCenter(current, "foul");
      setText(this.els.status, `${label} ${fighter.name} 失律 · 本局终`);
      this.sound.tick();
      return;
    }

    const decisionMs = performance.now() - turnStart;
    await this.revealPoem(row, selected, decisionMs);
    recordPoetryTurn(this.state, {
      line: selected.line,
      entry: selected.entry,
      verified: selected.verified,
      latencyMs: decisionMs,
      raw: "",
    });
    this.updateCounts();
    this.updateTrack();
    this.updatePoetryCenter(current, "answered");
    this.setStatus(`${label} ${fighter.name} 接「${shortLine(selected.line, 12)}」`);
    this.sound.chime();
    if (source === "local" && !this.localFallback) {
      row.note.textContent = "本地救场";
    }
  }

  addChainRow(current, fighter) {
    const side = current.side;
    const clock = h("span", { class: "chain-clock" }, "00:00");
    const note = h("p", { class: "chain-note" });
    const stage = h("div", { class: "chain-stage" }, thinking("沉吟中"));
    const source = h("span", { class: "chain-source" }, "—");
    const next = h("span", { class: "chain-next" }, "—");
    const badge = h("span", { class: "chain-badge" }, "—");
    const card = h(
      "article",
      { class: `chain-card chain-card--${side.toLowerCase()} is-thinking`, "data-foul": "" },
      h(
        "div",
        { class: "chain-head" },
        h(
          "span",
          { class: "chain-who" },
          h("i", { class: `dot dot--${side === "A" ? "cinnabar" : "jade"}` }),
          `${sideName(side, "chain")} · ${fighter.name}`
        ),
        h("span", { class: "chain-turn" }, `第 ${current.turn} 回`),
        h("span", { class: "chain-carry" }, `承「${current.requiredChar}」`),
        clock
      ),
      note,
      stage,
      h("div", { class: "chain-meta" }, source, next, badge)
    );
    const row = h(
      "div",
      { class: `feed-row feed-row--${side.toLowerCase()}` },
      h("div", { class: "feed-marker" }, h("span", null, String(current.turn).padStart(2, "0"))),
      card
    );
    this.feed.appendChild(row);
    this.scrollToRow(row);
    const stopClock = this.startClock(clock);
    return { row, card, clock, note, stage, source, next, badge, stopClock };
  }

  async revealChain(row, selected, decisionMs) {
    row.stopClock(decisionMs);
    row.card.classList.remove("is-thinking");
    row.card.classList.add("is-revealed");
    row.card.classList.toggle("is-pending", !selected.verified);
    const chars = [...selected.idiom];
    const tiles = h("div", { class: "chain-tiles" });
    chars.forEach((char, index) => {
      tiles.appendChild(
        h(
          "span",
          {
            class: `chain-tile ${index === 0 ? "is-first" : ""} ${index === chars.length - 1 ? "is-last" : ""}`,
            style: { "--i": index },
          },
          char
        )
      );
    });
    replace(row.stage, tiles);
    replace(row.source, "四字成语");
    replace(row.next, `启「${selected.nextChar}」`);
    replace(row.badge, selected.verified ? "库中" : "待考");
    row.badge.classList.add(selected.verified ? "is-verified" : "is-pending");
    row.card.dataset.foul = "";
    if (this.pace.id !== "instant") {
      await sleep(260, this.master.signal);
    }
  }

  markChainFoul(row, forfeit) {
    row.stopClock();
    row.card.classList.remove("is-thinking", "is-revealed");
    row.card.classList.add("is-foul");
    const label = forfeit.reason === "start" ? "断字" : foulLabel(forfeit.reason);
    row.card.dataset.foul = label;
    replace(
      row.stage,
      h("div", { class: "chain-foul" }, h("strong", null, "断"), h("span", null, forfeit.message))
    );
    replace(row.source, "本局于此收席");
    replace(row.next, "");
    replace(row.badge, "判负");
    row.badge.classList.add("is-failed");
    row.note.textContent = "";
    row.clock.classList.remove("is-late", "is-critical");
  }

  async runChain() {
    this.state = createChainState({
      startChar: this.spec.startChar,
      totalTurns: this.spec.totalTurns,
      fighters: this.spec.fighters,
    });
    this.memory = createChainMemory(this.spec.seed || randomId("chain"));
    this.buildTrack();
    this.updateCounts();
    const first = currentChainTurn(this.state);
    this.updateChainCenter(first, "thinking");

    while (!this.master.signal.aborted && this.state.status === "running") {
      const current = currentChainTurn(this.state);
      if (!current) break;
      await this.playChainTurn(current);
      if (this.master.signal.aborted) return;
      if (this.state.status === "running") {
        await sleep(this.pace.phasePause * 0.55, this.master.signal);
      }
    }
    if (this.master.signal.aborted) return;
    await this.judge();
  }

  async playChainTurn(current) {
    const side = current.side;
    const fighter = this.state.fighters[side];
    const label = sideName(side, "chain");
    this.setActive(side);
    this.updateChainCenter(current, "thinking");
    this.setStatus(`第 ${current.turn} / ${this.state.totalTurns} 回 · ${label} ${fighter.name} 沉吟中`);
    this.sound.tick();
    const row = this.addChainRow(current, fighter);
    const turnStart = performance.now();
    let selected = null;
    let forfeit = null;
    let feedback = "";
    let attempt = 0;
    let useLocal = this.localFallback;

    if (!useLocal) {
      while (attempt < 2 && !selected && !forfeit) {
        attempt += 1;
        const remaining = TURN_BUDGET - (performance.now() - turnStart);
        if (remaining < 2000) {
          forfeit = { reason: "timeout", message: "迟迟没有接令" };
          break;
        }
        row.note.textContent = attempt > 1 ? `首回未过：${feedback}` : "";
        let raw = "";
        try {
          raw = await this.callLLM({
            messages: chainMessages({
              requiredChar: current.requiredChar,
              fighter,
              used: this.state.used,
              turn: current.turn,
              limit: this.state.totalTurns,
              feedback,
            }),
            model: modelForSide(this.settings, side),
            maxTokens: 180,
            temperature: 1,
            timeoutMs: remaining,
          });
        } catch (error) {
          if (this.master.signal.aborted) throw error;
          if (error.code === "timeout") {
            forfeit = { reason: "timeout", message: "迟迟没有接令" };
          } else {
            this.degrade(error);
            useLocal = true;
          }
          break;
        }

        if (/^词穷[。！!]?$/.test(raw.trim())) {
          forfeit = { reason: "no_line", message: "再想不出一句" };
          break;
        }

        const check = validateChainAttempt(raw, {
          requiredChar: current.requiredChar,
          used: this.state.used,
          index: IDIOM_INDEX,
        });
        if (check.ok) {
          selected = {
            idiom: check.line,
            entry: check.entry,
            verified: check.verified,
            nextChar: check.nextChar,
          };
          break;
        }
        feedback = check.message;
        if (attempt >= 2) {
          forfeit = { reason: check.reason, message: check.message };
        } else {
          this.setStatus(`首回未过 · ${fighter.name} 再接一回`);
        }
      }
    }

    if (!selected && !forfeit) {
      this.updateChainCenter(current, "thinking");
      const delay =
        this.pace.thinkMax > 0
          ? this.pace.thinkMin + Math.random() * (this.pace.thinkMax - this.pace.thinkMin)
          : 0;
      await sleep(delay, this.master.signal);
      const pick = validatedOfflineChainPick({
        requiredChar: current.requiredChar,
        used: this.state.used,
        persona: fighter,
        memory: this.memory,
      });
      if (pick.ok) {
        selected = {
          idiom: pick.idiom,
          entry: pick.entry,
          verified: pick.verified,
          nextChar: pick.nextChar,
        };
      } else {
        forfeit = { reason: pick.reason || "no_line", message: "本地词库里也接不上了" };
      }
    }

    if (this.master.signal.aborted) return;

    if (forfeit) {
      const recorded = forfeitChain(this.state, forfeit);
      this.markChainFoul(row, recorded);
      this.setActive(null);
      this.updateCounts();
      this.updateTrack();
      this.updateChainCenter(current, "foul");
      setText(this.els.status, `${label} ${fighter.name} 断链 · 本局终`);
      this.sound.tick();
      return;
    }

    const decisionMs = performance.now() - turnStart;
    await this.revealChain(row, selected, decisionMs);
    recordChainTurn(this.state, {
      idiom: selected.idiom,
      entry: selected.entry,
      verified: selected.verified,
      latencyMs: decisionMs,
      raw: "",
    });
    this.updateCounts();
    this.updateTrack();
    this.updateChainCenter(current, "answered");
    this.setStatus(`${label} ${fighter.name} 接「${selected.idiom}」`);
    this.sound.chime();
  }

  async judge() {
    const started = performance.now();
    this.setActive(null);
    this.setStatus("裁判退席 · 正在写判词");
    this.showJudgeCard();
    this.sound.judge();
    const rubric =
      this.mode === "debate" ? DEBATE_RUBRIC : this.mode === "poetry" ? POETRY_RUBRIC : IDIOM_RUBRIC;
    const local = this.localVerdict();
    let decided = null;

    if (this.settings.engine === "llm" && !this.localFallback && this.state.status !== "forfeit") {
      try {
        const model = modelForSide(this.settings, "judge");
        const messages =
          this.mode === "debate"
            ? debateJudgeMessages({
                topic: this.spec.topic,
                fighters: this.state.fighters,
                transcript: this.state.transcript,
                format: this.state.format,
              })
            : this.mode === "poetry"
              ? poetryJudgeMessages({
                  keyword: this.spec.keyword,
                  fighters: this.state.fighters,
                  turns: this.state.turns,
                  forfeit: this.state.forfeit,
                })
              : chainJudgeMessages({
                  startChar: this.spec.startChar,
                  fighters: this.state.fighters,
                  turns: this.state.turns,
                  forfeit: this.state.forfeit,
                });
        const raw = await this.callLLM({
          messages,
          model,
          maxTokens: 900,
          temperature: 0.35,
          timeoutMs: 120_000,
        });
        const parsed = parseJudgeResponse(raw, rubric);
        if (parsed) {
          decided = {
            ...local,
            winner: parsed.winner,
            scores: parsed.scores,
            totals: parsed.totals,
            commentary: parsed.commentary,
            highlights: parsed.highlights.length ? parsed.highlights : local.highlights,
            bestLine: parsed.bestLine || local.bestLine || "",
            engine: "llm",
            judgeModel: model,
          };
        } else {
          this.degradeJudge(new Error("裁判没有返回可解析的 JSON"));
        }
      } catch (error) {
        if (this.master.signal.aborted) throw error;
        this.degradeJudge(error);
      }
    }

    if (!decided) decided = local;

    const elapsed = performance.now() - started;
    const minimum = prefersReducedMotion() ? 260 : 1000;
    if (elapsed < minimum) await sleep(minimum - elapsed, this.master.signal);
    if (this.master.signal.aborted) return;

    this.verdict = this.finalizeVerdict(decided);
    this.finished = true;
    this.markJudgeDone();
    this.updateTrack();
    this.updateCounts();
    this.setActive(null);
    setText(this.els.status, "本局终 · 判词已出");
    setText(this.els.sub, "本局终 · 判词已出");
    this.callbacks.onFinish?.(this.verdict);
    this.showEndMarker();
    this.openVerdict();
    this.sound.gong();
  }

  localVerdict() {
    if (this.mode === "debate") {
      return judgeDebateOffline({
        topic: this.spec.topic,
        fighters: this.state.fighters,
        transcript: this.state.transcript,
        format: this.state.format,
        seed: `${this.spec.seed}-judge`,
      });
    }
    if (this.mode === "poetry") {
      return judgePoetryOffline({
        keyword: this.spec.keyword,
        fighters: this.state.fighters,
        turns: this.state.turns,
        forfeit: this.state.forfeit,
        seed: `${this.spec.seed}-judge`,
      });
    }
    return judgeChainOffline({
      startChar: this.spec.startChar,
      fighters: this.state.fighters,
      turns: this.state.turns,
      forfeit: this.state.forfeit,
      seed: `${this.spec.seed}-judge`,
    });
  }

  finalizeVerdict(raw) {
    const isDebate = this.mode === "debate";
    const isPoetry = this.mode === "poetry";
    const isChain = this.mode === "chain";
    const durationMs = performance.now() - this.startedAt;
    const bestLine = isDebate ? "" : raw.bestLine || "";
    const bestEntry = isPoetry && bestLine ? findPoemEntry(bestLine) : null;
    const verifiedA = this.state.turns?.filter((turn) => turn.side === "A" && turn.verified).length ?? 0;
    const verifiedB = this.state.turns?.filter((turn) => turn.side === "B" && turn.verified).length ?? 0;
    const pendingA = this.state.turns?.filter((turn) => turn.side === "A" && !turn.verified).length ?? 0;
    const pendingB = this.state.turns?.filter((turn) => turn.side === "B" && !turn.verified).length ?? 0;

    return {
      ...raw,
      id: randomId("match"),
      mode: this.mode,
      title: isDebate
        ? this.spec.topic
        : isPoetry
          ? `飞花令 · 「${this.spec.keyword}」`
          : `成语接龙 · 起字「${this.spec.startChar}」`,
      subtitle: isDebate
        ? `${this.state.format.name} · ${this.state.format.phases.length} 阵 · ${this.state.fighters.A.name} 对 ${this.state.fighters.B.name}`
        : isPoetry
          ? `${this.spec.totalTurns} 句 · ${this.state.fighters.A.name} 对 ${this.state.fighters.B.name}`
          : `${this.spec.totalTurns} 回 · ${this.state.fighters.A.name} 对 ${this.state.fighters.B.name}`,
      topic: isDebate ? this.spec.topic : "",
      keyword: isPoetry ? this.spec.keyword : "",
      startChar: isChain ? this.spec.startChar : "",
      fighters: this.state.fighters,
      rubric: isDebate ? DEBATE_RUBRIC : isPoetry ? POETRY_RUBRIC : IDIOM_RUBRIC,
      bestLine,
      bestLabel: isChain ? "BEST IDIOM" : "BEST LINE",
      bestEntry,
      forfeit: this.state.forfeit || null,
      degraded: this.degraded,
      timestamp: Date.now(),
      stats: {
        durationMs,
        turns: isDebate ? this.state.transcript.length : this.state.turns.length,
        speechesA: isDebate ? this.state.transcript.filter((item) => item.side === "A").length : 0,
        speechesB: isDebate ? this.state.transcript.filter((item) => item.side === "B").length : 0,
        verifiedA,
        verifiedB,
        pendingA,
        pendingB,
      },
    };
  }

  showJudgeCard() {
    const card = h(
      "div",
      { class: "judge-row" },
      h("span", { class: "judge-seal" }, "评"),
      h(
        "div",
        null,
        h("strong", null, "裁判退席，正在写判词"),
        h("span", { class: "judge-line" }, h("i"), h("i"), h("i"))
      )
    );
    this.feed.appendChild(card);
    this.els.judgeRow = card;
    this.scrollToRow(card);
  }

  markJudgeDone() {
    if (!this.els.judgeRow) return;
    this.els.judgeRow.classList.add("is-done");
    replace(
      this.els.judgeRow,
      h("span", { class: "judge-seal" }, "判"),
      h(
        "div",
        null,
        h("strong", null, "裁判已落槌"),
        h("span", { class: "judge-line judge-line--done" }, "判词已收起，可在下方重看或再战。")
      )
    );
  }

  showEndMarker() {
    if (this.els.endMarker) return;
    const marker = h(
      "div",
      { class: "feed-end" },
      h("span", { class: "feed-end__seal" }, "终"),
      h(
        "div",
        { class: "feed-end__copy" },
        h("strong", null, "本局终 · 判词已出"),
        h("span", null, "可收起判词，回看全场；也可直接再战。")
      ),
      h(
        "button",
        {
          type: "button",
          class: "button button--ghost button--small",
          onClick: () => this.openVerdict(),
        },
        "重看判词"
      )
    );
    this.feed.appendChild(marker);
    this.els.endMarker = marker;
  }

  openVerdict() {
    if (!this.verdict) return;
    if (this.verdictDialog?.open) {
      this.verdictDialog.close();
      this.verdictDialog = null;
    }
    this.verdictDialog = showVerdictDialog({
      verdict: this.verdict,
      onRematch: () => this.callbacks.onRematch?.(),
      onLobby: () => this.callbacks.onLobby?.(),
      onClose: () => {},
    });
  }

  async handleExit() {
    if (this.exiting) return;
    if (this.finished) {
      this.dispose();
      this.callbacks.onLobby?.();
      return;
    }
    this.exiting = true;
    try {
      const confirmed = await confirmDialog({
        title: "就此离席？",
        message: "本局尚未落槌，记录不会保存。",
        detail: this.mode === "debate" ? "席上的发言会随页面一起撤去。" : "已经接过的令句也会随页面一起撤去。",
        confirmLabel: "离席",
        cancelLabel: "继续观战",
        danger: true,
      });
      if (!confirmed) return;
      this.dispose();
      this.callbacks.onLobby?.();
    } finally {
      this.exiting = false;
    }
  }

  createCallSignal(timeoutMs) {
    const controller = new AbortController();
    const record = { controller, timedOut: false, timer: null, masterHandler: null };
    this.calls.add(record);
    record.masterHandler = () => controller.abort();
    if (this.master.signal.aborted) controller.abort();
    else this.master.signal.addEventListener("abort", record.masterHandler, { once: true });
    if (timeoutMs && Number.isFinite(timeoutMs) && timeoutMs > 0) {
      record.timer = setTimeout(() => {
        record.timedOut = true;
        controller.abort();
      }, timeoutMs);
    }
    return {
      signal: controller.signal,
      timedOut: () => record.timedOut,
      cleanup: () => {
        if (record.timer) clearTimeout(record.timer);
        this.calls.delete(record);
        if (record.masterHandler) {
          this.master.signal.removeEventListener("abort", record.masterHandler);
        }
      },
    };
  }

  async callLLM({ messages, model, onDelta, maxTokens, temperature, timeoutMs }) {
    const call = this.createCallSignal(timeoutMs);
    try {
      return await streamChat(
        {
          endpoint: this.settings.endpoint,
          apiKey: this.settings.apiKey,
          model,
          messages,
          temperature,
          maxTokens,
        },
        (delta) => {
          if (this.master.signal.aborted) return;
          onDelta?.(delta);
        },
        call.signal
      );
    } catch (error) {
      if (call.timedOut() && !this.master.signal.aborted) {
        const timeoutError = new Error("模型沉吟超时");
        timeoutError.code = "timeout";
        throw timeoutError;
      }
      throw error;
    } finally {
      call.cleanup();
    }
  }

  showFatal(error) {
    this.setActive(null);
    this.setStatus("对局中断");
    const message = String(error?.message || error || "未知错误");
    const card = h(
      "div",
      { class: "arena-fatal" },
      h("span", { class: "arena-fatal__seal" }, "断"),
      h("h3", null, "对局中断"),
      h("p", null, `场上出现了意外：${message.slice(0, 200)}`),
      h(
        "button",
        {
          type: "button",
          class: "button button--ghost button--small",
          onClick: () => {
            this.dispose();
            this.callbacks.onLobby?.();
          },
        },
        "回到门厅"
      )
    );
    this.feed.appendChild(card);
    toast("对局中断，可回到门厅重新开席。", { tone: "error" });
  }
}
