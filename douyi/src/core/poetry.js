import { POEMS } from "../data/poetry.js";

export const MAX_LINE_LENGTH = 24;

export const FEATURED_KEYWORDS = ["月", "花", "风", "春", "山", "水", "云", "酒", "雪", "江", "秋", "人", "天", "夜"];

const HAN = /\p{Script=Han}/gu;

export function normalizeLine(text) {
  return String(text ?? "").match(HAN)?.join("") ?? "";
}

export function isSingleHanChar(value) {
  const text = String(value ?? "").trim();
  return text.length === 1 && /^\p{Script=Han}$/u.test(text);
}

export function buildPoetryIndex(poems = POEMS) {
  const byChar = new Map();
  const byText = new Map();

  for (const poem of poems) {
    const text = normalizeLine(poem.text);
    if (!text) continue;
    byText.set(text, poem);
    for (const char of new Set(text)) {
      if (!byChar.has(char)) byChar.set(char, []);
      byChar.get(char).push(poem);
    }
  }

  for (const list of byChar.values()) {
    list.sort((a, b) => a.text.length - b.text.length || a.text.localeCompare(b.text, "zh"));
  }

  return { poems, byChar, byText };
}

export const INDEX = buildPoetryIndex();

export function keywordCount(index, keyword) {
  return index.byChar.get(keyword)?.length ?? 0;
}

export function featuredKeywords(index = INDEX) {
  return FEATURED_KEYWORDS.map((char) => ({ char, count: keywordCount(index, char) }));
}

export function findPoemEntry(text, index = INDEX) {
  const normalized = normalizeLine(text);
  if (!normalized) return null;
  const exact = index.byText.get(normalized);
  if (exact) return exact;

  let best = null;
  for (const poem of index.poems) {
    const candidate = normalizeLine(poem.text);
    if (normalized.includes(candidate)) {
      if (!best || candidate.length > normalizeLine(best.text).length) best = poem;
    }
  }
  return best;
}

export function extractPoetryCandidates(raw) {
  const source = String(raw ?? "")
    .replace(/```[^\n]*/g, "\n")
    .replace(/```/g, "\n");

  const candidates = [];
  const seen = new Set();

  for (const originalLine of source.split(/\r?\n/)) {
    let line = originalLine.trim();
    if (!line) continue;
    line = line.replace(/^[\s>*#·•\-–—]+/, "");
    line = line.replace(/^\d+[.、)）]\s*/, "");
    line = line.replace(/^(诗句|接句|下一句|原文|诗云|答|对句)\s*[:：]\s*/, "");
    line = line.split(/——|—|–/)[0];
    line = line.replace(/[（(][^）)]*[）)]\s*$/g, "");
    line = line.replace(/^[「『“"'《]+|[」』”"'》]+$/g, "");
    line = line.replace(/\s*[（(]?[^（）()\s]{1,8}\s*[·・]\s*[^（）()\s]{1,12}[）)]?\s*$/, (match) => {
      return /[\u4e00-\u9fff]{1,6}[·・]/.test(match) ? "" : match;
    });

    for (const part of line.split(/[。！？!?；;，,、]/)) {
      const trimmed = part.replace(/[「『“”"'《》〈〉]/g, "").trim();
      const normalized = normalizeLine(trimmed);
      if (!normalized || normalized.length < 2) continue;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      candidates.push({ raw: trimmed, normalized });
    }
  }

  return candidates;
}

function usedNormalized(used) {
  const set = new Set();
  for (const line of used || []) {
    const normalized = normalizeLine(typeof line === "string" ? line : line?.line);
    if (normalized) set.add(normalized);
  }
  return set;
}

function duplicated(normalized, usedSet) {
  if (usedSet.has(normalized)) return true;
  for (const previous of usedSet) {
    if (previous.length >= 5 && normalized.includes(previous)) return true;
  }
  return false;
}

export function validatePoetryAttempt(raw, { keyword, used = [], index = INDEX } = {}) {
  if (!keyword || !isSingleHanChar(keyword)) {
    return { ok: false, reason: "keyword", message: "令字无效", candidates: [] };
  }

  const candidates = extractPoetryCandidates(raw);
  if (candidates.length === 0) {
    return { ok: false, reason: "empty", message: "没有读到成句的诗句", candidates };
  }

  const usedSet = usedNormalized(used);
  const withKeyword = candidates.filter((item) => item.normalized.includes(keyword));
  const pool = withKeyword.length ? withKeyword : candidates;
  const best = pool[0];

  if (!withKeyword.length) {
    return {
      ok: false,
      reason: "keyword",
      message: `句中没有令字「${keyword}」`,
      candidates,
      line: best.normalized,
    };
  }

  const duplicate = withKeyword.find((item) => duplicated(item.normalized, usedSet));
  if (duplicate && withKeyword.every((item) => duplicated(item.normalized, usedSet))) {
    return {
      ok: false,
      reason: "duplicate",
      message: "这一句已经有人用过了",
      candidates,
      line: duplicate.normalized,
    };
  }

  const viable = withKeyword.filter((item) => !duplicated(item.normalized, usedSet));
  const chosen = viable.sort((a, b) => {
    const aEntry = index.byText.has(a.normalized);
    const bEntry = index.byText.has(b.normalized);
    if (aEntry !== bEntry) return aEntry ? -1 : 1;
    return a.normalized.length - b.normalized.length;
  })[0];

  if (chosen.normalized.length > MAX_LINE_LENGTH) {
    return {
      ok: false,
      reason: "too_long",
      message: "一次只可接一句，句子太长了",
      candidates,
      line: chosen.normalized,
    };
  }

  const entry = findPoemEntry(chosen.normalized, index);
  const verified = Boolean(entry && entry.text.length >= chosen.normalized.length - 4);

  return {
    ok: true,
    line: verified ? entry.text : chosen.normalized,
    normalized: verified ? normalizeLine(entry.text) : chosen.normalized,
    entry: verified ? entry : null,
    verified,
    candidates,
    keyword,
  };
}

export function buildKeywordFromIndex(index = INDEX) {
  return [...index.byChar.entries()]
    .map(([char, poems]) => ({ char, count: poems.length }))
    .filter(({ char, count }) => count >= 4 && isSingleHanChar(char))
    .sort((a, b) => b.count - a.count || a.char.localeCompare(b.char, "zh"));
}
