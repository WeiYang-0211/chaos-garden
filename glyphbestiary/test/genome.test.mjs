// Genome invariants. The population's correctness rests entirely on these:
// nothing may sit outside its legal box, nothing may throw, and a genome drawn
// from the same seed must come back identical - otherwise the lineage recorded
// for step 3's clade tree would point at drawings nobody can reproduce.
import { GENE_KEYS, LIMITS, STROKES_MAX, STROKES_MIN, cloneGenome, fingerprint, genomeDistance, genomeFromSkeleton, normalizeGenome, randomGenome } from '../js/genome.js';
import { PTS, founderFromGesture, founderSkeleton } from '../js/archetype.js';
import { glyphPaths, rasterize } from '../js/glyph.js';
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
    if (s.pts.length !== PTS) return `stroke has ${s.pts.length} points`;
    for (const p of s.pts) if (!(p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1)) return `point ${p}`;
    if (!(s.ends[0] >= 0 && s.ends[0] <= 1 && s.ends[1] >= 0 && s.ends[1] <= 1)) return `ends ${s.ends}`;
    if (!Number.isFinite(s.wob)) return 'wob';
  }
  return null;
};

// --- founders -------------------------------------------------------------
{
  const rng = makeRng(7);
  let bad = null;
  let strokeHist = new Map();
  for (let i = 0; i < 400 && !bad; i++) {
    const g = randomGenome(rng);
    bad = legal(g);
    strokeHist.set(g.strokes.length, (strokeHist.get(g.strokes.length) || 0) + 1);
  }
  check('400 random founders are all legal', bad === null, bad || `${strokeHist.size} distinct stroke counts`);
  check('founders use a range of stroke counts, not one shape', strokeHist.size >= 4,
    [...strokeHist.keys()].sort((a, b) => a - b).join(','));

  const sk = founderSkeleton(rng);
  check('archetype skeleton reports its layout', typeof sk.layout === 'string' && sk.layout.length > 0, sk.layout);
  check('archetype strokes are inside the em box', sk.strokes.every((s) => s.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1)));
  check('archetype strokes all have the gene lattice', sk.strokes.every((s) => s.length === PTS));
}

// --- a founder drawn by hand ---------------------------------------------
{
  // A crude "L", the way a person would drag it.
  const gesture = [];
  for (let i = 0; i <= 20; i++) gesture.push([0.25, 0.2 + (i / 20) * 0.55]);
  for (let i = 1; i <= 20; i++) gesture.push([0.25 + (i / 20) * 0.5, 0.75]);
  const sk = founderFromGesture(gesture);
  check('a drawn L becomes two strokes, not one blob', sk.strokes.length === 2, `${sk.strokes.length} strokes`);

  const tooShort = founderFromGesture([[0.5, 0.5], [0.501, 0.501]]);
  check('a one-pixel scribble is rejected rather than seeded', tooShort.strokes.length === 0);

  const g = genomeFromSkeleton(sk, makeRng(3));
  check('a drawn founder becomes a legal genome', legal(g) === null, legal(g) || '');
  check('a drawn founder keeps its stroke count', g.strokes.length === sk.strokes.length);
  check('ink thins as strokes multiply', genomeFromSkeleton(
    { strokes: Array.from({ length: 8 }, () => founderSkeleton(makeRng(1)).strokes[0]) }, makeRng(2),
  ).genes.weight < g.genes.weight, `${g.genes.weight.toFixed(4)} vs 8-stroke`);
}

// --- normalize ------------------------------------------------------------
{
  const wild = normalizeGenome({
    genes: { slant: 99, weight: -5, contrast: 3, width: 0, aspect: 100, flourish: -1 },
    strokes: [
      { pts: [[5, 5]], ends: [9, -2], wob: 0 },
      { pts: [[0.1, 0.1], [0.2, 0.2]], ends: [0.5, 0.5], wob: 'x' },
    ],
  });
  check('normalize clamps every gene into its box', legal(wild) === null, legal(wild) || '');
  check('normalize pads a short stroke by holding its last point', wild.strokes[1].pts.every((p) => p[0] === 0.2 || p[0] === 0.1));
  check('normalize repairs a non-numeric tremor seed', Number.isFinite(wild.strokes[0].wob) && wild.strokes[0].wob !== 0);
  check('normalize truncates past the stroke cap', normalizeGenome({
    genes: {}, strokes: Array.from({ length: 40 }, () => ({ pts: [[0.5, 0.5]], ends: [0.5, 0.5], wob: 1 })),
  }).strokes.length === STROKES_MAX);
  check('normalize invents a stroke for an empty skeleton',
    normalizeGenome({ genes: {}, strokes: [] }).strokes.length === 1);
}

