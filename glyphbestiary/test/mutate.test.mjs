// Mutation, crossover, and the hand -> mutation mapping.
//
// The properties that matter: mutation must never produce an illegal genome, a
// zero rate must mean exactly zero change (no hidden drift), and the two hand
// signals must move DIFFERENT knobs - a fast hand and a shaky hand are not the
// same input, and collapsing them makes every quick gesture look nervous.
import { GENE_KEYS, LIMITS, STROKES_MAX, STROKES_MIN, cloneGenome, genomeDistance, randomGenome } from '../js/genome.js';
import { PTS } from '../js/archetype.js';
import { crossover, mutate, mutationFromHand } from '../js/mutate.js';
import { makeRng } from '../js/util.js';

let fail = 0;
const check = (name, ok, detail = '') => {
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ->  ' + detail : ''}`);
};

const legal = (g) => {
  for (const k of GENE_KEYS) {
    const [lo, hi] = LIMITS[k];
    if (!(g.genes[k] >= lo && g.genes[k] <= hi)) return `gene ${k}=${g.genes[k]}`;
  }
  if (g.strokes.length < STROKES_MIN || g.strokes.length > STROKES_MAX) return `${g.strokes.length} strokes`;
  for (const s of g.strokes) {
    if (s.pts.length !== PTS) return 'point count';
    for (const p of s.pts) if (!(p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1)) return `point ${p}`;
  }
  return null;
};

// --- mutation -------------------------------------------------------------
{
  const rng = makeRng(31);
  let bad = null;
  for (let i = 0; i < 3000 && !bad; i++) {
    const g = randomGenome(rng);
    bad = legal(mutate(g, { rng, rate: 0.6, magnitude: 1.0 }));
  }
  check('3000 mutations at max rate stay legal', bad === null, bad || '');

  // Zero must mean zero. Every structural move is gated on rate * magnitude, so a
  // zero rate has to be a true no-op rather than a slow drift.
  const still = randomGenome(makeRng(5));
  const before = JSON.stringify(still);
  mutate(still, { rng: makeRng(6), rate: 0, magnitude: 0 });
  check('rate 0 changes nothing at all', JSON.stringify(still) === before);

  const loudG = randomGenome(makeRng(5));
  mutate(loudG, { rng: makeRng(6), rate: 0.9, magnitude: 1.0 });
  check('rate 0.9 changes plenty', genomeDistance(still, loudG) > 0.05, genomeDistance(still, loudG).toFixed(3));

  const quiet = randomGenome(makeRng(5));
  mutate(quiet, { rng: makeRng(6), rate: 0.05, magnitude: 0.1 });
  check('a small rate and small magnitude stay near the parent', genomeDistance(still, quiet) < 0.12,
    genomeDistance(still, quiet).toFixed(3));

  // The two axes have to be independent: rate decides HOW MUCH changes, magnitude
  // decides HOW FAR. Measured on the style genes, because a gene has no index
  // alignment to corrupt - once a stroke splits, stroke index i no longer refers to
  // the same stroke in parent and child, which quietly turns any point-by-point
  // comparison into noise.
  const travel = (magnitude, rate = 1, trials = 400) => {
    let sum = 0;
    let moved = 0;
    let total = 0;
    for (let t = 0; t < trials; t++) {
      const parent = randomGenome(makeRng(8));
      const child = cloneGenome(parent);
      mutate(child, { rng: makeRng(900 + t), rate, magnitude });
      for (const k of GENE_KEYS) {
        const d = Math.abs(parent.genes[k] - child.genes[k]);
        sum += d;
        if (d > 0) moved++;
        total++;
      }
    }
    return { mean: sum / total, frac: moved / total };
  };
  const small = travel(0.08);
  const large = travel(1.0);
  check('magnitude scales how far a gene travels, near-linearly', large.mean > small.mean * 8,
    `${small.mean.toFixed(4)} -> ${large.mean.toFixed(4)} (x${(large.mean / small.mean).toFixed(1)})`);
  check('magnitude does not change how often a gene is touched',
    Math.abs(small.frac - large.frac) < 0.06, `${small.frac.toFixed(2)} vs ${large.frac.toFixed(2)}`);

  const lazy = travel(0.3, 0.1);
  const busy = travel(0.3, 0.9);
  check('rate changes how often a gene is touched', busy.frac > lazy.frac * 2,
    `${lazy.frac.toFixed(2)} -> ${busy.frac.toFixed(2)}`);
  check('a low rate leaves most genes untouched, which dilutes average travel',
    lazy.mean < busy.mean, `${lazy.mean.toFixed(4)} vs ${busy.mean.toFixed(4)}`);
}

// --- structural moves -----------------------------------------------------
{
  const rng = makeRng(77);
  let sawSplit = false;
  let sawDrop = false;
  let outOfBounds = null;
  for (let i = 0; i < 4000; i++) {
    const g = randomGenome(rng);
    const n = g.strokes.length;
    mutate(g, { rng, rate: 1, magnitude: 1 });
    if (g.strokes.length > n) sawSplit = true;
    if (g.strokes.length < n) sawDrop = true;
    if (g.strokes.length < STROKES_MIN || g.strokes.length > STROKES_MAX) outOfBounds = g.strokes.length;
  }
  check('splitting a stroke can grow the glyph', sawSplit);
  check('dropping a stroke can shrink it', sawDrop);
  check('the stroke count never leaves its bounds', outOfBounds === null, `${outOfBounds}`);

  // The mirror move is the one transformation a symmetric glyph can reach without
  // walking there one control point at a time, and it has to be its own inverse.
  check('mirroring an x is its own inverse', (() => {
    const s = { pts: [[0.1, 0.2], [0.9, 0.8]], ends: [0.5, 0.5], wob: 1 };
    for (const p of s.pts) p[0] = 1 - p[0];
    return s.pts.every((p, i) => Math.abs(p[0] - [0.9, 0.1][i]) < 1e-12);
  })());
}

