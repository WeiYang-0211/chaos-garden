import test from "node:test";
import assert from "node:assert/strict";
import {
  choosePoetryLine,
  cleanTopic,
  createDebateMemory,
  createPoetryMemory,
  createRng,
  extractQuote,
  generateDebateSpeech,
  judgeDebateOffline,
  judgePoetryOffline,
  validatedOfflinePick,
} from "../src/core/offline.js";
import { DEBATE_FORMATS, DEBATE_PERSONAS, POETRY_PERSONAS, DEBATE_RUBRIC, POETRY_RUBRIC } from "../src/data/personas.js";
import { INDEX, normalizeLine } from "../src/core/poetry.js";
import { scoreTotal } from "../src/core/judge.js";

function buildTranscript({ topic = "远程办公利大于弊", format = "quick", seed = "battle" } = {}) {
  const memory = createDebateMemory(seed);
  const transcript = [];
  for (const phase of DEBATE_FORMATS[format].phases) {
    const fighter = DEBATE_PERSONAS.find((persona) => persona.id === (phase.side === "A" ? "mosho" : "zhuangsheng"));
    const text = generateDebateSpeech({ topic, side: phase.side, phase, fighter, transcript, memory });
    transcript.push({ side: phase.side, phase, phaseLabel: phase.label, text });
  }
  return transcript;
}

test("随机数在相同种子下可复现", () => {
  const a = createRng("abc");
  const b = createRng("abc");
  const valuesA = Array.from({ length: 8 }, () => a());
  const valuesB = Array.from({ length: 8 }, () => b());
  assert.deepEqual(valuesA, valuesB);
  assert.ok(valuesA.every((value) => value >= 0 && value < 1));
});

test("辩题清理", () => {
  assert.equal(cleanTopic("  远程办公利大于弊。 "), "远程办公利大于弊");
  assert.equal(cleanTopic("「AI」是否…"), "AI是否");
  assert.equal(cleanTopic(""), "这一命题");
});

test("本地辩手：四种人设都能产出有立场的发言", () => {
  for (const fighter of DEBATE_PERSONAS) {
    const phase = { ...DEBATE_FORMATS.quick.phases[0], side: "A" };
    const text = generateDebateSpeech({
      topic: "人类应当主动寻找外星文明",
      side: "A",
      phase,
      fighter,
      transcript: [],
      memory: createDebateMemory(`${fighter.id}-seed`),
    });
    assert.ok(text.length >= 140, `${fighter.name} 发言过短`);
    assert.match(text, /人类应当主动寻找外星文明/);
    assert.match(text, /成立/);
    assert.doesNotMatch(text, /作为AI|作为一个AI/);
  }
});

test("本地辩手：完整快辩，发言顺序与长度合理", () => {
  const transcript = buildTranscript();
  assert.equal(transcript.length, 6);
  assert.deepEqual(transcript.map((item) => item.side), ["A", "B", "A", "B", "A", "B"]);
  assert.deepEqual(transcript.map((item) => item.phase.kind), [
    "opening",
    "opening",
    "rebuttal",
    "rebuttal",
    "closing",
    "closing",
  ]);
  for (const item of transcript) {
    assert.ok(item.text.length >= 130, `${item.side}-${item.phase.kind} 太短`);
    if (item.phase.kind === "rebuttal" || item.phase.kind === "free") {
      assert.match(item.text, /对方/);
    }
  }
});

