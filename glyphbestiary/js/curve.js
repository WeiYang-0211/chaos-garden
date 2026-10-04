// Everything that turns a skeleton of control points into ink.
//
// Two rules shape this file:
//
//  1. It is pure math on arrays of numbers. No canvas, no DOM. The renderer only
//     fills polygons produced here, and the fitness rasterizer walks the same
//     centerlines, so what you measure is exactly what you see - and all of it
//     is testable in Node.
//  2. Tangents come from central differences and normals from those tangents.
//     The tempting shortcut - offset each point by its own normal - is what
//     makes hand-rolled strokes pinch at every joint, because the normal flips
//     sign across a corner faster than the width can follow.
import { clamp, smoothstep } from './util.js';

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// Centripetal (alpha = 0.5) Catmull-Rom, Barry-Goldman form. Centripetal is not
// an aesthetic choice: uniform Catmull-Rom loops and cusps whenever two knots sit
// close together, and evolution produces exactly that constantly, because a
// mutation that pulls one control point next to its neighbour is the most common
// mutation there is. Uniform would make the population full of knots.
const knot = (t, a, b, alpha) => t + Math.pow(dist(a, b), alpha);

function mix(a, b, wa, wb) {
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb];
}

export function crPoint(p0, p1, p2, p3, t, alpha = 0.5) {
  const t0 = 0;
  const t1 = knot(t0, p0, p1, alpha);
  const t2 = knot(t1, p1, p2, alpha);
  const t3 = knot(t2, p2, p3, alpha);
  // Coincident knots collapse their span; sampling it would divide by zero.
  if (t1 === t0 || t2 === t1 || t3 === t2) return [p2[0], p2[1]];
  const tt = t1 + (t2 - t1) * t;
  const a1 = mix(p0, p1, (t1 - tt) / (t1 - t0), (tt - t0) / (t1 - t0));
  const a2 = mix(p1, p2, (t2 - tt) / (t2 - t1), (tt - t1) / (t2 - t1));
  const a3 = mix(p2, p3, (t3 - tt) / (t3 - t2), (tt - t2) / (t3 - t2));
  const b1 = mix(a1, a2, (t2 - tt) / (t2 - t0), (tt - t0) / (t2 - t0));
  const b2 = mix(a2, a3, (t3 - tt) / (t3 - t1), (tt - t1) / (t3 - t1));
  return mix(b1, b2, (t2 - tt) / (t2 - t1), (tt - t1) / (t2 - t1));
}

// Duplicate the endpoints so the first and last spans have four real neighbours.
function withGhostEnds(pts) {
  const out = [[pts[0][0], pts[0][1]], [pts[0][0], pts[0][1]]];
  for (const p of pts) out.push([p[0], p[1]]);
  const last = pts[pts.length - 1];
  out.push([last[0], last[1]], [last[0], last[1]]);
  return out;
}

/**
 * Dense polyline through `pts`, sample count proportional to chord length so the
 * walk is roughly constant speed instead of bunching samples on short spans.
 */
export function splineDense(pts, { perUnit = 120, alpha = 0.5 } = {}) {
  if (pts.length < 2) return pts.map((p) => [p[0], p[1]]);
  const cp = withGhostEnds(pts);
  const out = [];
  for (let i = 1; i + 2 < cp.length; i++) {
    const steps = Math.max(2, Math.ceil(dist(cp[i], cp[i + 1]) * perUnit));
    for (let s = 0; s < steps; s++) {
      out.push(crPoint(cp[i - 1], cp[i], cp[i + 1], cp[i + 2], s / steps, alpha));
    }
  }
  const end = cp[cp.length - 2];
  out.push([end[0], end[1]]);
  return out;
}

/** Even arc-length resample. Density from the spline walk is only approximate. */
export function resample(poly, count) {
  if (poly.length === 0 || count <= 0) return [];
  const flat = () => new Array(count).fill(0).map(() => [poly[0][0], poly[0][1]]);
  if (poly.length === 1 || count === 1) return flat();

  const acc = [0];
  for (let i = 1; i < poly.length; i++) acc.push(acc[i - 1] + dist(poly[i - 1], poly[i]));
  const total = acc[acc.length - 1];
  if (total <= 1e-9) return flat();

  const out = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = (k / (count - 1)) * total;
    while (j < acc.length - 2 && acc[j + 1] < target) j++;
    const span = Math.max(1e-9, acc[j + 1] - acc[j]);
    const t = (target - acc[j]) / span;
    out.push([
      poly[j][0] + (poly[j + 1][0] - poly[j][0]) * t,
      poly[j][1] + (poly[j + 1][1] - poly[j][1]) * t,
    ]);
  }
  return out;
}

export function resampleSpline(pts, count) {
  return resample(splineDense(pts), count);
}

export function pathLength(poly) {
  let total = 0;
  for (let i = 1; i < poly.length; i++) total += dist(poly[i - 1], poly[i]);
  return total;
}

