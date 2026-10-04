// Founding population generator.
//
// The naive version - random control points - produces scribbles, and selection
// cannot rescue it: fitness is measured on ink coverage and cohesion, both of
// which a scribble already satisfies, so a random founder walks straight past
// every selection pressure into a cloud of noise and the piece is over before it
// starts.
//
// So founders are composed, not sampled. A small set of calligraphic primitives
// (横竖撇捺点折) is placed into the cells of a 5x5 layout chosen by structure -
// 独体 / 上下 / 左右 / 包围 / 交叉 - and then jittered. The result is legible on
// sight but loose enough that evolution has somewhere to go.
import { clamp, lerp } from './util.js';

export const PTS = 7;

// Em box with a margin. Skeletons are authored in this box and the renderer fits
// them into the drawing cell later, so nothing here needs to know cell size.
const M = 0.1;
const X0 = M;
const X1 = 1 - M;
const Y0 = M;
const Y1 = 1 - M;

/** Straight run of PTS points with an optional bow, the way a 横 is never flat. */
function run(x0, y0, x1, y1, bow = 0) {
  const pts = [];
  for (let i = 0; i < PTS; i++) {
    const t = i / (PTS - 1);
    const arc = Math.sin(Math.PI * t) * bow;
    // Bow is perpendicular to the run, so it curves the stroke instead of
    // sliding it sideways.
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    pts.push([x0 + dx * t - (dy / len) * arc, y0 + dy * t + (dx / len) * arc]);
  }
  return pts;
}

// Each primitive returns an array of strokes, because 折 is two strokes in one
// gesture and 口 is three. Keeping that structure instead of flattening it is
// what lets a mutation "grow a corner" rather than jitter a point into a corner.
export const PRIMITIVES = {
  heng: (x0, y0, x1, y1) => [run(x0, y0, x1, y0, 0.018)],
  shu: (x0, y0, x1, y1) => [run(x0, y0, x0, y1, -0.014)],
  pie: (x0, y0, x1, y1) => [run(x1, y0, x0, y1, 0.03)],
  na: (x0, y0, x1, y1) => [run(x0, y0, x1, y1, -0.022)],
  dian: (x0, y0, x1, y1) => [run(x1, y0, x0, y0 + 0.1)],
  zhe: (x0, y0, x1, y1) => [run(x0, y0, x0, y1, 0), run(x0, y1, x1, y1, 0.016)],
  hengzhe: (x0, y0, x1, y1) => [run(x0, y0, x1, y0, 0.016), run(x1, y0, x1, y1, -0.012)],
  kou: (x0, y0, x1, y1) => [
    run(x0, y0, x1, y0, 0.016),
    run(x1, y0, x1, y1, -0.012),
    run(x1, y1, x0, y1, 0.014),
  ],
  wang: (x0, y0, x1, y1) => [
    run(x0, y0, x1, y0, 0.016),
    run(x0, y1, x1, y1, 0.016),
    run(x1, y0, x1, y1, 0),
    run(x0 + 0.06, (y0 + y1) / 2, x1 - 0.06, (y0 + y1) / 2, 0.012),
  ],
  shizi: (x0, y0, x1, y1) => [run(x0, y0, x0, y1, 0), run(x0, y0, x1, y0, 0.016)],
};

// Cell -> primitives it may host. Corners want the folded ones, the middle band
// wants diagonals. Without this, a 折 lands in the centre and the glyph reads as
// noise no matter how good the strokes are.
const CELLS = {
  tl: ['heng', 'hengzhe', 'shu', 'shizi', 'dian'],
  tc: ['heng', 'hengzhe', 'shu', 'zhe'],
  tr: ['heng', 'shu', 'hengzhe', 'zhe', 'dian'],
  ml: ['shu', 'pie', 'zhe', 'heng', 'dian'],
  mc: ['shu', 'pie', 'na', 'heng', 'dian', 'zhe'],
  mr: ['shu', 'na', 'zhe', 'heng', 'dian'],
  bl: ['heng', 'zhe', 'shu', 'shizi', 'na'],
  bc: ['heng', 'shu', 'zhe', 'wang'],
  br: ['heng', 'shu', 'hengzhe', 'na'],
};

const LAYOUTS = [
  { name: '独体', cells: ['ml', 'mc', 'mr'], box: [0, 0, 1, 1] },
  { name: '上下', cells: ['tc', 'mc', 'bc'], box: [0, 0, 1, 1] },
  { name: '左右', cells: ['ml', 'mr', 'mc'], box: [0, 0, 1, 1] },
  { name: '包围', cells: ['tl', 'tr', 'bl', 'br'], box: [0, 0, 1, 1] },
  { name: '三叠', cells: ['tc', 'mc', 'ml', 'mr', 'bc'], box: [0, 0, 1, 1] },
];

