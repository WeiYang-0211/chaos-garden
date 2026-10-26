import test from "node:test";
import assert from "node:assert/strict";
import {
  createDebateState,
  createPoetryState,
  currentDebatePhase,
  currentPoetryTurn,
  debateComplete,
  forfeitPoetry,
  poetryComplete,
  recordDebateSpeech,
  recordPoetryTurn,
  sideStats,
} from "../src/core/battle.js";
import { DEBATE_FORMATS, DEBATE_PERSONAS, POETRY_PERSONAS } from "../src/data/personas.js";

const fighters = { A: DEBATE_PERSONAS[0], B: DEBATE_PERSONAS[1] };
const poets = { A: POETRY_PERSONAS[0], B: POETRY_PERSONAS[1] };

test("辩论状态机：阶段顺序正确，最后一轮进入评议", () => {
  const state = createDebateState({ topic: "测试辩题", formatId: "full", fighters });
  assert.equal(state.status, "running");
  assert.equal(currentDebatePhase(state).side, "A");

  const expected = DEBATE_FORMATS.full.phases.map((phase) => phase.side);
  const seen = [];
  for (const phase of DEBATE_FORMATS.full.phases) {
    const current = currentDebatePhase(state);
    assert.equal(current.id, phase.id);
    seen.push(current.side);
    recordDebateSpeech(state, { text: `第 ${phase.index} 阵发言`, latencyMs: 10 });
  }
  assert.deepEqual(seen, expected);
  assert.equal(debateComplete(state), true);
  assert.equal(state.status, "judging");
  assert.equal(currentDebatePhase(state), null);
  assert.equal(state.transcript.length, 10);
});

test("辩论状态机：没有下一阵时拒绝记录", () => {
  const state = createDebateState({ topic: "测试辩题", formatId: "quick", fighters });
  for (const phase of DEBATE_FORMATS.quick.phases) {
    recordDebateSpeech(state, { text: `发言 ${phase.index}` });
  }
  assert.throws(() => recordDebateSpeech(state, { text: "多余" }), /无下一阵/);
  assert.equal(sideStats(state, "A").speeches, 3);
  assert.equal(sideStats(state, "B").speeches, 3);
});

test("飞花令状态机：双方交替，句数用完进入评议", () => {
  const state = createPoetryState({ keyword: "月", totalTurns: 4, fighters: poets });
  const sides = [];
  while (state.status === "running") {
    const current = currentPoetryTurn(state);
    sides.push(current.side);
    recordPoetryTurn(state, {
      line: `${current.turn}月`,
      verified: true,
      latencyMs: 100 * current.turn,
    });
  }
  assert.deepEqual(sides, ["A", "B", "A", "B"]);
  assert.equal(state.status, "judging");
  assert.equal(state.turns.length, 4);
  assert.equal(state.used.length, 4);
  assert.equal(poetryComplete(state), true);
  assert.equal(currentPoetryTurn(state), null);
  assert.deepEqual(sideStats(state, "A"), { lines: 2, verified: 2 });
});

test("飞花令状态机：判负记录当前一方，之后不能继续", () => {
  const state = createPoetryState({ keyword: "月", totalTurns: 8, fighters: poets });
  recordPoetryTurn(state, { line: "海上生明月", verified: true });
  const forfeit = forfeitPoetry(state, { reason: "duplicate", message: "这一句已经用过了" });
  assert.equal(forfeit.side, "B");
  assert.equal(forfeit.turn, 2);
  assert.equal(state.status, "forfeit");
  assert.equal(state.forfeit.reason, "duplicate");
  assert.throws(() => recordPoetryTurn(state, { line: "举头望明月" }), /已经结束/);
  assert.equal(currentPoetryTurn(state), null);
});

test("飞花令状态机：可以重复判负但不会覆盖第一次", () => {
  const state = createPoetryState({ keyword: "月", totalTurns: 8, fighters: poets });
  const first = forfeitPoetry(state, { reason: "empty", message: "无句" });
  const second = forfeitPoetry(state, { reason: "timeout", message: "超时" });
  assert.deepEqual(first, second);
  assert.equal(state.forfeit.reason, "empty");
});
