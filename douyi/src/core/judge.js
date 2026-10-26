export function extractJsonObject(raw) {
  const text = String(raw ?? "");
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const slice = text.slice(start, index + 1);
        try {
          return JSON.parse(slice);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function scoreTotal(scores, rubric) {
  return rubric.reduce((sum, item) => sum + Number(scores?.[item.key] || 0), 0);
}

export function clampScore(value, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(Math.min(max, Math.max(0, number)) * 10) / 10;
}

export function normalizeJudgePayload(payload, rubric) {
  if (!payload || typeof payload !== "object") return null;
  const rawA = payload.scores?.A;
  const rawB = payload.scores?.B;
  if (!rawA || !rawB) return null;

  const A = {};
  const B = {};
  for (const item of rubric) {
    A[item.key] = clampScore(rawA[item.key], item.max);
    B[item.key] = clampScore(rawB[item.key], item.max);
  }

  const totalA = Math.round(scoreTotal(A, rubric) * 10) / 10;
  const totalB = Math.round(scoreTotal(B, rubric) * 10) / 10;

  let winner = payload.winner;
  if (winner !== "A" && winner !== "B" && winner !== "draw") winner = null;
  if (!winner) {
    if (Math.abs(totalA - totalB) < 0.6) winner = "draw";
    else winner = totalA > totalB ? "A" : "B";
  }

  const commentary = String(payload.commentary || "").trim();
  if (!commentary) return null;

  return {
    winner,
    scores: { A, B },
    totals: { A: totalA, B: totalB },
    commentary: commentary.slice(0, 600),
    highlights: Array.isArray(payload.highlights)
      ? payload.highlights.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3)
      : [],
    bestLine: String(payload.bestLine || "").trim().slice(0, 80),
  };
}

export function parseJudgeResponse(raw, rubric) {
  const payload = extractJsonObject(raw);
  return normalizeJudgePayload(payload, rubric);
}
