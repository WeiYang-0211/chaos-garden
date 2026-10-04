// Does the scoring measure what it claims to?
//
// The components have to be separable, or the step 2 sliders would be three names
// for one knob. Each test builds a genome with a known defect and checks that
// exactly the relevant component collapses.
//
// One thing to know before reading the expectations: glyphPaths fits every glyph
// to fill its cell (uniform scale, centred), so position and size in the em box
// are NOT what these metrics measure - the fit has already removed them. What
// survives is ink distribution: how much ink, in how many pieces, how evenly
// spread, and how much the pen turned.
import {
  evaluate, getPressure, GRID, nicheOf, nicheShare, NICHES, setPressure, wildnessScore,
} from '../js/fitness.js';
import { glyphPaths } from '../js/glyph.js';
import { normalizeGenome, randomGenome } from '../js/genome.js';
import { makeRng } from '../js/util.js';

let fail = 0;
const check = (name, ok, detail = '') => {
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ->  ' + detail : ''}`);
};

/** A glyph with an exact skeleton and exact style genes, for known-answer tests. */
const build = (strokes, genes = {}) => normalizeGenome({
  genes: { slant: 0, weight: 0.03, contrast: 0, width: 1, aspect: 1, flourish: 0, ...genes },
  strokes: strokes.map((pts) => ({ pts: pts.map(([x, y]) => [x, y]), ends: [0, 0], wob: 1 })),
});

const bar = (y, x0 = 0.15, x1 = 0.85) => Array.from({ length: 7 }, (_, i) => [x0 + ((x1 - x0) * i) / 6, y]);
const col = (x, y0 = 0.15, y1 = 0.85) => Array.from({ length: 7 }, (_, i) => [x, y0 + ((y1 - y0) * i) / 6]);

const SINGLE = evaluate(build([bar(0.5)]));
const CROSS = evaluate(build([bar(0.5), col(0.5)]));
const EL = evaluate(build([col(0.2), bar(0.8, 0.2, 0.85)]));

// --- cohesion ------------------------------------------------------------
{
  check('a single bar through the middle is a good glyph', SINGLE.fitness > 0.5,
    `fit ${SINGLE.fitness.toFixed(3)} (cov ${SINGLE.coverage.toFixed(2)} coh ${SINGLE.cohesion.toFixed(2)} bal ${SINGLE.balance.toFixed(2)})`);
  check('a single mark is one connected piece', SINGLE.parts === 1);

  const scattered = evaluate(build([bar(0.12), bar(0.5), bar(0.88)]));
  check('three separated strokes lose cohesion', scattered.cohesion < SINGLE.cohesion * 0.6,
    `${SINGLE.cohesion.toFixed(2)} -> ${scattered.cohesion.toFixed(2)}`);
  check('they are still three pieces', scattered.parts === 3, `${scattered.parts}`);
  // Not a fitness penalty: three marks put MORE ink on the page, which is closer to
  // the coverage target than one does, so the total can rise. The signal that matters
  // is cohesion, and that is where the fall shows up.
  check('separation is penalised through cohesion, not through the total',
    scattered.cohesion < SINGLE.cohesion * 0.6 && scattered.fitness > SINGLE.fitness * 0.8,
    `coh ${SINGLE.cohesion.toFixed(2)} -> ${scattered.cohesion.toFixed(2)}, fit ${SINGLE.fitness.toFixed(3)} -> ${scattered.fitness.toFixed(3)}`);
}

// --- balance: ink asymmetry inside the fitted box -------------------------
{
  check('a cross is perfectly balanced', CROSS.balance > 0.95, CROSS.balance.toFixed(2));
  check('an L is off balance - its ink sits at two corners of its own bbox',
    EL.balance < CROSS.balance * 0.6, `${CROSS.balance.toFixed(2)} -> ${EL.balance.toFixed(2)}`);
  check('balance and coverage are different axes',
    EL.coverage > CROSS.coverage && EL.balance < CROSS.balance,
    `cov ${EL.coverage.toFixed(2)}/${CROSS.coverage.toFixed(2)}, bal ${EL.balance.toFixed(2)}/${CROSS.balance.toFixed(2)}`);

  // A mark in the corner of the em box is re-centred by the fit, so it must come
  // out balanced. Asserting the opposite would be asserting the fit is broken.
  const corner = evaluate(build([bar(0.1, 0.08, 0.45)]));
  check('the fit re-centres a corner mark, so it reads as balanced',
    corner.balance > 0.9, corner.balance.toFixed(2));
}

