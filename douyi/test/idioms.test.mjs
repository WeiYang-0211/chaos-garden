import test from "node:test";
import assert from "node:assert/strict";
import { IDIOMS } from "../src/data/idioms.js";
import {
  CHAIN_CORE,
  CHAIN_CORE_INDEX,
  FEATURED_CHAIN_STARTS,
  IDIOM_LENGTH,
  IDIOM_INDEX,
  chainStartStats,
  extractIdiomCandidates,
  normalizeIdiom,
  validateChainAttempt,
} from "../src/core/idioms.js";

test("成语库：四字、唯一、均为汉字", () => {
  assert.ok(IDIOMS.length >= 1000, `成语库只有 ${IDIOMS.length} 条`);
  const seen = new Set();
  for (const idiom of IDIOMS) {
    assert.equal([...idiom].length, IDIOM_LENGTH, `${idiom} 不是四字`);
    assert.equal(normalizeIdiom(idiom), idiom, `${idiom} 含非汉字`);
    assert.ok(!seen.has(idiom), `${idiom} 重复`);
    seen.add(idiom);
  }
  assert.equal(IDIOM_INDEX.byText.size, IDIOMS.length);
  assert.equal(CHAIN_CORE_INDEX.idioms.length, CHAIN_CORE.size);
});

test("接龙核心是闭合的：每个末字都有可接的下一句", () => {
  assert.ok(CHAIN_CORE.size >= 250, `核心只有 ${CHAIN_CORE.size} 条`);
  const firsts = new Set(CHAIN_CORE_INDEX.idioms.map((idiom) => [...idiom][0]));
  for (const idiom of CHAIN_CORE) {
    assert.ok(firsts.has([...idiom][3]), `${idiom} 的末字没有可接项`);
  }
});

test("起字统计：每个精选起字都有词可接", () => {
  const stats = chainStartStats();
  assert.deepEqual(stats.map((item) => item.char), FEATURED_CHAIN_STARTS);
  for (const item of stats) {
    assert.ok(item.count >= 4, `起字「${item.char}」只有 ${item.count} 条`);
  }
});

test("接龙校验：命中词库、首字严格相接", () => {
  const first = validateChainAttempt("一心一意", { requiredChar: "一" });
  assert.equal(first.ok, true);
  assert.equal(first.verified, true);
  assert.equal(first.nextChar, "意");

  const second = validateChainAttempt("意气风发", { requiredChar: "意" });
  assert.equal(second.verified, true);
  assert.equal(second.nextChar, "发");
});

test("接龙校验：首字不对、重复、空文本都会失败", () => {
  const wrong = validateChainAttempt("一帆风顺", { requiredChar: "天" });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.reason, "start");

  const duplicate = validateChainAttempt("一心一意", {
    requiredChar: "一",
    used: ["一心一意"],
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason, "duplicate");

  const empty = validateChainAttempt("词穷", { requiredChar: "一" });
  assert.equal(empty.ok, false);
  assert.equal(empty.reason, "empty");

  const tooLong = validateChainAttempt("一心一意一鸣惊人", { requiredChar: "一" });
  assert.equal(tooLong.ok, true);
  assert.ok(["一心一意", "一鸣惊人"].includes(tooLong.line));
});

test("接龙校验：库外成语放行并标待考", () => {
  const pending = validateChainAttempt("天外有天", { requiredChar: "天" });
  assert.equal(pending.ok, true);
  assert.equal(pending.verified, false);
  assert.equal(pending.entry, null);
  assert.equal(pending.nextChar, "天");
});

test("候选提取：剥前缀、按标点切分、从长句里找库中四字串", () => {
  assert.deepEqual(extractIdiomCandidates("成语：一心一意", "一"), ["一心一意"]);
  assert.deepEqual(extractIdiomCandidates("我接一心一意，再接一鸣惊人。", "一"), ["一心一意", "一鸣惊人"]);
  assert.deepEqual(extractIdiomCandidates("不是成语吧", "一"), []);
});

test("候选提取：不要误把以「接」「答」开头的成语当提示词", () => {
  const jie = validateChainAttempt("接踵而至", { requiredChar: "接" });
  assert.equal(jie.ok, true);
  assert.equal(jie.line, "接踵而至");
  const da = validateChainAttempt("答非所问", { requiredChar: "答" });
  assert.equal(da.ok, true);
  assert.equal(da.line, "答非所问");
});

test("字库辅助：normalize 与四字判定", () => {
  assert.equal(normalizeIdiom(" 一心一意。 "), "一心一意");
  assert.equal(normalizeIdiom("abc"), "");
  assert.equal([...normalizeIdiom("天外有天")].length, 4);
});
