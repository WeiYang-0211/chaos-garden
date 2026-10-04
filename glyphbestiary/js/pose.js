// Pure landmark geometry - no MediaPipe import, so the pen-down rule is testable
// in Node without a browser or a model file.
//
// Deliberately a much smaller slice of the hand than gestura carries: this project
// needs to know one thing, "is the index finger out", and nothing else. Every
// extra rule here is a threshold that can disagree with the artist about whether
// they are drawing.

export const LM = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
};

export function usableHand(lm) {
  return !!lm && lm.length >= 21;
}

/**
 * Index finger extension as a ratio: tip-to-wrist over PIP-to-wrist.
 * ~1.0 folded, ~1.9 straight. Scale invariant, so walking toward the camera does
 * not change the answer.
 */
export function indexExtension(lm) {
  if (!usableHand(lm)) return 0;
  const wrist = lm[LM.WRIST];
  const d = (i) => Math.hypot(lm[i].x - wrist.x, lm[i].y - wrist.y);
  const pip = d(LM.INDEX_PIP);
  if (pip < 1e-6) return 0;
  return d(LM.INDEX_TIP) / pip;
}

// Below this the finger reads as folded. A single threshold would chatter when the
// finger hovers at the boundary, and chatter here is very visible: the mutation
// rate flickers on generations the artist did not ask for.
export const POINTING_RATIO = 1.6;

/** Pen up unless the index is genuinely out. */
export function isPointing(lm) {
  return indexExtension(lm) >= POINTING_RATIO;
}