// --- determinism, cloning, distance ---------------------------------------
{
  const a = randomGenome(makeRng(99));
  const b = randomGenome(makeRng(99));
  check('same seed, same animal', JSON.stringify(a) === JSON.stringify(b));

  const c = cloneGenome(a);
  check('a clone is deep: touching it does not touch the original', (() => {
    c.strokes[0].pts[0][0] = 0.123456;
    c.genes.weight = 0.0777;
    return a.strokes[0].pts[0][0] !== 0.123456 && a.genes.weight !== 0.0777;
  })());

  check('distance to itself is zero', genomeDistance(a, a) === 0);
  check('distance is symmetric', Math.abs(genomeDistance(a, b) - genomeDistance(b, a)) < 1e-12);

  // The point of the distance function: no single channel may swamp the others.
  const rng = makeRng(5);
  let styleOnly = 0;
  let structureOnly = 0;
  let sameish = 0;
  for (let i = 0; i < 200; i++) {
    const g1 = randomGenome(rng);
    const g2 = cloneGenome(g1);
    g2.genes.contrast = Math.min(LIMITS.contrast[1], g2.genes.contrast * 1.9);
    styleOnly += genomeDistance(g1, g2);
    const g3 = cloneGenome(g1);
    g3.strokes.pop();
    structureOnly += genomeDistance(g1, g3);
    sameish += genomeDistance(g1, cloneGenome(g1));
  }
  // One gene out of six, against a skeleton that may not move at all: a style change
  // registers as a small distance, not a large one. The point is only that it is
  // non-zero and far below a structural change.
  check('a style change registers', styleOnly / 200 > 0.01, `${(styleOnly / 200).toFixed(4)}`);
  check('a stroke loss registers, and outweighs a style change',
    structureOnly / 200 > 0.02 && structureOnly / 200 > styleOnly / 200,
    `${(structureOnly / 200).toFixed(4)} vs ${(styleOnly / 200).toFixed(4)}`);
  check('a clone scores zero', sameish === 0);
  check('distance stays in 0..1', styleOnly / 200 < 1 && structureOnly / 200 <= 1);
  check('fingerprint is stable and short', fingerprint(a) === fingerprint(b) && fingerprint(a).length < 20, fingerprint(a));
}

// --- genome -> ink --------------------------------------------------------
{
  const g = randomGenome(makeRng(11));
  const { paths } = glyphPaths(g, { res: 26 });
  check('one path per stroke', paths.length === g.strokes.length);
  check('every path is a closed polygon of 2*res points',
    paths.every((p) => p.poly.length === 52), paths[0].poly.length);
  check('centerlines are resampled to the requested resolution',
    paths.every((p) => p.center.length === 26 && p.half.length === 26));
  check('ink lands inside the em box', paths.every((p) => p.poly.every(([x, y]) =>
    x > -0.05 && x < 1.05 && y > -0.05 && y < 1.05)));
  check('a glyph fills a useful part of its box', (() => {
    let minX = 1; let maxX = 0; let minY = 1; let maxY = 0;
    for (const p of paths) for (const [x, y] of p.center) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const w = maxX - minX;
    const h = maxY - minY;
    return w > 0.25 && h > 0.25 && Math.max(w, h) < 0.95;
  })());

  const mask = rasterize(paths, 18);
  let ink = 0;
  for (const v of mask) ink += v;
  check('the raster finds ink', ink > 4, `${ink} cells`);
  check('the raster does not fill the box (that would mean a blob)', ink < mask.length * 0.9,
    `${ink}/${mask.length}`);

  check('the same genome renders the same ink', JSON.stringify(glyphPaths(g, { res: 20 }).paths.map((p) => p.poly))
    === JSON.stringify(glyphPaths(g, { res: 20 }).paths.map((p) => p.poly)));
}

console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILURE(S)`);
process.exit(fail ? 1 : 0);