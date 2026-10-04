// The canvas stage: where the grid goes and how a cell is inked.
//
// Split out of main.js so the painting path can be tested headlessly against a
// recording stub context. That matters more than it sounds: the one bug a paint
// loop can have that no unit test of the geometry would catch is a NaN coordinate
// reaching the canvas, which silently draws nothing and looks exactly like a
// glyph that scored badly.
import { glyphPaths } from './glyph.js';

export const CELL_TARGET = 92;

export function computeLayout(width, height, size, cellTarget = CELL_TARGET) {
  const cols = Math.max(4, Math.floor(width / cellTarget));
  const rows = Math.ceil(size / cols);
  const cell = Math.min(width / cols, height / rows);
  return { cols, rows, cell, ox: (width - cols * cell) / 2, oy: (height - rows * cell) / 2, width, height };
}

/** Drawing box for individual i, inset so neighbouring cells keep a visible gap. */
export function cellBox(i, layout) {
  const pad = layout.cell * 0.06;
  return {
    x: layout.ox + (i % layout.cols) * layout.cell + pad,
    y: layout.oy + Math.floor(i / layout.cols) * layout.cell + pad,
    s: layout.cell - pad * 2,
  };
}

/**
 * Paint the whole population. Returns what it drew so callers can assert on it.
 *
 * Alpha carries fitness and hue carries niche, so the grid can be read at a
 * glance: a wall of one colour means selection has settled, which is information
 * rather than decoration.
 */
export function paint(ctx, individuals, layout, { res = 26, background = '#0a0d12' } = {}) {
  const t0 = performance.now();
  ctx.clearRect(0, 0, layout.width, layout.height);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.lineJoin = 'round';

  let strokes = 0;
  let bestIndex = 0;
  let bestFitness = -Infinity;
  for (let i = 0; i < individuals.length; i++) {
    const ind = individuals[i];
    if (ind.m.fitness > bestFitness) { bestFitness = ind.m.fitness; bestIndex = i; }
    const box = cellBox(i, layout);
    const { paths } = glyphPaths(ind.g, { res });
    ctx.fillStyle = ind.m.niche.color;
    ctx.globalAlpha = 0.3 + 0.7 * ind.m.fitness;
    for (const p of paths) {
      const poly = p.poly;
      ctx.beginPath();
      ctx.moveTo(box.x + poly[0][0] * box.s, box.y + poly[0][1] * box.s);
      for (let k = 1; k < poly.length; k++) ctx.lineTo(box.x + poly[k][0] * box.s, box.y + poly[k][1] * box.s);
      ctx.closePath();
      ctx.fill();
      strokes++;
    }
  }

  // The leader is ringed rather than drawn brighter: alpha is already spent on
  // fitness, and the point of marking it is being able to find it again in a grid
  // of 200.
  const bb = cellBox(bestIndex, layout);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bb.x - 3, bb.y - 3, bb.s + 6, bb.s + 6);
  ctx.globalAlpha = 1;

  return { glyphs: individuals.length, strokes, bestIndex, ms: performance.now() - t0 };
}

/** The founder being drawn: an em box with a cross, then the raw gesture on top. */
export function paintGesture(ctx, box, pts, { accent = '#6fd3ff' } = {}) {
  ctx.strokeStyle = 'rgba(150,190,255,.28)';
  ctx.lineWidth = 1;
  ctx.strokeRect(box.x, box.y, box.s, box.s);
  ctx.beginPath();
  ctx.moveTo(box.x + box.s / 2, box.y);
  ctx.lineTo(box.x + box.s / 2, box.y + box.s);
  ctx.moveTo(box.x, box.y + box.s / 2);
  ctx.lineTo(box.x + box.s, box.y + box.s / 2);
  ctx.stroke();

  if (!pts || !pts.length) return;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(box.x + pts[0][0] * box.s, box.y + pts[0][1] * box.s);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(box.x + pts[i][0] * box.s, box.y + pts[i][1] * box.s);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

/**
 * The tremor scope: residual against the slow average, i.e. the shake itself.
 *
 * `scale` is passed in rather than read from `window` so the trace means the same
 * thing on a laptop and on a 4K display without this module needing a DOM.
 */
export function paintScope(ctx, trace, traceAt, { present = false, width, height, scale = 12 }) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#05070b';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(150,190,255,.18)';
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();

  const n = trace.length;
  if (n < 2) return;
  ctx.strokeStyle = present ? '#6fd3ff' : 'rgba(150,190,255,.35)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const v = trace[(traceAt + i) % n];
    const y = height / 2 - Math.max(-1.4, Math.min(1.4, v / scale)) * (height / 2 - 3);
    const x = (i / (n - 1)) * width;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}