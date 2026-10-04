// Mutation and hybrid crossover.
//
// The mutation rate is passed in, never stored here, because in this project the
// artist's hand is the mutation source: the base rate comes from the slider and
// the live modulation comes from how fast and how shaky the tracked hand is
// (see hand.js). Any state kept in this module would drift away from what the
// screen is showing the viewer.
import { clamp } from './util.js';
import { PTS } from './archetype.js';
import { GENE_KEYS, LIMITS, STROKES_MAX, STROKES_MIN, cloneGenome, normalizeGenome } from './genome.js';

const SPAN = (k) => LIMITS[k][1] - LIMITS[k][0];

function nudgeGene(genes, key, rng, amount) {
  genes[key] = clamp(genes[key] + rng.wobble() * SPAN(key) * amount, LIMITS[key][0], LIMITS[key][1]);
}

function nudgePoint(p, rng, amount, box = 0.05) {
  p[0] = clamp(p[0] + rng.wobble() * box * amount, 0.02, 0.98);
  p[1] = clamp(p[1] + rng.wobble() * box * amount, 0.02, 0.98);
}

/** Split a stroke at its midpoint. The cheapest way to add a 撇 or a 折. */
function splitStroke(rng, stroke) {
  const cut = PTS / 2;
  const head = { pts: stroke.pts.slice(0, cut + 1).map((p) => p.slice()), ends: [stroke.ends[0], 0.15], wob: rng.int(1 << 20) };
  const tail = { pts: stroke.pts.slice(cut).map((p) => p.slice()), ends: [0.15, stroke.ends[1]], wob: rng.int(1 << 20) };
  return [head, tail];
}

/**
 * Mutate in place and return the same genome. Callers clone first.
 *
 * `magnitude` scales every continuous nudge and `rate` is the per-gene
 * probability; keeping them separate is what lets a hand tremor be loud (large
 * magnitude, low rate - few big changes) or busy (small magnitude, high rate -
 * many small ones) without a second code path.
 */
export function mutate(g, { rng, rate = 0.3, magnitude = 0.35 } = {}) {
  for (const k of GENE_KEYS) {
    if (rng.chance(rate)) nudgeGene(g.genes, k, rng, magnitude);
  }

  for (const s of g.strokes) {
    if (rng.chance(rate * 0.9)) {
      s.ends[0] = clamp(s.ends[0] + rng.wobble() * magnitude, 0, 1);
      s.ends[1] = clamp(s.ends[1] + rng.wobble() * magnitude, 0, 1);
    }
    if (rng.chance(rate * 0.25)) s.wob = rng.int(1 << 20);
    // Sparse per-point mutation: touching every control point every generation
    // destroys the drawing faster than selection can find anything in it.
    for (let i = 1; i < s.pts.length - 1; i++) {
      if (rng.chance(rate * 0.55)) nudgePoint(s.pts[i], rng, magnitude);
    }
  }

  // Structural moves are rarer than parameter moves on purpose. They are the
  // ones that change what the glyph IS, and a high rate on those turns evolution
  // into noise.
  const p = rate * magnitude;
  if (rng.chance(p * 0.35) && g.strokes.length < STROKES_MAX) {
    const src = g.strokes[rng.int(g.strokes.length)];
    const parts = splitStroke(rng, src);
    g.strokes.splice(g.strokes.indexOf(src), 1, ...parts);
  } else if (rng.chance(p * 0.4) && g.strokes.length > STROKES_MIN) {
    g.strokes.splice(rng.int(g.strokes.length), 1);
  } else if (rng.chance(p * 0.3) && g.strokes.length >= 2) {
    const a = rng.int(g.strokes.length);
    let b = rng.int(g.strokes.length - 1);
    if (b >= a) b++;
    const t = g.strokes[a];
    g.strokes[a] = g.strokes[b];
    g.strokes[b] = t;
  } else if (rng.chance(p * 0.3)) {
    // Mirror one stroke across the vertical axis: reflection is the one
    // transformation a symmetric glyph can reach without walking there one point
    // at a time.
    const s = g.strokes[rng.int(g.strokes.length)];
    for (const pt of s.pts) pt[0] = 1 - pt[0];
  } else if (rng.chance(p * 0.25)) {
    g.genes.slant = clamp(-g.genes.slant + rng.wobble() * 0.05, LIMITS.slant[0], LIMITS.slant[1]);
  }

  return normalizeGenome(g);
}

