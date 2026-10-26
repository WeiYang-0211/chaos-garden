import test from "node:test";
import assert from "node:assert/strict";
import { extractJsonObject, normalizeJudgePayload, parseJudgeResponse, scoreTotal } from "../src/core/judge.js";
import { DEBATE_RUBRIC, POETRY_RUBRIC } from "../src/data/personas.js";

test("从围栏与寒暄中抠出 JSON", () => {
  const raw = '好的，判词如下：\n```json\n{"winner":"A","scores":{"A":{},"B":{}},"commentary":"胜在驳论。"}\n```\n以上。';
  const payload = extractJsonObject(raw);
  assert.equal(payload.winner, "A");
  assert.equal(payload.commentary, "胜在驳论。");
});

test("JSON 里带转义引号与花括号也能解析", () => {
  const raw = '{"winner":"B","scores":{"A":{},"B":{}},"commentary":"他说「先问定义」，然后写下 {代价}。"}';
  assert.deepEqual(extractJsonObject(raw), {
    winner: "B",
    scores: { A: {}, B: {} },
    commentary: "他说「先问定义」，然后写下 {代价}。",
  });
  assert.equal(extractJsonObject("没有对象"), null);
});

test("裁判分数会被夹到合法区间并计算总分", () => {
  const payload = normalizeJudgePayload(
    {
      winner: "A",
      scores: {
        A: { structure: 99, rebuttal: -2, expression: 22.25, poise: 20 },
        B: { structure: 20, rebuttal: 21, expression: 22, poise: 23 },
      },
      commentary: "裁判退席。",
      highlights: ["一条", "", "二条"],
    },
    DEBATE_RUBRIC
  );
  assert.equal(payload.scores.A.structure, 25);
  assert.equal(payload.scores.A.rebuttal, 0);
  assert.equal(payload.scores.A.expression, 22.3);
  assert.equal(payload.winner, "A");
  assert.equal(payload.totals.A, Math.round(scoreTotal(payload.scores.A, DEBATE_RUBRIC) * 10) / 10);
  assert.deepEqual(payload.highlights, ["一条", "二条"]);
});

test("缺少胜者时按分数补判，缺少判词时拒绝", () => {
  const payload = normalizeJudgePayload(
    {
      scores: {
        A: { accuracy: 20, breadth: 20, imagery: 10, wit: 10 },
        B: { accuracy: 29, breadth: 29, imagery: 19, wit: 19 },
      },
      commentary: "乙方更广。",
    },
    POETRY_RUBRIC
  );
  assert.equal(payload.winner, "B");
  assert.equal(payload.totals.B, 96);
  assert.equal(normalizeJudgePayload({ scores: { A: {}, B: {} } }, POETRY_RUBRIC), null);
});

test("parseJudgeResponse 串起抠取与清洗", () => {
  const raw = '```json\n{"winner":"draw","scores":{"A":{"accuracy":20,"breadth":20,"imagery":10,"wit":10},"B":{"accuracy":20,"breadth":20,"imagery":10,"wit":10}},"commentary":"各得半席。"}\n```';
  const payload = parseJudgeResponse(raw, POETRY_RUBRIC);
  assert.equal(payload.winner, "draw");
  assert.equal(payload.totals.A, 60);
  assert.equal(payload.commentary, "各得半席。");
});
