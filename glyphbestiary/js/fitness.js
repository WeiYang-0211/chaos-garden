// Scoring an individual.
//
// Step 1 of the build, so the weights here are PROVISIONAL and deliberately
// boring: they exist to keep the population alive and legible while the piece is
// being built, not to express taste. Step 2 promotes the three components below
// into the artist's own sliders, and the weights move out of this file and into
// the UI. What is NOT provisional is the measurement itself - the same coverage,
// cohesion, balance and roughness numbers have to keep meaning what they mean
// after that, or the slider readouts would be lying.
//
// The four things worth measuring about ink, in the order a viewer notices them:
//
//  覆盖 coverage   - does it fill the em box, or is it a thin thing lost in the cell
//  凝聚 cohesion   - is it one mark or four scraps (flood fill on the ink mask)
//  平衡 balance    - is the centroid where a reader expects the centre
//  野性 roughness - how much the pen turned; this one is a coordinate, not a goal
import { clamp } from './util.js';
import { glyphPaths, rasterize } from './glyph.js';

export const GRID = 18;

export const COMPONENTS = [
  { key: 'coverage', label: '覆盖', hue: 200 },
  { key: 'cohesion', label: '凝聚', hue: 150 },
  { key: 'balance', label: '平衡', hue: 45 },
];

/**
 * Selection pressure - the artist's three hands on the wheel.
 *
 * These started as fixed weights and that was a mistake with a visible cost. The
 * three components have a single shared optimum: a compact, connected, centred
 * mark of about 30% ink. Run forty generations and every sampled lineage converges
 * on the same 习-like glyph, whichever way the weights are set - the drift has an
 * attractor, and it is not "wildness", it is "whatever the metrics happen to
 * reward". A pressure slider does not fix that either, for the same reason.
 *
 * What does fix it is giving wildness a TARGET instead of a penalty. A penalty
 * says "wildness costs"; a target says "this population should live at 行", and
 * the population will go there, because now the roughness band is competing with
 * the other components rather than losing to all of them at once. Drag the wild
 * slider from 楷 to 狂 and the whole grid changes species in about ten generations,
 * which is the difference between a piece you watch and a slider you push.
 *
 * The other two are ordinary weights. Normalised to sum to 1 on every change so
 * fitness stays a percentage and the HUD never has to explain a rescaled number.
 */
const pressure = {
  legibility: 0.3,   // 覆盖: does it fill the em box
  structure: 0.45,   // 凝聚 + 平衡
  wild: 0.25,        // 野性: how close roughness sits to the target below
  target: 0.55,      // target roughness. 0 = 楷, 0.55 = 行, 1.05 = 草, 1.75+ = 狂
};

export function setPressure(next = {}) {
  if (next.legibility !== undefined) pressure.legibility = clamp(next.legibility, 0, 1);
  if (next.structure !== undefined) pressure.structure = clamp(next.structure, 0, 1);
  if (next.wild !== undefined) pressure.wild = clamp(next.wild, 0, 1);
  if (next.target !== undefined) pressure.target = clamp(next.target, 0, 2.5);
  const sum = pressure.legibility + pressure.structure + pressure.wild;
  if (sum > 1e-6) {
    pressure.legibility /= sum;
    pressure.structure /= sum;
    pressure.wild /= sum;
  }
  return getPressure();
}

export function getPressure() {
  return { ...pressure };
}

const WILD_BAND = 0.55;  // roughness units either side of the target that still score

export function wildnessScore(roughness) {
  return clamp(1 - Math.abs(roughness - pressure.target) / WILD_BAND, 0, 1);
}

// Roughness that reads as each niche, for steering the quota.
const NICHE_ROUGHNESS = { kai: 0.2, xing: 0.8, cao: 1.4, kuang: 2.2 };

/**
 * How many slots each niche gets, as fractions of the population.
 *
 * Equal quotas turned out to be too strong a medicine. They guarantee the four
 * families stay on screen - which is what the piece needs - but they also PIN the
 * census: measured, dragging the wildness target from 楷 to 狂 left the population
 * within a few individuals of where it started, because a quota cannot be
 * outvoted. So the quota follows the artist's target, with a floor under every
 * niche: drag towards 狂 and the page fills with 狂, but a handful of each other
 * kind stay, because extinction should take work.
 */
export function nicheShare(floor = 0.08) {
  const raw = NICHES.map((n) => {
    const z = (NICHE_ROUGHNESS[n.key] - pressure.target) / 0.55;
    return Math.exp(-(z * z));
  });
  // Normalise, then push anything under the floor back up and normalise again. The
  // refinement is iterative because one pass is not enough: flooring BEFORE
  // normalising left two niches at 4.8% instead of the 8% promised, and flooring
  // after normalising once leaves the sum off by a percent. Converges in a handful
  // of passes; the last line guarantees the sum exactly.
  let w = raw.map((x) => Math.max(x, floor));
  for (let pass = 0; pass < 24; pass++) {
    const sum = w.reduce((a, b) => a + b, 0);
    w = w.map((x) => x / sum);
    const deficit = w.reduce((a, x) => a + Math.max(0, floor - x), 0);
    if (deficit < 1e-12) return w;
    w = w.map((x) => x + deficit / w.length);
  }
  const last = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / last);
}