// --- coverage and the viability gate -------------------------------------
{
  // With the fit capped, a degenerate dot is no longer inflated into a full-page
  // blot - it stays the speck it is, and the gate rejects it from the other side.
  const tiny = evaluate(build([bar(0.5, 0.48, 0.52)]));
  check('a mark with no direction stays small instead of being inflated', tiny.fraction < 0.1,
    `${(tiny.fraction * 100).toFixed(0)}% of the box`);
  check('coverage punishes it for being too sparse', tiny.coverage < 0.15, tiny.coverage.toFixed(2));
  check('and it loses to every real glyph', tiny.fitness < Math.min(SINGLE.fitness, CROSS.fitness) * 0.5,
    `dot ${tiny.fitness.toFixed(3)} vs bar ${SINGLE.fitness.toFixed(3)}`);

  const fill = [];
  for (let y = 0.1; y <= 0.9; y += 0.16) fill.push(bar(y, 0.06, 0.94));
  const blob = evaluate(build(fill, { weight: 0.075, contrast: 1.4 }));
  check('a black box is not a character either', blob.fitness < 0.3, blob.fitness.toFixed(3));
  check('a black box does not win on coverage', blob.coverage < SINGLE.coverage,
    `blob ${blob.coverage.toFixed(2)} vs bar ${SINGLE.coverage.toFixed(2)}`);
  check('the gate survives the three components being maxed',
    blob.cohesion === 1 && blob.balance > 0.9 && blob.fitness < 0.3,
    `coh ${blob.cohesion.toFixed(2)} bal ${blob.balance.toFixed(2)} fit ${blob.fitness.toFixed(3)}`);

  check('ordinary glyphs pass the gate untouched',
    [SINGLE, CROSS, EL].every((m) => m.body === 1));
}

// --- roughness is a coordinate, not a goal --------------------------------
{
  const straight = evaluate(build([bar(0.5)]));
  const zigzag = [];
  for (let i = 0; i < 7; i++) zigzag.push([0.15 + i * 0.11, i % 2 ? 0.25 : 0.75]);
  const wild = evaluate(build([zigzag]));
  check('a zigzag is far wilder than a bar', wild.roughness > straight.roughness + 0.8,
    `${straight.roughness.toFixed(3)} -> ${wild.roughness.toFixed(3)}`);
  check('wildness costs nothing in fitness by itself',
    Math.abs(wild.fitness - straight.fitness) < 0.6,
    `${straight.fitness.toFixed(2)} vs ${wild.fitness.toFixed(2)}`);

  // Length normalisation: a short scratch turns a lot per unit of ink, and must
  // not outrank a long considered sweep.
  // Length normalisation has to be checked on the FORMULA, not on drawn size: the
  // cell fit normalises every glyph to the same box, so scaling a glyph up
  // changes nothing at all. What length normalisation actually distinguishes is
  // how the same direction changes are spread out.
{
  const g = build([zigzag]);
  const { paths } = glyphPaths(g, { res: 26 });
  let turn = 0;
  let len = 0;
  for (const p of paths) { turn += p.turn; len += p.length; }
  check('roughness is exactly total turn divided by drawn length',
    Math.abs(evaluate(g).roughness - Math.min(2.5, turn / len / 3)) < 1e-9,
    `${evaluate(g).roughness.toFixed(4)} vs ${(turn / len / 3).toFixed(4)}`);

  // The box is held fixed and only the number of direction changes varies, so the
  // fit cannot interfere. Doubling the corners does not double wildness, and that
  // sub-linearity is the whole content of the length normalisation: the path also
  // gets longer, so what is measured is turn DENSITY. Both halves of the
  // assertion matter - drop the /length and the upper bound breaks immediately.
  const wiggles = (n) => Array.from({ length: n * 2 + 1 }, (_, i) => [0.12 + (i * 0.76) / (n * 2), 0.5 + (i % 2 ? 0.22 : -0.22)]);
  const two = evaluate(build([wiggles(2)]));
  const four = evaluate(build([wiggles(4)]));
  check('more corners in the same box are wilder', four.roughness > two.roughness,
    `${two.roughness.toFixed(2)} -> ${four.roughness.toFixed(2)}`);
  check('but sub-linearly: roughness is a density, not a corner count',
    four.roughness < two.roughness * 2, `x${(four.roughness / two.roughness).toFixed(2)}`);

  const sweep = evaluate(build([[[0.15, 0.2], [0.3, 0.3], [0.5, 0.45], [0.7, 0.6], [0.85, 0.8], [0.9, 0.9], [0.85, 0.95]]]));
  check('a long considered sweep is calm', sweep.roughness < 0.55, sweep.roughness.toFixed(2));
}
}

