import test from "node:test";
import assert from "node:assert/strict";
import { POEMS } from "../src/data/poetry.js";
import {
  FEATURED_KEYWORDS,
  INDEX,
  buildKeywordFromIndex,
  buildPoetryIndex,
  extractPoetryCandidates,
  featuredKeywords,
  findPoemEntry,
  isSingleHanChar,
  keywordCount,
  normalizeLine,
  validatePoetryAttempt,
} from "../src/core/poetry.js";

test("诗库完整：字段齐全、文本唯一、只有汉字", () => {
  assert.ok(POEMS.length >= 400, `诗库只有 ${POEMS.length} 句`);
  const seen = new Set();
  for (const poem of POEMS) {
    for (const key of ["text", "author", "title", "dynasty", "form"]) {
      assert.equal(typeof poem[key], "string");
      assert.ok(poem[key].length > 0, `${poem.text} 缺 ${key}`);
    }
    assert.equal(normalizeLine(poem.text), poem.text, `${poem.text} 含标点或非汉字`);
    assert.ok(poem.text.length >= 3 && poem.text.length <= 24, `${poem.text} 长度异常`);
    assert.ok(!seen.has(poem.text), `${poem.text} 重复`);
    seen.add(poem.text);
  }
  assert.equal(INDEX.byText.size, POEMS.length);
});

test("常见令字均有足够句数", () => {
  for (const keyword of FEATURED_KEYWORDS) {
    const count = keywordCount(INDEX, keyword);
    assert.ok(count >= 8, `令字「${keyword}」只有 ${count} 句`);
  }
});

test("索引按字返回诗句，且没有重复对象", () => {
  const list = INDEX.byChar.get("月");
  assert.ok(list.length >= 8);
  assert.ok(list.every((poem) => poem.text.includes("月")));
  assert.equal(new Set(list.map((poem) => poem.text)).size, list.length);
  assert.equal(findPoemEntry("海上生明月")?.author, "张九龄");
  assert.equal(findPoemEntry("诗句：海上生明月——张九龄")?.author, "张九龄");
});

test("校验：库中句命中", () => {
  const result = validatePoetryAttempt("海上生明月", { keyword: "月", index: INDEX });
  assert.equal(result.ok, true);
  assert.equal(result.verified, true);
  assert.equal(result.entry.author, "张九龄");
  assert.equal(result.line, "海上生明月");
});

test("校验：能从模型格式里剥出诗句", () => {
  const result = validatePoetryAttempt("诗句：「春江潮水连海平」——张若虚《春江花月夜》", {
    keyword: "月",
    index: INDEX,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "keyword");

  const result2 = validatePoetryAttempt("接令：「海上生明月」——张九龄《望月怀远》", {
    keyword: "月",
    index: INDEX,
  });
  assert.equal(result2.ok, true);
  assert.equal(result2.verified, true);
  assert.equal(result2.entry.title, "望月怀远");
});

test("校验：库外名句放行但标明待考", () => {
  const result = validatePoetryAttempt("明月何时照我还", { keyword: "月", index: INDEX });
  assert.equal(result.ok, true);
  assert.equal(result.verified, false);
  assert.equal(result.entry, null);
  assert.equal(result.line, "明月何时照我还");
});

test("校验：缺令字、重复、过长都会被拦下", () => {
  const missing = validatePoetryAttempt("春江潮水连海平", { keyword: "月", index: INDEX });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "keyword");

  const duplicate = validatePoetryAttempt("海上生明月", {
    keyword: "月",
    used: ["海上生明月"],
    index: INDEX,
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason, "duplicate");

  const contained = validatePoetryAttempt("海上生明月天涯共此时", {
    keyword: "月",
    used: ["海上生明月"],
    index: INDEX,
  });
  assert.equal(contained.ok, false);
  assert.equal(contained.reason, "duplicate");

  const tooLong = validatePoetryAttempt("月".repeat(25), { keyword: "月", index: INDEX });
  assert.equal(tooLong.ok, false);
  assert.equal(tooLong.reason, "too_long");
});

test("校验：输入不是诗句时给出可读原因", () => {
  const empty = validatePoetryAttempt("词穷", { keyword: "月", index: INDEX });
  assert.equal(empty.ok, false);
  assert.equal(empty.reason, "keyword");

  const nonsense = validatePoetryAttempt("。。。", { keyword: "月", index: INDEX });
  assert.equal(nonsense.ok, false);
  assert.equal(nonsense.reason, "empty");
});

test("候选提取：按句读切分、去除序号与引号", () => {
  const candidates = extractPoetryCandidates("1. 海上生明月，天涯共此时。\n2.『举头望明月』");
  const normalized = candidates.map((item) => item.normalized);
  assert.deepEqual(normalized, ["海上生明月", "天涯共此时", "举头望明月"]);
});

test("令字：必须是单个汉字", () => {
  assert.equal(isSingleHanChar("月"), true);
  assert.equal(isSingleHanChar("月亮"), false);
  assert.equal(isSingleHanChar("a"), false);
  assert.equal(isSingleHanChar(""), false);
});

test("动态建库与高频令字", () => {
  const custom = [
    { text: "月出惊山鸟", author: "王维", title: "鸟鸣涧", dynasty: "唐", form: "诗" },
    { text: "月落乌啼霜满天", author: "张继", title: "枫桥夜泊", dynasty: "唐", form: "诗" },
  ];
  const index = buildPoetryIndex(custom);
  assert.equal(keywordCount(index, "月"), 2);
  assert.equal(keywordCount(index, "山"), 1);
  assert.equal(index.byText.size, 2);

  const ranked = buildKeywordFromIndex(INDEX);
  assert.ok(ranked.length > 10);
  assert.equal(ranked[0].count >= ranked[1].count, true);
  assert.deepEqual(featuredKeywords(INDEX).map((item) => item.char), FEATURED_KEYWORDS);
});