/** Ink cells connected to each other, 4-neighbourhood, over the raster. */
function components(mask, grid) {
  const seen = new Uint8Array(mask.length);
  let parts = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    parts++;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const at = stack.pop();
      const x = at % grid;
      const y = (at - x) / grid;
      if (x > 0) { const n = at - 1; if (mask[n] && !seen[n]) { seen[n] = 1; stack.push(n); } }
      if (x < grid - 1) { const n = at + 1; if (mask[n] && !seen[n]) { seen[n] = 1; stack.push(n); } }
      if (y > 0) { const n = at - grid; if (mask[n] && !seen[n]) { seen[n] = 1; stack.push(n); } }
      if (y < grid - 1) { const n = at + grid; if (mask[n] && !seen[n]) { seen[n] = 1; stack.push(n); } }
    }
  }
  return parts;
}

/**
 * Niche name from roughness. Four bands, with the thresholds taken from where
 * the population's turnover actually falls: a straight 横 is 楷, a considered
 * sweep is 行, a founder's median lands at the 行/草 edge, and only the wilder
 * tail reaches 狂.
 *
 * Fixed thresholds rather than quantiles on purpose: if a glyph changed species
 * because its neighbours evolved, then the clade tree in step 3 would show a
 * species quietly turning into another one, which is not what happened.
 */
export const NICHES = [
  { key: 'kai', label: '楷', max: 0.55, color: '#6fd3ff' },
  { key: 'xing', label: '行', max: 1.05, color: '#7ef0b0' },
  { key: 'cao', label: '草', max: 1.75, color: '#ffb454' },
  { key: 'kuang', label: '狂', max: Infinity, color: '#ff7a9c' },
];

export function nicheOf(roughness) {
  for (const n of NICHES) if (roughness <= n.max) return n;
  return NICHES[NICHES.length - 1];
}

export function evaluate(genome, { res = 26 } = {}) {
  const { paths } = glyphPaths(genome, { res });
  const grid = GRID;
  const mask = rasterize(paths, grid);

  let ink = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      if (!mask[y * grid + x]) continue;
      ink++;
      sx += (x + 0.5) / grid;
      sy += (y + 0.5) / grid;
    }
  }

  const fraction = ink / mask.length;

  // Coverage is scored against a target, not maximised. Fill the whole cell and
  // you get a black square, which is the most legible nothing there is.
  const coverage = ink === 0 ? 0 : clamp(1 - Math.abs(0.30 - fraction) / 0.30, 0, 1);

  const parts = ink === 0 ? 0 : components(mask, grid);
  // One mark scores 1; each extra piece costs, but not linearly - 2 pieces and 6
  // pieces are both "not one character", and treating them differently just
  // rewards litter.
  const cohesion = ink === 0 ? 0 : clamp(1 / (1 + (parts - 1) * 0.8), 0, 1);

  const balance = ink === 0 ? 0 : clamp(1 - Math.hypot(sx / ink - 0.5, sy / ink - 0.5) / 0.36, 0, 1);

  // Wildness as a score against the target, not as a cost.
  //
  // Gated by how much of the drawn path actually went somewhere, because "turn per
  // unit length" has a degenerate maximum. Two attempts, both measured on contact
  // sheets:
  //
  //   1. Gate on total path length. Did nothing - a scribble made of a dozen
  //      overlapping strokes draws 2-3 em of path, so it sails past any length
  //      threshold. The 狂 population grew a stripe of vertical scribbles.
  //   2. Gate on length against the bbox the strokes cover, i.e. how much of the
  //      travel turned into displacement. A committed sweep spans its cell
  //      (extent 0.8 em over 2 em of path = 0.4); a scribble covers a narrow band
  //      (0.4 em over 2.5 em = 0.16). Wildness in a hand is long committed motion
  //      that happens to change direction a lot, so this is the ratio that says so.
  let turn = 0;
  let len = 0;
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const p of paths) {
    turn += p.turn;
    len += p.length;
    for (const [x, y] of p.center) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const roughness = len > 1e-6 ? clamp((turn / len) / 3, 0, 4) : 0;
  const extent = Math.max(maxX - minX, maxY - minY, 0);
  const travel = len > 1e-6 ? extent / len : 0;
  const reach = clamp(travel / 0.3, 0, 1);
  const wildness = wildnessScore(roughness) * reach;

  // Viability gate, not a fourth taste axis.
  //
  // A weighted sum is easy to cheat from one side: a blob of ink has perfect
  // cohesion and perfect balance, and with those two carrying most of the weight a
  // solid dot scored 0.70 - it simply let coverage do all the complaining. So the
  // amount of ink a glyph is allowed to put on the page is a hard gate. No setting
  // of the pressure sliders should ever make a full-page blot win.
  const body = clamp(Math.min(fraction / 0.06, (0.72 - fraction) / 0.32), 0, 1);

  const p = pressure;
  const structure = cohesion * 0.6 + balance * 0.4;
  const fitness = clamp(
    body * (p.legibility * coverage + p.structure * structure + p.wild * wildness),
    0, 1,
  );

  return {
    fitness, coverage, cohesion, balance, body, roughness, structure,
    wildness, reach, parts, ink, fraction, niche: nicheOf(roughness),
  };
}

/** Mean pairwise distance over a sample. Cheap enough for a HUD readout. */
export function diversity(individuals, rng, genomeDistance, samples = 24) {
  if (individuals.length < 2) return 0;
  let sum = 0;
  let n = 0;
  for (let k = 0; k < samples; k++) {
    const a = individuals[rng.int(individuals.length)];
    const b = individuals[rng.int(individuals.length)];
    if (a === b) continue;
    sum += genomeDistance(a.g, b.g);
    n++;
  }
  return n ? sum / n : 0;
}