/** Grid slot -> rectangle in em units. Half-open so neighbours do not overlap. */
const SLOTS = {
  tl: [0, 0, 0.5, 0.5],
  tc: [0.25, 0, 0.75, 0.5],
  tr: [0.5, 0, 1, 0.5],
  ml: [0, 0.25, 0.5, 0.75],
  mc: [0.25, 0.25, 0.75, 0.75],
  mr: [0.5, 0.25, 1, 0.75],
  bl: [0, 0.5, 0.5, 1],
  bc: [0.25, 0.5, 0.75, 1],
  br: [0.5, 0.5, 1, 1],
};

/**
 * Compose a founder skeleton. Returns strokes plus the layout name, so the HUD
 * can say what shape it is currently seeded from.
 */
export function founderSkeleton(rng) {
  const layout = rng.pick(LAYOUTS);
  // At least two cells. One cell means one or two strokes, and a plate of
  // founders that is 40% lone horizontals is monotonous to watch even though a
  // lone horizontal is a perfectly good character.
  const count = Math.min(layout.cells.length, 2 + rng.int(Math.max(1, layout.cells.length - 1)));
  const used = layout.cells.slice(0, count);
  const strokes = [];
  for (const cell of used) {
    const slot = SLOTS[cell];
    // Inset each slot so neighbouring strokes keep a visible gap: the eye reads
    // a gap between strokes as structure and a touching pair as a blob.
    const gap = 0.035 + rng.range(0, 0.045);
    const x0 = X0 + (X1 - X0) * (slot[0] + gap);
    const x1 = X0 + (X1 - X0) * (slot[2] - gap);
    const y0 = Y0 + (Y1 - Y0) * (slot[1] + gap);
    const y1 = Y0 + (Y1 - Y0) * (slot[3] - gap);
    const name = rng.pick(CELLS[cell]);
    for (const s of PRIMITIVES[name](x0, y0, x1, y1)) strokes.push(s);
  }

  // Tremor on the joints: a perfectly straight 横 looks machined, and evolution
  // has no gradient to climb from a machined start.
  //
  // Scaled to the stroke's own segment spacing, not a fixed em amount. A 点 is
  // seven points across a tenth of an em, so a fixed jitter larger than that
  // spacing does not waver the stroke - it reverses it, and the founders come out
  // as zigzags that measure as wildly 草 before a single generation has run.
  const out = strokes.map((s) => {
    const amp = Math.min(0.03, meanStep(s) * 0.14);
    return s.map(([x, y]) => [clamp(x + rng.jitter(amp), 0.04, 0.96), clamp(y + rng.jitter(amp), 0.04, 0.96)]);
  });
  return { strokes: out, layout: layout.name };
}

/** Mean distance between consecutive control points. */
export function meanStep(pts) {
  if (pts.length < 2) return 1;
  let sum = 0;
  for (let i = 1; i < pts.length; i++) {
    sum += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return sum / (pts.length - 1);
}

/**
 * A founder drawn by hand: one gesture, resampled onto the gene lattice.
 *
 * Direction changes become separate strokes on purpose. A user drawing a single
 * continuous gesture expects it to stay one stroke, but evolution needs the piece
 * count to be about structure, and the honest reading of "I drew a 己" is four
 * strokes. Splitting on sharp turns keeps the drawn shape while giving the
 * genome the same number of units a real brush would have.
 */
export function founderFromGesture(points, { minRun = 0.055, corner = 1.05 } = {}) {
  if (points.length < 2) return { strokes: [], layout: '手绘' };
  const runs = [];
  let cur = [points[0].slice()];
  let dir = null;
  for (let i = 1; i < points.length; i++) {
    const step = [points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]];
    const len = Math.hypot(step[0], step[1]);
    if (len < 1e-4) continue;
    const unit = [step[0] / len, step[1] / len];
    const cos = dir ? unit[0] * dir[0] + unit[1] * dir[1] : 1;
    const runLen = polyLen(cur);
    if (cos < Math.cos(corner) && runLen >= minRun) {
      runs.push(cur);
      cur = [points[i - 1].slice()];
    }
    cur.push(points[i].slice());
    dir = unit;
  }
  if (cur.length > 1) runs.push(cur);

  const strokes = runs
    .filter((r) => polyLen(r) >= minRun * 0.6)
    .map((r) => lerpRun(r, 1 / PTS))
    .slice(0, 9);
  return { strokes, layout: '手绘' };
}

function polyLen(pts) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return total;
}

function lerpRun(pts, step) {
  const out = [pts[0].slice()];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = step - carry;
    while (t <= seg) {
      out.push([lerp(a[0], b[0], t / seg), lerp(a[1], b[1], t / seg)]);
      t += step;
    }
    carry = (carry + seg) % step;
  }
  const last = pts[pts.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > step * 0.4) out.push(last.slice());
  return out.slice(0, PTS);
}