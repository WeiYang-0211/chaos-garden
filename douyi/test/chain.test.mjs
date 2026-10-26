import test from "node:test";
import assert from "node:assert/strict";
import {
  chainComplete,
  createChainState,
  currentChainTurn,
  forfeitChain,
  recordChainTurn,
} from "../src/core/battle.js";
import {
  createChainMemory,
  judgeChainOffline,
  validatedOfflineChainPick,
} from "../src/core/offline.js";
import { CHAIN_CORE_INDEX, chainStartStats, validateChainAttempt } from "../src/core/idioms.js";
import { CHAIN_TURN_OPTIONS, IDIOM_PERSONAS, IDIOM_RUBRIC } from "../src/data/personas.js";
import { scoreTotal } from "../src/core/judge.js";

const fighters = { A: IDIOM_PERSONAS[0], B: IDIOM_PERSONAS[1] };

function playLocalChain(startChar, totalTurns = 12, seed = "chain-test") {
  const state = createChainState({ startChar, totalTurns, fighters });
  const memory = createChainMemory(`${startChar}-${seed}`);
  while (state.status === "running") {
    const current = currentChainTurn(state);
    const fighter = state.fighters[current.side];
    const pick = validatedOfflineChainPick({
      requiredChar: current.requiredChar,
      used: state.used,
      persona: fighter,
      memory,
    });
    if (!pick.ok) {
      forfeitChain(state, { reason: pick.reason || "no_line", message: "接不上了" });
      break;
    }
    assert.equal(pick.idiom[0], current.requiredChar, "接龙首字没有对上");
    assert.ok(!state.used.includes(pick.idiom), "接龙出现重句");
    recordChainTurn(state, {
      idiom: pick.idiom,
      entry: pick.entry,
      verified: pick.verified,
      latencyMs: 1800 + Math.random() * 1200,
    });
  }
  return state;
}

test("接龙状态机：首字起令、末字接续、双方交替", () => {
  const state = createChainState({ startChar: "一", totalTurns: 4, fighters });
  assert.equal(currentChainTurn(state).side, "A");
  assert.equal(currentChainTurn(state).requiredChar, "一");

  recordChainTurn(state, { idiom: "一心一意", verified: true });
  assert.equal(state.requiredChar, "意");
  assert.equal(currentChainTurn(state).side, "B");

  recordChainTurn(state, { idiom: "意气风发", verified: true });
  assert.equal(state.requiredChar, "发");
  assert.equal(currentChainTurn(state).side, "A");

  recordChainTurn(state, { idiom: "发人深省", verified: true });
  assert.equal(currentChainTurn(state).requiredChar, "省");

  recordChainTurn(state, { idiom: "省吃俭用", verified: true });
  assert.equal(chainComplete(state), true);
  assert.equal(state.status, "judging");
  assert.equal(currentChainTurn(state), null);
  assert.equal(state.turns.length, 4);
  assert.equal(state.used.length, 4);
});

test("接龙状态机：判负记录当前一方，之后不能继续", () => {
  const state = createChainState({ startChar: "一", totalTurns: 8, fighters });
  recordChainTurn(state, { idiom: "一心一意", verified: true });
  const forfeit = forfeitChain(state, { reason: "no_line", message: "接不上了" });
  assert.equal(forfeit.side, "B");
  assert.equal(forfeit.requiredChar, "意");
  assert.equal(state.status, "forfeit");
  assert.equal(currentChainTurn(state), null);
  assert.throws(() => recordChainTurn(state, { idiom: "意气风发" }), /已经结束/);
});

test("本地词客：每个精选起字都能接满十二回", () => {
  for (const { char } of chainStartStats()) {
    const state = playLocalChain(char, 12, "complete");
    assert.equal(state.status, "judging", `起字「${char}」没有接满：${state.forfeit?.message || ""}`);
    assert.equal(state.turns.length, 12);
    assert.equal(state.used.length, 12);
    assert.ok(state.turns.every((turn) => validateChainAttempt(turn.line, { requiredChar: turn.requiredChar }).ok));
  }
});

test("本地词客：每一步都从可接核心里取词，且不重复", () => {
  const state = playLocalChain("水", 12, "used");
  const seen = new Set();
  for (const turn of state.turns) {
    assert.ok(CHAIN_CORE_INDEX.byText.has(turn.line), `${turn.line} 不在可接核心`);
    assert.ok(!seen.has(turn.line));
    seen.add(turn.line);
  }
});

test("接龙裁判：分数在区间内、总分一致、判词提到起字", () => {
  const state = playLocalChain("一", 12, "judge");
  const verdict = judgeChainOffline({
    startChar: "一",
    fighters,
    turns: state.turns,
    seed: "judge",
  });
  assert.ok(["A", "B", "draw"].includes(verdict.winner));
  assert.ok(verdict.commentary.includes("一"));
  for (const side of ["A", "B"]) {
    for (const item of IDIOM_RUBRIC) {
      const score = verdict.scores[side][item.key];
      assert.ok(score >= 0 && score <= item.max, `${side}.${item.key}=${score}`);
    }
    assert.equal(verdict.totals[side], Math.round(scoreTotal(verdict.scores[side], IDIOM_RUBRIC) * 10) / 10);
  }
  assert.ok(state.turns.some((turn) => turn.line === verdict.bestLine));
  if (verdict.winner === "A") assert.ok(verdict.totals.A >= verdict.totals.B);
  if (verdict.winner === "B") assert.ok(verdict.totals.B >= verdict.totals.A);
});

test("接龙裁判：一方断链时另一方收席", () => {
  const state = createChainState({ startChar: "一", totalTurns: 8, fighters });
  recordChainTurn(state, { idiom: "一心一意", verified: true, entry: { text: "一心一意" } });
  forfeitChain(state, { reason: "no_line", message: "接不上了" });
  assert.equal(state.forfeit.side, "B");
  const verdict = judgeChainOffline({
    startChar: "一",
    fighters,
    turns: state.turns,
    forfeit: state.forfeit,
    seed: "forfeit",
  });
  assert.equal(verdict.winner, "A");
  assert.ok(verdict.commentary.includes("接不上了"));
  assert.ok(verdict.bestLine);
});

test("接龙配置：三种回合选项与四位词客", () => {
  assert.deepEqual(CHAIN_TURN_OPTIONS.map((item) => item.value), [8, 12, 16]);
  assert.equal(IDIOM_PERSONAS.length, 4);
  assert.equal(new Set(IDIOM_PERSONAS.map((item) => item.id)).size, 4);
});