// --- crossover ------------------------------------------------------------
{
  const rng = makeRng(4242);
  let bad = null;
  for (let i = 0; i < 1000 && !bad; i++) {
    const a = randomGenome(rng);
    const b = randomGenome(rng);
    bad = legal(crossover(a, b, rng, { rate: 0.3, magnitude: 0.3 }));
  }
  check('1000 hybrids stay legal', bad === null, bad || '');

  const a = randomGenome(makeRng(1));
  const b = randomGenome(makeRng(2));
  let copies = 0;
  let closer = 0;
  const N = 200;
  for (let i = 0; i < N; i++) {
    const c = crossover(a, b, rng, { rate: 0.2, magnitude: 0.2 });
    const ja = JSON.stringify(c);
    if (ja === JSON.stringify(a) || ja === JSON.stringify(b)) copies++;
    const da = genomeDistance(c, a);
    const db = genomeDistance(c, b);
    if (da < 0.5 || db < 0.5) closer++;
  }
  check('a hybrid is not usually a verbatim parent', copies < N * 0.2, `${copies}/${N} copies`);
  check('a hybrid inherits from both sides', closer === N, `${closer}/${N} near a parent`);

  // Stroke count is inherited whole, never interpolated: blending control points
  // across unrelated skeletons is how a crossover produces spaghetti.
  const long = cloneGenome(randomGenome(makeRng(12)));
  while (long.strokes.length < 4) long.strokes.push(cloneGenome(long).strokes[0]);
  const short = randomGenome(makeRng(13));
  let sawLong = false;
  let sawShort = false;
  for (let i = 0; i < 200; i++) {
    const c = crossover(long, short, rng, { rate: 0.2, magnitude: 0.2 });
    if (c.strokes.length >= long.strokes.length) sawLong = true;
    if (c.strokes.length <= short.strokes.length) sawShort = true;
  }
  check('stroke count comes from one parent or the other, never from a blend', sawLong && sawShort);

  check('crossover does not touch its parents', (() => {
    const x = randomGenome(makeRng(21));
    const y = randomGenome(makeRng(22));
    const jx = JSON.stringify(x);
    const jy = JSON.stringify(y);
    crossover(x, y, rng, { rate: 0.5, magnitude: 0.5 });
    return JSON.stringify(x) === jx && JSON.stringify(y) === jy;
  })());
}

// --- hand -> mutation -----------------------------------------------------
{
  const idle = { energy: 0, jitter: 0, burst: 0 };
  const fast = { energy: 1, jitter: 0, burst: 0 };
  const shaky = { energy: 0, jitter: 1, burst: 0 };
  const stopped = { energy: 0, jitter: 0, burst: 1 };

  const a = mutationFromHand(idle);
  const b = mutationFromHand(fast);
  const c = mutationFromHand(shaky);
  const d = mutationFromHand(stopped);
  check('a still hand leaves the base rate alone', Math.abs(a.rate - 0.3) < 1e-9, `${a.rate}`);
  check('speed drives the rate', b.rate > a.rate * 2, `${a.rate} -> ${b.rate}`);
  check('speed does NOT drive the magnitude', Math.abs(b.magnitude - a.magnitude) < 1e-9,
    `${a.magnitude} -> ${b.magnitude}`);
  check('tremor drives the magnitude', c.magnitude > a.magnitude, `${a.magnitude} -> ${c.magnitude}`);
  check('tremor does NOT drive the rate', Math.abs(c.rate - a.rate) < 1e-9);
  check('a hesitation spikes the magnitude hardest', d.magnitude > c.magnitude, `${c.magnitude} -> ${d.magnitude}`);

  const unlinked = mutationFromHand(fast, { coupling: 0 });
  check('zero coupling detaches the hand entirely',
    Math.abs(unlinked.rate - 0.3) < 1e-9 && Math.abs(unlinked.magnitude - 0.35) < 1e-9);

  check('both parameters stay in a usable range', (() => {
    for (const e of [0, 0.5, 1, 1.4, 9]) {
      for (const j of [0, 0.5, 1, 1.4, 9]) {
        const m = mutationFromHand({ energy: e, jitter: j, burst: j });
        if (!(m.rate >= 0.02 && m.rate <= 0.95 && m.magnitude >= 0.02 && m.magnitude <= 1.2)) return false;
      }
    }
    return true;
  })());

  check('a hand that never appears mutates nothing wild', (() => {
    const m = mutationFromHand({ energy: 0, jitter: 0, burst: 0 }, { baseRate: 0.02, baseMagnitude: 0.05 });
    return m.rate >= 0.02 && m.magnitude >= 0.02;
  })());
}

console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILURE(S)`);
process.exit(fail ? 1 : 0);