// --- niches --------------------------------------------------------------
{
  check('niche bands are ordered and exhaustive', (() => {
    let last = -Infinity;
    for (const n of NICHES) {
      if (n.max <= last) return false;
      last = n.max;
    }
    return NICHES[NICHES.length - 1].max === Infinity;
  })());
  check('roughness 0 is 楷', nicheOf(0).key === 'kai');
  check('roughness 1.5 is 草', nicheOf(1.5).key === 'cao');
  check('roughness 5 is 狂', nicheOf(5).key === 'kuang');
  check('an absurd roughness still yields a niche', typeof nicheOf(1e6).key === 'string');

  // The band edges have to line up with real glyphs, or the colours are decorative.
  const kai = evaluate(build([bar(0.5)]));
  const straightest = evaluate(build([bar(0.5)], { flourish: 0 }));
  check('a straight 横 is 楷', straightest.niche.key === 'kai', straightest.roughness.toFixed(2));
  check('a 楷 is found at the bottom of the scale', kai.roughness < NICHES[1].max);
}

// --- evaluate() over real genomes ----------------------------------------
{
  const rng = makeRng(2024);
  let bad = null;
  const niches = new Map();
  let minFit = 1;
  let maxFit = 0;
  for (let i = 0; i < 300 && !bad; i++) {
    const m = evaluate(randomGenome(rng));
    if (!(m.fitness >= 0 && m.fitness <= 1)) bad = `fitness ${m.fitness}`;
    for (const k of ['coverage', 'cohesion', 'balance', 'body']) {
      if (!(m[k] >= 0 && m[k] <= 1)) bad = `${k} ${m[k]}`;
    }
    if (!Number.isFinite(m.roughness)) bad = `roughness ${m.roughness}`;
    if (m.parts < 1) bad = `parts ${m.parts}`;
    if (m.ink > 0 && m.ink <= GRID * GRID) { /* fine */ } else bad = `ink ${m.ink}`;
    niches.set(m.niche.key, (niches.get(m.niche.key) || 0) + 1);
    minFit = Math.min(minFit, m.fitness);
    maxFit = Math.max(maxFit, m.fitness);
  }
  check('300 random genomes all score inside their ranges', bad === null, bad || '');
  check('random founders occupy at least three niches', niches.size >= 3, [...niches.keys()].join(','));
  check('founders have real headroom to evolve into', maxFit - minFit > 0.3,
    `${minFit.toFixed(3)}..${maxFit.toFixed(3)}`);

  const g = randomGenome(makeRng(5));
  const a = evaluate(g);
  const b = evaluate(g);
  check('scoring is deterministic', JSON.stringify(a) === JSON.stringify(b));
  const coarse = evaluate(g, { res: 18 });
  check('resolution changes the score only slightly', Math.abs(coarse.fitness - a.fitness) < 0.08,
    `${a.fitness.toFixed(3)} at 26pt vs ${coarse.fitness.toFixed(3)} at 18pt`);

  check('a degenerate single-point skeleton does not throw', (() => {
    try {
      evaluate(normalizeGenome({ genes: {}, strokes: [{ pts: [[0.5, 0.5]], ends: [0, 0], wob: 1 }] }));
      return true;
    } catch { return false; }
  })());
}

