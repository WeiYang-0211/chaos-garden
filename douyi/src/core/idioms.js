import { IDIOMS } from "../data/idioms.js";

export const IDIOM_LENGTH = 4;

export const FEATURED_CHAIN_STARTS = ["一", "不", "水", "人", "金", "日", "花", "大", "天", "三", "万", "后", "下", "飞"];

const HAN = /\p{Script=Han}/gu;

export function normalizeIdiom(text) {
  return String(text ?? "").match(HAN)?.join("") ?? "";
}

export function isFourCharIdiom(text) {
  return [...normalizeIdiom(text)].length === IDIOM_LENGTH;
}

export function buildIdiomIndex(idioms = IDIOMS) {
  const byFirst = new Map();
  const byText = new Map();

  for (const raw of idioms) {
    const text = normalizeIdiom(raw);
    if ([...text].length !== IDIOM_LENGTH) continue;
    byText.set(text, { text });
    const first = [...text][0];
    if (!byFirst.has(first)) byFirst.set(first, []);
    byFirst.get(first).push(text);
  }

  return {
    idioms: [...byText.keys()],
    byFirst,
    byText,
  };
}

export const IDIOM_INDEX = buildIdiomIndex();

function pruneDeadEnds(index) {
  const active = new Set(index.byText.keys());
  let changed = true;
  while (changed) {
    changed = false;
    const firsts = new Set();
    for (const text of active) firsts.add([...text][0]);
    for (const text of [...active]) {
      if (!firsts.has([...text][3])) {
        active.delete(text);
        changed = true;
      }
    }
  }
  return active;
}

function subIndex(index, texts) {
  const byFirst = new Map();
  const byText = new Map();
  for (const text of texts) {
    const entry = index.byText.get(text);
    if (!entry) continue;
    byText.set(text, entry);
    const first = [...text][0];
    if (!byFirst.has(first)) byFirst.set(first, []);
    byFirst.get(first).push(text);
  }
  return { idioms: [...byText.keys()], byFirst, byText };
}

export const CHAIN_CORE = pruneDeadEnds(IDIOM_INDEX);
export const CHAIN_CORE_INDEX = subIndex(IDIOM_INDEX, CHAIN_CORE);

export function chainStartStats(index = CHAIN_CORE_INDEX) {
  return FEATURED_CHAIN_STARTS.map((char) => ({
    char,
    count: index.byFirst.get(char)?.length ?? 0,
  }));
}

export function chainCoreCount(index = CHAIN_CORE_INDEX) {
  return index.idioms.length;
}

export function nextChar(idiom) {
  return [...normalizeIdiom(idiom)][3] ?? "";
}

export function extractIdiomCandidates(raw, requiredChar = "", index = IDIOM_INDEX) {
  const source = String(raw ?? "")
    .replace(/```[^\n]*/g, "\n")
    .replace(/```/g, "\n");
  const candidates = [];
  const seen = new Set();

  const push = (text) => {
    const normalized = normalizeIdiom(text);
    if ([...normalized].length !== IDIOM_LENGTH) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  for (const originalLine of source.split(/\r?\n/)) {
    let line = originalLine.trim();
    if (!line) continue;
    line = line.replace(/^[\s>*#·•\-–—]+/, "");
    line = line.replace(/^\d+[.、)）]\s*/, "");
    line = line.replace(/^(成语|接龙|接|答|下一句|我接|我答)\s*[:：]\s*/, "");
    line = line.split(/——|—|–/)[0];
    line = line.replace(/[（(][^）)]*[）)]\s*$/g, "");
    line = line.replace(/^[「『“"'《]+|[」』”"'》]+$/g, "");

    for (const part of line.split(/[。！？!?；;，,、\s]+/)) {
      const normalized = normalizeIdiom(part);
      if ([...normalized].length === IDIOM_LENGTH) {
        push(normalized);
        continue;
      }
      if ([...normalized].length > IDIOM_LENGTH) {
        for (let offset = 0; offset <= [...normalized].length - IDIOM_LENGTH; offset += 1) {
          const window = [...normalized].slice(offset, offset + IDIOM_LENGTH).join("");
          if (index.byText.has(window) && (!requiredChar || window[0] === requiredChar)) {
            push(window);
          }
        }
      }
    }
  }

  return candidates;
}

function usedNormalized(used) {
  const set = new Set();
  for (const item of used || []) {
    const value = typeof item === "string" ? item : item?.line ?? item?.idiom;
    const normalized = normalizeIdiom(value);
    if (normalized) set.add(normalized);
  }
  return set;
}

export function validateChainAttempt(raw, { requiredChar, used = [], index = IDIOM_INDEX } = {}) {
  const candidates = extractIdiomCandidates(raw, requiredChar, index);
  if (!candidates.length) {
    return { ok: false, reason: "empty", message: "没有读到四字成语", candidates: [] };
  }

  const matching = candidates.filter((text) => [...text][0] === requiredChar);
  if (!matching.length) {
    return {
      ok: false,
      reason: "start",
      message: `首字必须是「${requiredChar}」`,
      candidates,
      line: candidates[0],
    };
  }

  const usedSet = usedNormalized(used);
  const fresh = matching.filter((text) => !usedSet.has(text));
  if (!fresh.length) {
    return {
      ok: false,
      reason: "duplicate",
      message: "这一句已经用过了",
      candidates,
      line: matching[0],
    };
  }

  fresh.sort((a, b) => {
    const aHit = index.byText.has(a);
    const bHit = index.byText.has(b);
    if (aHit !== bHit) return aHit ? -1 : 1;
    return a.localeCompare(b, "zh");
  });

  const line = fresh[0];
  const entry = index.byText.get(line) ?? null;
  return {
    ok: true,
    line,
    normalized: line,
    entry,
    verified: Boolean(entry),
    nextChar: nextChar(line),
    requiredChar,
    candidates,
  };
}
