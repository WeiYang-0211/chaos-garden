import { DEBATE_FORMATS } from "../data/personas.js";

export function createDebateState({ topic, formatId = "quick", fighters }) {
  const format = DEBATE_FORMATS[formatId];
  if (!format) throw new Error(`未知赛制：${formatId}`);
  return {
    mode: "debate",
    topic,
    formatId,
    format,
    fighters,
    phaseIndex: 0,
    transcript: [],
    status: "running",
    startedAt: Date.now(),
  };
}

export function currentDebatePhase(state) {
  if (state.mode !== "debate") return null;
  return state.format.phases[state.phaseIndex] || null;
}

export function recordDebateSpeech(state, { text, latencyMs = 0, source = "local" }) {
  if (state.mode !== "debate") throw new Error("不是辩论对局");
  const phase = currentDebatePhase(state);
  if (!phase) throw new Error("本局已无下一阵");

  const entry = {
    side: phase.side,
    phase,
    phaseLabel: `${phase.label} · ${phase.scene}`,
    text,
    latencyMs,
    source,
  };
  state.transcript.push(entry);
  state.phaseIndex += 1;
  if (state.phaseIndex >= state.format.phases.length) state.status = "judging";
  return entry;
}

export function debateComplete(state) {
  return state.phaseIndex >= state.format.phases.length;
}

export function createPoetryState({ keyword, totalTurns = 12, fighters }) {
  return {
    mode: "poetry",
    keyword,
    totalTurns,
    fighters,
    turn: 1,
    side: "A",
    turns: [],
    used: [],
    forfeit: null,
    status: "running",
    startedAt: Date.now(),
  };
}

export function currentPoetryTurn(state) {
  if (state.mode !== "poetry") return null;
  if (state.status !== "running") return null;
  return {
    side: state.side,
    turn: state.turn,
    remaining: state.totalTurns - state.turn + 1,
  };
}

export function recordPoetryTurn(state, { line, entry = null, verified = false, latencyMs = 0, raw = "" }) {
  if (state.mode !== "poetry") throw new Error("不是飞花令对局");
  if (state.status !== "running") throw new Error("本局已经结束");

  const side = state.side;
  const turn = state.turn;
  const record = { side, turn, line, entry, verified, latencyMs, raw };
  state.turns.push(record);
  state.used.push(line);

  state.turn += 1;
  if (state.turn > state.totalTurns) {
    state.status = "judging";
  } else {
    state.side = side === "A" ? "B" : "A";
  }

  return record;
}

export function forfeitPoetry(state, { reason, message }) {
  if (state.mode !== "poetry") throw new Error("不是飞花令对局");
  if (state.status !== "running") return state.forfeit;
  const forfeit = { side: state.side, turn: state.turn, reason, message };
  state.forfeit = forfeit;
  state.status = "forfeit";
  return forfeit;
}

export function poetryComplete(state) {
  return state.status !== "running";
}

export function createChainState({ startChar, totalTurns = 12, fighters }) {
  return {
    mode: "chain",
    startChar,
    requiredChar: startChar,
    totalTurns,
    fighters,
    turn: 1,
    side: "A",
    turns: [],
    used: [],
    forfeit: null,
    status: "running",
    startedAt: Date.now(),
  };
}

export function currentChainTurn(state) {
  if (state.mode !== "chain") return null;
  if (state.status !== "running") return null;
  return {
    side: state.side,
    turn: state.turn,
    requiredChar: state.requiredChar,
    remaining: state.totalTurns - state.turn + 1,
  };
}

export function recordChainTurn(state, { idiom, entry = null, verified = false, latencyMs = 0, raw = "" }) {
  if (state.mode !== "chain") throw new Error("不是成语接龙对局");
  if (state.status !== "running") throw new Error("本局已经结束");

  const side = state.side;
  const turn = state.turn;
  const last = [...String(idiom)][3] ?? "";
  const record = { side, turn, idiom, line: idiom, entry, verified, latencyMs, raw, requiredChar: state.requiredChar };
  state.turns.push(record);
  state.used.push(idiom);
  state.requiredChar = last;
  state.turn += 1;

  if (state.turn > state.totalTurns) {
    state.status = "judging";
  } else {
    state.side = side === "A" ? "B" : "A";
  }

  return record;
}

export function forfeitChain(state, { reason, message }) {
  if (state.mode !== "chain") throw new Error("不是成语接龙对局");
  if (state.status !== "running") return state.forfeit;
  const forfeit = { side: state.side, turn: state.turn, requiredChar: state.requiredChar, reason, message };
  state.forfeit = forfeit;
  state.status = "forfeit";
  return forfeit;
}

export function chainComplete(state) {
  return state.status !== "running";
}

export function sideStats(state, side) {
  if (state.mode === "debate") {
    return { speeches: state.transcript.filter((item) => item.side === side).length };
  }
  const turns = state.turns.filter((item) => item.side === side);
  return {
    lines: turns.length,
    verified: turns.filter((item) => item.verified).length,
  };
}