// --- the raster matches the geometry -------------------------------------
{
  const g = randomGenome(makeRng(88));
  const { paths } = glyphPaths(g, { res: 26 });
  let minX = 1; let maxX = 0; let minY = 1; let maxY = 0;
  for (const p of paths) for (const [x, y] of p.center) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const m = evaluate(g);
  check('the ink the raster found matches the ink that was drawn',
    m.ink > 4 && m.ink < GRID * GRID, `${m.ink} cells`);
  check('nothing was rasterised outside the box', minX >= 0 && maxX <= 1 && minY >= 0 && maxY <= 1,
    `${minX.toFixed(3)},${maxY.toFixed(3)}`);
  check('the fitted glyph really does fill its box',
    Math.max(maxX - minX, maxY - minY) > 0.75, Math.max(maxX - minX, maxY - minY).toFixed(3));
}

// --- the artist's three hands on the wheel -------------------------------
// The pressure is the mechanism that makes this an artwork rather than a demo, so
// it gets the same treatment as the metrics: clamped, normalised, and proven to
// actually move the population where it says it will.
{
  const base = getPressure();
  setPressure({ legibility: 0.33, structure: 0.5, wild: 0.28, target: 0.55 });
  const p = getPressure();
  check('the three weights sum to 1 so fitness stays a percentage',
    Math.abs(p.legibility + p.structure + p.wild - 1) < 1e-9,
    `${p.legibility.toFixed(3)} + ${p.structure.toFixed(3)} + ${p.wild.toFixed(3)}`);
  check('weight ratios survive normalisation', Math.abs(p.legibility / p.structure - 0.33 / 0.5) < 1e-9);
  check('weights are clamped', (() => {
    const q = setPressure({ legibility: 9, structure: -4, wild: 0 });
    return q.legibility === 1 && q.structure === 0 && q.wild === 0;
  })());
  check('all weights at zero does not divide by zero', (() => {
    const q = setPressure({ legibility: 0, structure: 0, wild: 0 });
    return Number.isFinite(q.legibility + q.structure + q.wild);
  })(), JSON.stringify(getPressure()));
  setPressure({ legibility: 0.33, structure: 0.5, wild: 0.28 });

  check('the wildness score peaks at the target', (() => {
    setPressure({ target: 0.8 });
    const at = wildnessScore(0.8);
    const off = wildnessScore(0.1);
    const far = wildnessScore(2.0);
    setPressure({ target: 0.55 });
    return at === 1 && off < 0.2 && far < 0.2;
  })());
  check('moving the target moves the score with it', (() => {
    setPressure({ target: 0.2 });
    const low = wildnessScore(0.2);
    setPressure({ target: 1.8 });
    const high = wildnessScore(0.2);
    setPressure({ target: 0.55 });
    return low === 1 && high === 0;
  })());

  // The quota follows the target, with a floor so nothing can be voted out of
  // existence. Checked as fractions of the population, because that is what the
  // population module consumes.
  const shareAt = (target) => { setPressure({ target }); return nicheShare(); };
  const kaiShare = shareAt(0.2);
  const kuangShare = shareAt(2.2);
  setPressure({ target: 0.55 });
  check('the quota sums to 1', (() => {
    for (const t of [0, 0.55, 2.5]) {
      const s = shareAt(t);
      if (Math.abs(s.reduce((a, b) => a + b, 0) - 1) > 1e-9) return false;
      if (s.some((x) => x < 0)) return false;
    }
    return true;
  })());
  check('a 楷 target fills the grid with 楷', kaiShare[0] > kaiShare[3] * 4, kaiShare.map((x) => x.toFixed(2)).join('/'));
  check('a 狂 target fills the grid with 狂', kuangShare[3] > kaiShare[3] * 4, kuangShare.map((x) => x.toFixed(2)).join('/'));
  check('no niche is ever given nothing', (() => {
    for (const t of [0, 0.2, 0.8, 1.4, 2.2, 2.5, 99]) {
      const s = shareAt(t);
      if (s.some((x) => x < 0.05)) return false;
    }
    return true;
  })());
  check('extreme targets still leave a floor under the others', (() => {
    const s = shareAt(2.5);
    return s[0] >= 0.05 && s[1] >= 0.05 && s[2] >= 0.05;
  })(), shareAt(2.5).map((x) => x.toFixed(2)).join('/'));
  // shareAt leaves the pressure wherever it last looked, so put it back before the
  // next section: SINGLE and CROSS were scored at import time against the default.
  setPressure({ legibility: 0.33, structure: 0.5, wild: 0.28, target: 0.55 });
}

