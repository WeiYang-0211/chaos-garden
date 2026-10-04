// The pen-down rule, on synthetic landmarks.
//
// Only one question is asked here: "is the index finger out". Everything else about
// the hand is ignored on purpose - the piece needs to know whether the artist is
// authoring, and every extra threshold is another way for the app to disagree with
// them about it. Landmarks are generated rather than captured, so the expected
// geometry is known exactly.
import { LM, POINTING_RATIO, indexExtension, isPointing, usableHand } from '../js/pose.js';

let fail = 0;
const check = (name, ok, detail = '') => {
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ->  ' + detail : ''}`);
};

/** A hand in normalised landmark space, with the index folded to `curl` (0 out, 1 in). */
function hand({ curl = 0, scale = 1, shift = 0 } = {}) {
  const lm = new Array(21).fill(null).map(() => ({ x: 0, y: 0, z: 0 }));
  const put = (i, x, y) => { lm[i] = { x: shift + x * scale, y: y * scale, z: 0 }; };
  put(LM.WRIST, 0, 0);
  // MCPs fan out from the wrist; PIPs sit beyond them.
  put(LM.INDEX_MCP, 0, -0.3);
  put(LM.INDEX_PIP, 0, -0.55);
  put(LM.INDEX_DIP, 0, -0.55 - 0.25 * (1 - curl));
  put(LM.INDEX_TIP, 0, -0.55 - 0.25 * (1 - curl) - 0.2 * (1 - curl));
  put(LM.MIDDLE_MCP, 0.12, -0.3);
  put(LM.MIDDLE_PIP, 0.12, -0.52);
  put(LM.MIDDLE_DIP, 0.12, -0.66);
  put(LM.MIDDLE_TIP, 0.12, -0.78);
  put(LM.RING_MCP, 0.22, -0.28);
  put(LM.RING_PIP, 0.22, -0.48);
  put(LM.RING_DIP, 0.22, -0.6);
  put(LM.RING_TIP, 0.22, -0.7);
  put(LM.PINKY_MCP, 0.31, -0.24);
  put(LM.PINKY_PIP, 0.31, -0.4);
  put(LM.PINKY_DIP, 0.31, -0.5);
  put(LM.PINKY_TIP, 0.31, -0.58);
  put(LM.THUMB_MCP, -0.2, -0.12);
  put(LM.THUMB_IP, -0.3, -0.22);
  put(LM.THUMB_TIP, -0.38, -0.3);
  return lm;
}

// --- geometry -------------------------------------------------------------
{
  check('a complete array is usable', usableHand(hand()));
  check('a short or missing array is not', !usableHand(null) && !usableHand([]) && !usableHand(new Array(20).fill({ x: 0, y: 0 })));

  const out = indexExtension(hand({ curl: 0 }));
  const folded = indexExtension(hand({ curl: 1 }));
  check('a straight index reads as straight', out > 1.8, out.toFixed(2));
  check('a folded index reads as folded', folded < 1.05, folded.toFixed(2));
  check('the rule separates the two', out > POINTING_RATIO && folded < POINTING_RATIO,
    `${folded.toFixed(2)} .. ${out.toFixed(2)}, gate at ${POINTING_RATIO}`);
  check('a halfway-folded finger is ambiguous, and that is fine',
    isPointing(hand({ curl: 0.5 })) === false || isPointing(hand({ curl: 0.5 })) === true);

  // Scale invariance: walking toward the camera must not change the answer.
  const near = indexExtension(hand({ curl: 0, scale: 2.5 }));
  const far = indexExtension(hand({ curl: 0, scale: 0.3 }));
  check('the ratio is scale invariant', Math.abs(near - out) < 0.05 && Math.abs(far - out) < 0.05,
    `${out.toFixed(3)} vs ${near.toFixed(3)} / ${far.toFixed(3)}`);
  const shifted = indexExtension(hand({ curl: 0, shift: 0.4 }));
  check('the ratio is position invariant', Math.abs(shifted - out) < 1e-9, shifted.toFixed(3));
}

// --- the gate -------------------------------------------------------------
{
  check('a pointing index passes the gate', isPointing(hand({ curl: 0 })));
  check('a curled index does not', !isPointing(hand({ curl: 1 })));
  check('a malformed array does not throw or pass', !isPointing(null) && !isPointing([]));

  // The other fingers are irrelevant here, and that is the point: a natural writing
  // gesture is one finger out with the rest curled, and an earlier version that
  // asked about the whole hand read that as "pen up".
  const mixed = hand({ curl: 0 });
  for (const i of [LM.MIDDLE_TIP, LM.RING_TIP, LM.PINKY_TIP]) mixed[i] = { x: 0.31, y: -0.2, z: 0 };
  check('one finger out with the rest curled still counts as pointing', isPointing(mixed));
}
console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILURE(S)`);
process.exit(fail ? 1 : 0);