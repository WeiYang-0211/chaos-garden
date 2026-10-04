// The genome. A glyph is a skeleton (ordered strokes of control points, each
// with two taper genes and a tremor seed) plus six global style genes.
//
// Two design rules:
//
//  1. Fixed-width arrays, no Maps, no classes. A genome has to survive structured
//     clone, JSON.stringify and a straight copy into a worker without a schema
//     migration, because by step 3 half of these are written into an export file.
//  2. Every field has a clamp. Mutation is additive noise and crossover blends
//     parents; without a hard legal box the population drifts off the end of the
//     em box within a few dozen generations and every glyph renders as a smear at
//     the edge of its cell.
import { clamp } from './util.js';
import { PTS, founderSkeleton } from './archetype.js';

export const STROKES_MIN = 1;
export const STROKES_MAX = 9;

export const GENE_KEYS = ['slant', 'weight', 'contrast', 'width', 'aspect', 'flourish'];

export const LIMITS = {
  slant: [-0.32, 0.32],       // shear, x per unit of y
  weight: [0.012, 0.06],      // stroke HALF-width in em units
  contrast: [0, 1.4],         // belly vs tip thickness
  width: [0.62, 1.12],        // 字面宽窄
  aspect: [0.66, 1.45],       // 高矮
  flourish: [0, 1],           // terminal flicks
};

const BOX = [0.02, 0.98];

export function randomStroke(rng) {
  const pts = [];
  for (let i = 0; i < PTS; i++) pts.push([rng.range(0.18, 0.82), rng.range(0.16, 0.84)]);
  return { pts, ends: [rng.range(0, 1), rng.range(0, 1)], wob: rng.int(1 << 20) };
}

/**
 * Wrap a skeleton of point-runs in a full genome.
 *
 * The two representations differ on purpose: a skeleton is just ink geometry
 * (what the archetype composer and a drawn gesture produce), a genome adds the
 * heritable parts a skeleton cannot express - the two tapers and the tremor seed.
 *
 * Ink weight scales with stroke count rather than being sampled freely: eight
 * strokes on one em have to be thin to stay apart, three fat ones turn into a
 * blot, and letting the weight gene wander away from that only produces glyphs
 * that are legible in the metrics and not on screen.
 */
export function genomeFromSkeleton(skeleton, rng) {
  const strokes = skeleton.strokes.map((run) => ({
    pts: run.map((p) => [p[0], p[1]]),
    ends: [rng.range(0.15, 0.9), rng.range(0.15, 0.9)],
    wob: rng.int(1 << 20),
  }));
  const genes = {};
  for (const k of GENE_KEYS) genes[k] = rng.range(LIMITS[k][0], LIMITS[k][1]);
  genes.weight = founderWeight(strokes.length);
  return normalizeGenome({ genes, strokes });
}

/**
 * Ink weight for a stroke count.
 *
 * Measured against rendered contact sheets, not guessed. A half-width of 0.072 em
 * for a single stroke - which is what the first version used - is a 14%-wide brush,
 * and it turned every 点 and every short 横 into a lozenge: the plate came out as
 * thirty-six blots. 0.042 is a 8%-wide brush, which is roughly what a 楷 横 actually
 * measures against its em, and it leaves a 点 looking like a dot.
 */
export function founderWeight(strokes) {
  return clamp(0.042 / Math.sqrt(Math.max(1, strokes)), LIMITS.weight[0], LIMITS.weight[1]);
}

export function randomGenome(rng) {
  return genomeFromSkeleton(founderSkeleton(rng), rng);
}

export function cloneGenome(g) {
  return {
    genes: { ...g.genes },
    strokes: g.strokes.map((s) => ({ pts: s.pts.map((p) => [p[0], p[1]]), ends: [s.ends[0], s.ends[1]], wob: s.wob })),
  };
}

export function normalizeGenome(g) {
  const genes = {};
  for (const k of GENE_KEYS) genes[k] = clamp(Number(g.genes?.[k]) || 0, LIMITS[k][0], LIMITS[k][1]);
  const strokes = (g.strokes || []).slice(0, STROKES_MAX);
  for (const s of strokes) {
    s.ends = [clamp(s.ends?.[0] ?? 0.5, 0, 1), clamp(s.ends?.[1] ?? 0.5, 0, 1)];
    s.wob = (s.wob | 0) || 1;
    s.pts = (s.pts || []).slice(0, PTS).map((p) => [clamp(p[0], BOX[0], BOX[1]), clamp(p[1], BOX[0], BOX[1])]);
    // Pad by holding the last point: a short stroke is a legitimate mutation
    // result (a 点 becoming a stub), not a corrupt record.
    while (s.pts.length < PTS) s.pts.push([s.pts[s.pts.length - 1][0], s.pts[s.pts.length - 1][1]]);
  }
  if (strokes.length === 0) strokes.push({ pts: Array.from({ length: PTS }, () => [0.5, 0.5]), ends: [0.5, 0.5], wob: 1 });
  return { genes, strokes };
}

const norm01 = (v, key) => (v - LIMITS[key][0]) / (LIMITS[key][1] - LIMITS[key][0]);

/**
 * Distance between two genomes, roughly 0..1. Used for the diversity readout and
 * for telling species apart in step 3, so it has to weigh the style genes against
 * the skeleton instead of letting either dominate: two glyphs with identical
 * strokes but opposite contrast are visibly different animals.
 */
export function genomeDistance(a, b) {
  let gsum = 0;
  for (const k of GENE_KEYS) gsum += Math.abs(norm01(a.genes[k], k) - norm01(b.genes[k], k));
  gsum /= GENE_KEYS.length;

  const n = Math.min(a.strokes.length, b.strokes.length);
  let ssum = 0;
  let cnt = 0;
  for (let i = 0; i < n; i++) {
    const sa = a.strokes[i];
    const sb = b.strokes[i];
    for (let j = 0; j < PTS; j++) {
      const dx = sa.pts[j][0] - sb.pts[j][0];
      const dy = sa.pts[j][1] - sb.pts[j][1];
      ssum += Math.min(1, Math.hypot(dx, dy));
      cnt++;
    }
    ssum += Math.min(1, Math.abs(sa.ends[0] - sb.ends[0])) + Math.min(1, Math.abs(sa.ends[1] - sb.ends[1]));
    cnt += 2;
  }
  const perStroke = cnt ? ssum / cnt : 1;
  // Unpaired strokes count as fully distant, so splitting a glyph into two is
  // registered as a real change rather than averaged into invisibility.
  const countGap = Math.min(1, Math.abs(a.strokes.length - b.strokes.length) / STROKES_MAX);
  return clamp(gsum * 0.35 + perStroke * 0.45 + countGap * 0.2, 0, 1);
}

/** Coarse identity for species bookkeeping: which bucket of the style space. */
export function fingerprint(g) {
  const q = (v, step) => Math.round(v / step);
  const genes = GENE_KEYS.map((k) => `${q(norm01(g.genes[k], k), 0.25)}`).join('');
  const skel = g.strokes.map((s) => s.pts.map((p) => `${q(p[0], 0.2)}${q(p[1], 0.2)}`).join('')).join('|');
  let h = 2166136261;
  for (let i = 0; i < (genes + skel).length; i++) {
    h ^= (genes + skel).charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `${h.toString(36)}-${g.strokes.length}`;
}