test("本地辩手：引用对方时不会带出未闭合的引号", () => {
  const transcript = buildTranscript({ seed: "quote-check" });
  const rng = createRng("quote-only");
  const quote = extractQuote(transcript, "A", rng);
  assert.ok(quote.length <= 35);
  assert.doesNotMatch(quote, /[「」“”"]/);
});

test("本地裁判：分数在区间内，判词非空，总分一致", () => {
  const transcript = buildTranscript({ format: "full" });
  const verdict = judgeDebateOffline({
    topic: "远程办公利大于弊",
    fighters: { A: DEBATE_PERSONAS[0], B: DEBATE_PERSONAS[1] },
    transcript,
    format: DEBATE_FORMATS.full,
    seed: "judge",
  });
  assert.ok(["A", "B", "draw"].includes(verdict.winner));
  assert.ok(verdict.commentary.length > 40);
  for (const side of ["A", "B"]) {
    for (const item of DEBATE_RUBRIC) {
      const score = verdict.scores[side][item.key];
      assert.ok(score >= 0 && score <= item.max, `${side}.${item.key}=${score}`);
    }
    assert.equal(verdict.totals[side], Math.round(scoreTotal(verdict.scores[side], DEBATE_RUBRIC) * 10) / 10);
  }
  if (verdict.winner === "A") assert.ok(verdict.totals.A >= verdict.totals.B);
  if (verdict.winner === "B") assert.ok(verdict.totals.B >= verdict.totals.A);
});

test("本地飞花令：按人设选句，避开已用句，且都含令字", () => {
  const memory = createPoetryMemory("poem-battle");
  const used = [];
  for (let index = 0; index < 16; index += 1) {
    const side = index % 2 === 0 ? "A" : "B";
    const persona = side === "A" ? POETRY_PERSONAS[0] : POETRY_PERSONAS[1];
    const entry = choosePoetryLine({
      keyword: "月",
      used,
      persona,
      index: INDEX,
      memory,
    });
    assert.ok(entry, `第 ${index + 1} 句没有取到`);
    assert.ok(entry.text.includes("月"));
    assert.ok(!used.includes(entry.text));
    used.push(entry.text);
  }
  assert.equal(new Set(used).size, 16);
});

test("本地飞花令：库外/重复校验与取句结果一致", () => {
  const memory = createPoetryMemory("valid-check");
  const first = validatedOfflinePick({
    keyword: "花",
    used: [],
    persona: POETRY_PERSONAS[2],
    index: INDEX,
    memory,
  });
  assert.equal(first.ok, true);
  assert.equal(first.verified, true);
  const second = validatedOfflinePick({
    keyword: "花",
    used: [first.line],
    persona: POETRY_PERSONAS[3],
    index: INDEX,
    memory,
  });
  assert.equal(second.ok, true);
  assert.notEqual(normalizeLine(second.line), normalizeLine(first.line));
});

test("本地飞花令裁判：无失律时定胜负，失律时另一方收席", () => {
  const fighters = { A: POETRY_PERSONAS[0], B: POETRY_PERSONAS[1] };
  const turns = [
    { side: "A", turn: 1, line: "海上生明月", verified: true, entry: INDEX.byText.get("海上生明月"), latencyMs: 1900 },
    { side: "B", turn: 2, line: "举头望明月", verified: true, entry: INDEX.byText.get("举头望明月"), latencyMs: 2200 },
    { side: "A", turn: 3, line: "明月松间照", verified: true, entry: INDEX.byText.get("明月松间照"), latencyMs: 1700 },
    { side: "B", turn: 4, line: "月落乌啼霜满天", verified: true, entry: INDEX.byText.get("月落乌啼霜满天"), latencyMs: 3100 },
  ];

  const normal = judgePoetryOffline({ keyword: "月", fighters, turns, seed: "normal" });
  assert.ok(["A", "B", "draw"].includes(normal.winner));
  for (const side of ["A", "B"]) {
    for (const item of POETRY_RUBRIC) {
      const score = normal.scores[side][item.key];
      assert.ok(score >= 0 && score <= item.max, `${side}.${item.key}=${score}`);
    }
    assert.equal(normal.totals[side], Math.round(scoreTotal(normal.scores[side], POETRY_RUBRIC) * 10) / 10);
  }
  assert.ok(normal.commentary.includes("月"));

  const forfeit = judgePoetryOffline({
    keyword: "月",
    fighters,
    turns,
    forfeit: { side: "B", reason: "duplicate", message: "重句：这一句已经用过了" },
    seed: "forfeit",
  });
  assert.equal(forfeit.winner, "A");
  assert.ok(forfeit.commentary.includes("重句"));
});
