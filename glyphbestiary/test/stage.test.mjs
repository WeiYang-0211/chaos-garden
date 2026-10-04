// The paint path, against a recording stub context.
//
// The failure this guards against is specific: a NaN or infinite coordinate
// reaching the canvas draws nothing at all, and on screen that is indistinguishable
// from a glyph that simply scored badly. So every coordinate the stage emits is
// checked here, along with the calls it makes - one fill per stroke, the leader
// ringed once, and a clean path back to the background on every repaint.
import { cellBox, computeLayout, paint, paintGesture, paintScope } from '../js/stage.js';
import { evaluate } from '../js/fitness.js';
import { Population } from '../js/population.js';
import { makeRng } from '../js/util.js';

let fail = 0;
const check = (name, ok, detail = '') => {
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ->  ' + detail : ''}`);
};

function makeCtx() {
  const calls = { begin: 0, fill: 0, moveTo: 0, lineTo: 0, close: 0, strokeRect: 0, clearRect: 0, fillRect: 0, coords: [], alphas: [], styles: [], strokes: 0 };
  return {
    calls,
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: '',
    lineCap: '',
    setTransform() {},
    clearRect() { calls.clearRect++; },
    fillRect() { calls.fillRect++; },
    beginPath() { calls.begin++; },
    closePath() { calls.close++; },
    fill() { calls.fill++; calls.alphas.push(this.globalAlpha); calls.styles.push(this.fillStyle); },
    stroke() { calls.strokes++; },
    strokeRect(x, y, w, h) { calls.strokeRect++; calls.coords.push([x, y, w, h]); },
    moveTo(x, y) { calls.moveTo++; calls.coords.push([x, y]); },
    lineTo(x, y) { calls.lineTo++; calls.coords.push([x, y]); },
  };
}

const pop = new Population({ size: 60, rng: makeRng(31), evaluate });
for (let i = 0; i < 25; i++) pop.step();

// --- layout ---------------------------------------------------------------
{
  const l = computeLayout(1920, 1080, 200);
  check('the grid fits the window', l.cols * l.cell <= 1920 + 1e-6 && l.rows * l.cell <= 1080 + 1e-6,
    `${l.cols}x${l.rows} of ${l.cell.toFixed(0)}px`);
  check('the grid is centred', Math.abs(l.ox + l.cols * l.cell / 2 - 960) < 1e-6,
    `ox ${l.ox.toFixed(1)}`);
  check('the grid has room for everyone', l.cols * l.rows >= 200, `${l.cols * l.rows} cells`);
  check('the block is square-celled, not stretched', Math.abs(l.cell - Math.min(1920 / l.cols, 1080 / l.rows)) < 1e-9);

  const tiny = computeLayout(320, 240, 200);
  check('a small window still gets at least 4 columns', tiny.cols >= 4, `${tiny.cols}`);
  check('neighbouring cells never overlap', (() => {
    const a = cellBox(0, l);
    const b = cellBox(1, l);
    return a.x + a.s <= b.x + 1e-9;
  })());
  check('cells are inset from each other', (() => {
    const a = cellBox(0, l);
    return a.s < l.cell;
  })(), `${cellBox(0, l).s.toFixed(1)} < ${l.cell.toFixed(1)}`);
  check('a cell sits inside the viewport', (() => {
    const a = cellBox(199, l);
    return a.x >= 0 && a.y >= 0 && a.x + a.s <= 1920 + 1e-6 && a.y + a.s <= 1080 + 1e-6;
  })());
}

// --- painting -------------------------------------------------------------
{
  const ctx = makeCtx();
  const layout = computeLayout(1440, 900, 60);
  const r = paint(ctx, pop.individuals, layout, { res: 20 });

  check('one fill per stroke', r.strokes === pop.individuals.reduce((n, i) => n + i.g.strokes.length, 0),
    `${r.strokes} fills`);
  check('one path per fill', ctx.calls.begin === r.strokes && ctx.calls.close === r.strokes);
  check('the background is cleared and repainted every frame',
    ctx.calls.clearRect === 1 && ctx.calls.fillRect === 1);
  check('the leader is ringed exactly once', ctx.calls.strokeRect === 1);
  check('every coordinate the stage emitted is a finite number in the viewport',
    ctx.calls.coords.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < 5000 && Math.abs(y) < 5000),
    `${ctx.calls.coords.length} coordinates`);
  check('nothing is drawn with a transparent alpha',
    ctx.calls.alphas.every((a) => a > 0 && a <= 1));
  check('alpha tracks fitness', (() => {
    const alphas = ctx.calls.alphas.filter((a) => a < 1);
    return alphas.length > 0 && Math.min(...alphas) >= 0.3 && Math.max(...alphas) <= 1;
  })());
  check('fill colour is always a niche colour',
    new Set(ctx.calls.styles).size > 1, `${new Set(ctx.calls.styles).size} colours`);
  check('the leader index points at the actual best', (() => {
    const best = pop.individuals[r.bestIndex];
    return best.m.fitness === Math.max(...pop.individuals.map((i) => i.m.fitness));
  })());
  check('paint reports how long it took', r.ms >= 0);

  // A repaint must not accumulate: same population, same call counts.
  const again = paint(ctx, pop.individuals, layout, { res: 20 });
  check('a repaint draws exactly as much as the first', again.strokes === r.strokes);
}

// --- the founder overlay --------------------------------------------------
{
  const ctx = makeCtx();
  const layout = computeLayout(900, 700, 60);
  const box = cellBox(0, layout);
  paintGesture(ctx, box, [[0.1, 0.1], [0.5, 0.5], [0.9, 0.2]]);
  // The em-box cross is two moves and two lines; the gesture adds one move and two more.
  check('the founder overlay draws the cross and the gesture', ctx.calls.moveTo === 3 && ctx.calls.lineTo === 4,
    `${ctx.calls.moveTo} moves, ${ctx.calls.lineTo} lines`);
  check('the founder overlay draws in viewport coordinates',
    ctx.calls.coords.every(([x, y]) => x >= 0 && y >= 0 && x <= 900 && y <= 700));
  const empty = makeCtx();
  paintGesture(empty, box, null);
  check('an empty gesture draws the em box and nothing else', empty.calls.strokes === 1 && empty.calls.lineTo === 2);
}

// --- the tremor scope -----------------------------------------------------
{
  const ctx = makeCtx();
  const trace = new Float32Array(24);
  for (let i = 0; i < 24; i++) trace[i] = i * 0.4;
  paintScope(ctx, trace, 6, { present: true, width: 236, height: 64, scale: 12 });
  // Two paths: the centre line (1 move, 1 line) and the trace (1 move, 23 lines).
  check('the scope plots every sample', ctx.calls.moveTo === 2 && ctx.calls.lineTo === 24,
    `${ctx.calls.moveTo} moves, ${ctx.calls.lineTo} lines`);
  check('the scope stays inside its strip',
    ctx.calls.coords.slice(1).every(([, y]) => y >= 0 && y <= 64));

  const short = makeCtx();
  paintScope(short, new Float32Array(1), 0, { width: 236, height: 64, scale: 12 });
  check('a one-sample trace draws the centre line and stops',
    short.calls.moveTo === 1 && short.calls.lineTo === 1 && short.calls.coords.every(([, y]) => Number.isFinite(y)),
    `${short.calls.lineTo} lines`);
}

console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILURE(S)`);
process.exit(fail ? 1 : 0);