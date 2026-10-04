// Genome -> ink. Pure geometry: it hands back closed polygons for the renderer
// and centerlines/half-widths for the fitness rasterizer, so what gets scored is
// the same shape that gets drawn.
//
// Expects an already-normalized genome (population.js guarantees it). This runs
// for every individual on every generation tick - 200 glyphs at ~4 ticks a second
// - so it allocates one object per stroke and nothing else.
import { clamp } from './util.js';
import { meanStep } from './archetype.js';
import { outline, pathLength, resampleSpline, totalTurn, tremorNoise, unitTangents, widthProfile } from './curve.js';

const TREMOR = 0.014;   // em cap on the waver; scaled down for short strokes
const FLICK = 0.02;     // em, terminal hook at full flourish
const MAX_HALF = 0.055; // em, widest a single brush may ever be, however it got there

/**
 * Bow the control points sideways, the way a loaded brush drifts.
 *
 * Normal-only on purpose. Displacing along both axes made short strokes read as
 * noise rather than as a hand, because the waver fought the direction of travel
 * instead of riding across it.
 *
 * The amplitude is proportional to the stroke's own point spacing. Fixed in em
 * units, the waver that looks like a hand on a full-length 横 reverses a 点 whose
 * points are twenty times closer together - and a reversed stroke is not wild
 * handwriting, it is an artefact that the roughness metric then rewards.
 */
function waver(stroke) {
  const pts = stroke.pts;
  const noise = tremorNoise(stroke.wob);
  const n = pts.length;
  const amp = Math.min(TREMOR, meanStep(pts) * 0.18);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const m = Math.hypot(dx, dy);
    if (m > 1e-9) { dx /= m; dy /= m; }
    const k = noise(i / Math.max(1, n - 1)) * amp;
    out[i] = [pts[i][0] - dy * k, pts[i][1] + dx * k];
  }
  return out;
}

/** Shear for 倾侧, then 字面宽窄 on x and 高矮 on y. */
function place(pts, genes) {
  const { slant, width, aspect } = genes;
  return pts.map(([x, y]) => [
    0.5 + (x - 0.5) * width + slant * (0.5 - y),
    0.5 + (y - 0.5) * aspect,
  ]);
}

/**
 * Terminal hook, signed off the tremor seed so it is heritable but not
 * predictable from the shape alone.
 */
function hook(center, genes, sign) {
  const amp = genes.flourish * FLICK;
  if (amp < 1e-4) return center;
  const n = center.length;
  const tan = unitTangents(center);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    const head = clamp((0.34 - t) / 0.34, 0, 1);
    const tail = clamp((t - 0.66) / 0.34, 0, 1);
    const push = amp * Math.max(head, tail) ** 2 * sign;
    out[i] = [center[i][0] - tan[i][1] * push, center[i][1] + tan[i][0] * push];
  }
  return out;
}

/**
 * Uniform scale + centre, so every glyph is comparable in its cell and no glyph is
 * stretched.
 *
 * The scale is CAPPED, and that cap is the fix for the worst thing this renderer
 * used to do. Uncapped, a 点 - a tenth of an em long - was scaled up eightfold to
 * fill its cell, and because the ink weight is expressed in em units and was
 * multiplied by the same factor, its brush came along too: every dot in the
 * population rendered as a fat lozenge and the whole grid read as blots rather
 * than as writing. Capped at 2x, a dot stays a dot, and the variation in how much
 * of its cell a glyph occupies - 字面率 - becomes visible instead of being erased.
 */
function fit(lines, pad = 0.06, maxScale = 2.2) {
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const line of lines) {
    for (const [x, y] of line) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const span = Math.max(maxX - minX, maxY - minY);
  if (!Number.isFinite(span) || span < 1e-6) return { scale: 1, ox: 0, oy: 0 };
  const scale = Math.min((1 - pad * 2) / span, maxScale);
  return { scale, ox: 0.5 - ((minX + maxX) / 2) * scale, oy: 0.5 - ((minY + maxY) / 2) * scale };
}

export function glyphPaths(g, { res = 26 } = {}) {
  const genes = g.genes;
  const lines = [];
  for (let i = 0; i < g.strokes.length; i++) {
    const s = g.strokes[i];
    const sign = (s.wob & 1) ? 1 : -1;
    lines.push(hook(resampleSpline(place(waver(s), genes), res), genes, sign));
  }
  const { scale, ox, oy } = fit(lines);

  const paths = new Array(lines.length);
  for (let i = 0; i < lines.length; i++) {
    const s = g.strokes[i];
    const center = new Array(res);
    const half = new Array(res);
    for (let k = 0; k < res; k++) {
      center[k] = [lines[i][k][0] * scale + ox, lines[i][k][1] * scale + oy];
      // Clamped as well as scaled. The fit is capped now, but a fat stroke on a
      // short skeleton can still work out wider than it is long, and a brush that
      // is wider than the mark it made is not a brush, it is a blot.
      half[k] = Math.min(widthProfile(k / (res - 1), {
        weight: genes.weight, contrast: genes.contrast, ends: s.ends,
      }) * scale, MAX_HALF);
    }
    paths[i] = {
      poly: outline(center, half),
      center,
      half,
      length: pathLength(center),
      turn: totalTurn(center),
    };
  }
  return { paths, scale };
}

/**
 * Cells, from centerlines and half-widths - no polygon scanline fill.
 *
 * A stroke is walked in half-cell steps and stamps a disc of its own width. At
 * GRID 18 that is a few hundred marks per glyph against ~2k for a scanline fill,
 * and the fitness only needs "is there ink here", not an exact area. Error is
 * biased outward by at most half a cell, which is well under the difference
 * between the fitness bands the sliders in step 2 will separate.
 */
export function rasterize(paths, grid) {
  const mask = new Uint8Array(grid * grid);
  const cell = 1 / grid;
  for (const p of paths) {
    const c = p.center;
    for (let i = 0; i < c.length - 1; i++) {
      const a = c[i];
      const b = c[i + 1];
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.max(1, Math.ceil(seg / (cell * 0.5)));
      const h = Math.max(p.half[i], p.half[i + 1]);
      // Pad by half a cell so two strokes a hair apart still read as connected.
      const reach = h + cell * 0.5;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = a[0] + (b[0] - a[0]) * t;
        const y = a[1] + (b[1] - a[1]) * t;
        const gx = Math.floor(x / cell);
        const gy = Math.floor(y / cell);
        const r = Math.ceil(reach / cell);
        for (let oy = -r; oy <= r; oy++) {
          const yi = gy + oy;
          if (yi < 0 || yi >= grid) continue;
          for (let ox = -r; ox <= r; ox++) {
            const xi = gx + ox;
            if (xi < 0 || xi >= grid) continue;
            const dx = (xi + 0.5) * cell - x;
            const dy = (yi + 0.5) * cell - y;
            if (dx * dx + dy * dy <= reach * reach) mask[yi * grid + xi] = 1;
          }
        }
      }
    }
  }
  return mask;
}