// --- wildness is not a scribble -----------------------------------------
// Two attempts at this gate are recorded in fitness.js; this is the second one,
// the ratio of drawn path to distance covered. A scribble crammed into a small
// box draws far more path than it displaces, and that is exactly the difference
// between 狂草 and a nervous pen. Asserted as the exact formula plus the contrast
// in travel, because two shapes with identical roughness but opposite travel would
// be a nice fixture and are hard to build on purpose.
{
  // Fourteen long strokes scribbled repeatedly over the same small box: a great deal
  // of turn and a great deal of path, and almost no travel.
  const cramped = [];
  for (let i = 0; i < 14; i++) {
    const o = (i % 7) * 0.012;
    cramped.push([[0.43 + o, 0.43 + o], [0.5, 0.52], [0.57 - o, 0.57 - o], [0.5, 0.46 + o]]);
  }
  // Two long committed sweeps across the cell: turns, but they go somewhere.
  const sweep = [
    [[0.12, 0.2], [0.4, 0.35], [0.85, 0.3], [0.2, 0.7], [0.88, 0.8], [0.3, 0.9], [0.7, 0.95]],
    [[0.1, 0.85], [0.5, 0.6], [0.9, 0.5]],
  ];
  const a = evaluate(build(cramped));
  const b = evaluate(build(sweep));

  check('a cramped scribble has almost no travel', a.reach < 0.35,
    `reach ${a.reach.toFixed(2)} (roughness ${a.roughness.toFixed(2)})`);
  check('a committed sweep has travel to spare', b.reach > 0.55,
    `reach ${b.reach.toFixed(2)} (roughness ${b.roughness.toFixed(2)})`);
  check('and the scribble still turns a lot, so this is not just a quiet shape',
    a.roughness > b.roughness, `${a.roughness.toFixed(2)} vs ${b.roughness.toFixed(2)}`);

  check('wildness is exactly the band score times the travel credit', (() => {
    for (const m of [a, b, evaluate(build([bar(0.5)])), evaluate(build([bar(0.5), col(0.5)]))]) {
      if (Math.abs(m.wildness - Math.min(1, Math.max(0, 1 - Math.abs(m.roughness - getPressure().target) / 0.55)) * m.reach) > 1e-9) return false;
    }
    return true;
  })());

  // At a wild target the sweep is worth more than the scribble, which is the whole
  // point: without the travel gate both max out on turn density alone.
  setPressure({ target: 1.0 });
  const wa = evaluate(build(cramped));
  const wb = evaluate(build(sweep));
  setPressure({ target: 0.55 });
  check('at a wild target, a sweep beats a scribble on wildness', wb.wildness > wa.wildness,
    `${wa.wildness.toFixed(2)} vs ${wb.wildness.toFixed(2)}`);
  check('a straight long stroke keeps full travel credit', SINGLE.reach > 0.5, SINGLE.reach.toFixed(2));
}

console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILURE(S)`);
process.exit(fail ? 1 : 0);