/** Unit tangents by central difference - the whole reason outlines stay smooth. */
export function unitTangents(poly) {
  const n = poly.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = poly[Math.max(0, i - 1)];
    const b = poly[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const m = Math.hypot(dx, dy);
    out[i] = m > 1e-12 ? [dx / m, dy / m] : [1, 0];
  }
  return out;
}

/**
 * Width along the stroke, in em units, as a half-width.
 *
 * `ends` are the two taper genes: 0 is a blunt chisel start/stop, 1 is a long
 * drawn-out point (藏锋). They are what separates a �?stroke from a �?one at
 * the very ends of the ink, and they are the first thing a viewer reads as
 * "calligraphy" rather than "shape".
 */
export function widthProfile(t, { weight, contrast, ends }) {
  const u = clamp(t, 0, 1);
  const taperIn = clamp(ends[0], 0, 1);
  const taperOut = clamp(ends[1], 0, 1);
  // Belly: thin at the ends, full in the middle. The exponent below 1 keeps the
  // thick part broad instead of peaking like a sausage.
  const belly = 1 + contrast * (0.62 * Math.pow(Math.sin(Math.PI * u), 0.7) - 0.12);
  // Taper 0 is a real phenotype, not "a little tapered": the tip factor goes to 1
  // at that end, so the stroke ends on a full-width chisel (隶书 / 折笔). Because
  // the cut-off is at exactly zero rather than near zero, a mutation that lands
  // there changes the stroke's whole ending at once - which is the point of having
  // the gene.
  const lead = taperIn <= 0 ? 1 : Math.min(1, u / (0.02 + 0.34 * taperIn));
  const tail = taperOut <= 0 ? 1 : Math.min(1, (1 - u) / (0.02 + 0.34 * taperOut));
  const tip = Math.pow(Math.min(lead, tail), 0.55);
  return Math.max(0.0012, weight * belly * tip);
}

/**
 * Closed outline polygon for one stroke: down one side, back along the other.
 *
 * `half` must already be the profile sampled at each centerline point. The end
 * caps extend by the local half-width, which is nearly free of charge: a tapered
 * end has a tiny half-width there and so extends almost nothing, while a blunt
 * end extends into a rounded chisel cap. One formula, both behaviours.
 */
export function outline(center, half, tangents) {
  const n = center.length;
  const tan = tangents || unitTangents(center);
  const left = [];
  const right = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = center[i];
    const [tx, ty] = tan[i];
    const h = half[i];
    const nx = -ty;
    const ny = tx;
    left.push([x + nx * h, y + ny * h]);
    right.push([x - nx * h, y - ny * h]);
  }
  const e0 = half[0] * 0.8;
  const eN = half[n - 1] * 0.8;
  left[0] = [left[0][0] + tan[0][0] * e0, left[0][1] + tan[0][1] * e0];
  right[0] = [right[0][0] + tan[0][0] * e0, right[0][1] + tan[0][1] * e0];
  left[n - 1] = [left[n - 1][0] + tan[n - 1][0] * eN, left[n - 1][1] + tan[n - 1][1] * eN];
  right[n - 1] = [right[n - 1][0] + tan[n - 1][0] * eN, right[n - 1][1] + tan[n - 1][1] * eN];
  right.reverse();
  return left.concat(right);
}

/** Total absolute turn along a polyline, in radians. Feeds the 野�?metric. */
export function totalTurn(poly) {
  if (poly.length < 3) return 0;
  let sum = 0;
  let prevAng = null;
  for (let i = 1; i < poly.length; i++) {
    const ang = Math.atan2(poly[i][1] - poly[i - 1][1], poly[i][0] - poly[i - 1][0]);
    if (prevAng !== null) {
      let d = ang - prevAng;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      sum += Math.abs(d);
    }
    prevAng = ang;
  }
  return sum;
}

/**
 * Smooth 1-D value noise over t in [0,1], deterministic from `seed`.
 *
 * This is the heritable "笔�?: the tremor a stroke carries along its length. It
 * has to be seeded rather than random per frame, otherwise a genome would redraw
 * differently every frame and there would be no animal to watch evolve.
 *
 * Hashed integer lattice rather than a wrapped knot table: octave 2 walks past
 * the end of any small table, and wrapping makes the noise repeat a knot instead
 * of continuing through it.
 */
function hashLattice(i, seed) {
  let x = (Math.imul(i | 0, 374761393) + Math.imul(seed | 0, 668265263)) >>> 0;
  x = (x ^ (x >>> 13)) >>> 0;
  x = Math.imul(x, 1274126177) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 2147483648 - 1;
}

export function tremorNoise(seed, octaves = 1) {
  return (t) => {
    const u = clamp(t, 0, 1);
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let freq = 1;
    for (let o = 0; o < octaves; o++) {
      const x = u * freq;
      const i = Math.floor(x);
      const f = smoothstep(x - i);
      const s = seed + o * 7919;
      sum += (hashLattice(i, s) * (1 - f) + hashLattice(i + 1, s) * f) * amp;
      norm += amp;
      amp *= 0.45;
      freq *= 2.7;
    }
    return sum / norm;
  };
}