/**
 * Hybrid child of two parents.
 *
 * Style genes blend toward a random point between the parents (BLX-ish) so the
 * child explores the interval rather than snapping to either parent. Skeleton
 * structure is inherited whole, per stroke, chosen from one parent or the other -
 * interpolating control points across two unrelated skeletons produces
 * spaghetti, because stroke i of the parent has nothing to do with stroke i of
 * the other. Within an inherited stroke the points are still blended, which is
 * where the small visible differences come from.
 */
export function crossover(a, b, rng, { rate = 0.3, magnitude = 0.35 } = {}) {
  const child = cloneGenome(a);
  for (const k of GENE_KEYS) {
    const lo = Math.min(a.genes[k], b.genes[k]);
    const hi = Math.max(a.genes[k], b.genes[k]);
    const t = rng.range(-0.25, 1.25); // slight over-shoot past both parents
    child.genes[k] = clamp(lo + (hi - lo) * t, LIMITS[k][0], LIMITS[k][1]);
  }

  const donor = rng.chance(0.5) ? a : b;
  const n = rng.chance(0.5) ? a.strokes.length : donor.strokes.length;
  child.strokes = [];
  for (let i = 0; i < n; i++) {
    // One whole stroke from one parent, points inside it blended with the other
    // parent's corresponding stroke.
    const fromA = rng.chance(0.5);
    const pa = fromA ? a : b;
    const pb = fromA ? b : a;
    const src = pa.strokes[i % pa.strokes.length];
    const other = pb.strokes[i % pb.strokes.length];
    const s = { pts: [], ends: [0, 0], wob: src.wob };
    for (let j = 0; j < PTS; j++) {
      const from = rng.chance(0.5) ? src.pts[j] : other.pts[j];
      s.pts.push([from[0], from[1]]);
    }
    s.ends = [rng.chance(0.5) ? src.ends[0] : other.ends[0], rng.chance(0.5) ? src.ends[1] : other.ends[1]];
    child.strokes.push(s);
  }

  return mutate(child, { rng, rate, magnitude });
}

export { cloneGenome };

/**
 * Map hand signals onto mutation parameters.
 *
 *   rate      how fast you move   -> how many genes get touched at all
 *   magnitude how much you shake  -> how far each of them jumps
 *
 * Two different knobs on purpose, because a shaky hand and a fast hand should not
 * be the same input. Loud = few big changes (rate low, magnitude high) reads as a
 * decisive brush; busy = many small ones reads as an unsteady one. Collapsing both
 * into a single "intensity" made every fast gesture look like a nervous one.
 *
 * With no hand at all both parameters equal the slider values exactly, so the
 * sliders are the floor the hand adds to rather than a separate scale the HUD
 * silently rescales.
 */
export function mutationFromHand(hand, { baseRate = 0.3, baseMagnitude = 0.35, coupling = 1 } = {}) {
  const energy = clamp(hand.energy * coupling, 0, 1.4);
  const tremor = clamp(hand.jitter * coupling, 0, 1.4);
  const burst = clamp(hand.burst * coupling, 0, 1.4);
  return {
    rate: clamp(baseRate * (1 + energy * 2.2), 0.02, 0.95),
    // The burst coefficient is the larger of the two because it is the shorter:
    // it decays within a few frames, so it touches one or two generations. A
    // coefficient that made it merely equal to the tremor would be invisible.
    magnitude: clamp(baseMagnitude * (1 + tremor * 1.9 + burst * 2.4), 0.02, 1.2),
  };
}