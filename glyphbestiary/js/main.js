// Wiring: the frame loop, the founder gesture, the hand, the UI.
import { founderFromGesture } from './archetype.js';
import { evaluate, nicheOf, nicheShare, NICHES, setPressure } from './fitness.js';
import { genomeFromSkeleton, randomGenome } from './genome.js';
import { Tremor } from './hand.js';
import { mutationFromHand } from './mutate.js';
import { Population } from './population.js';
import { cellBox, computeLayout, paint, paintGesture, paintScope } from './stage.js';
import { clamp, downloadCanvas, fmt, makeRng, timestamp } from './util.js';

const SIZE = 200;
const RES_MAX = 26;
const RES_MIN = 16;

const $ = (id) => document.getElementById(id);
const canvas = $('field');
const ctx = canvas.getContext('2d');
const scope = $('sc');
const sctx = scope.getContext('2d');

const settings = {
  legibility: 0.33,
  structure: 0.5,
  wild: 0.28,
  wildTarget: 0.55,
  baseRate: 0.3,
  baseMagnitude: 0.35,
  coupling: 0.8,
  tickMs: 320,
  immigrants: 0.1,
  linked: true,
};

const state = {
  running: true,
  drawMode: false,
  res: RES_MAX,
  founderLabel: '随机',
  paintAvg: 0,
  resLowStreak: 0,
  resHighStreak: 0,
  drawPts: null,
};

const rng = makeRng((Date.now() ^ 0x5f3759df) >>> 0);
const pop = new Population({ size: SIZE, rng, evaluate });

let layout = computeLayout(window.innerWidth, window.innerHeight, SIZE);

// ---------------------------------------------------------------- layout

function relayout() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  layout = computeLayout(w, h, SIZE);
  draw();
}

function draw() {
  const r = paint(ctx, pop.individuals, layout, { res: state.res });
  if (state.drawPts) paintGesture(ctx, cellBox(0, layout), state.drawPts);
  state.paintAvg = state.paintAvg ? state.paintAvg * 0.7 + r.ms * 0.3 : r.ms;
}

/**
 * Adaptive resolution. The 200-glyph repaint is the dominant cost in a tick, so
 * when it cannot keep up the glyphs get fewer samples per stroke rather than the
 * loop dropping generations - a coarser but continuous record beats a sharp one
 * that stutters.
 */
function adaptResolution() {
  if (state.paintAvg > 24) { state.resLowStreak++; state.resHighStreak = 0; } else if (state.paintAvg < 11) { state.resHighStreak++; state.resLowStreak = 0; } else { state.resLowStreak = 0; state.resHighStreak = 0; }
  if (state.resLowStreak >= 3 && state.res > RES_MIN) { state.res--; state.resLowStreak = 0; }
  if (state.resHighStreak >= 12 && state.res < RES_MAX) { state.res++; state.resHighStreak = 0; }
}

// ---------------------------------------------------------------- hud

let hudAt = 0;
function hud(hand, nowMs) {
  const m = pop.best().m;
  $('m-rate').textContent = fmt(hand.rate, 2);
  $('m-mag').textContent = fmt(hand.mag, 2);
  $('m-hand').textContent = hand.present ? `${hand.delegate} · ${Math.round(hand.fps)}fps` : '未接入';
  $('m-jit').textContent = hand.present ? `${fmt(hand.jitter, 2)} / ${fmt(hand.speed, 2)}` : '—';
  $('m-paint').textContent = `${fmt(state.paintAvg, 1)}ms · ${state.res}pt`;
  $('sc-state').textContent = hand.present ? fmt(hand.jitter, 2) : '未接入';
  $('v-cov').textContent = fmt(m.coverage, 2);
  $('v-coh').textContent = fmt(m.cohesion, 2);
  $('v-bal').textContent = fmt(m.balance, 2);
  $('v-rgh').textContent = fmt(m.roughness, 2);
  $('m-cov').style.width = `${clamp(m.coverage, 0, 1) * 100}%`;
  $('m-coh').style.width = `${clamp(m.cohesion, 0, 1) * 100}%`;
  $('m-bal').style.width = `${clamp(m.balance, 0, 1) * 100}%`;
  $('m-rgh').style.width = `${clamp(m.roughness / 2.5, 0, 1) * 100}%`;
  $('m-founder').textContent = state.founderLabel;

  // The rest re-reads the whole population (mean, census, a diversity sample), so
  // it runs at 8Hz rather than per frame.
  if (nowMs - hudAt < 125) return;
  hudAt = nowMs;
  const st = pop.stats(rng);
  $('m-gen').textContent = st.gen;
  $('m-size').textContent = st.size;
  $('m-mean').textContent = fmt(st.mean, 3);
  $('m-best').textContent = fmt(st.best.fitness, 3);
  $('m-div').textContent = fmt(st.diversity, 3);
  for (const n of NICHES) $('n-' + n.key).textContent = st.niches[n.key] || 0;
}

// ---------------------------------------------------------------- loop

const tremor = {
  present: false, speed: 0, energy: 0, jitter: 0, burst: 0,
  fps: 0, delegate: '—',
  trace: new Float32Array(24), traceAt: 0,
};

let tracker = null;
let lastTick = 0;

/** Mutation parameters for right now, and the same numbers the HUD shows. */
function currentMutation() {
  return mutationFromHand(tremor, {
    baseRate: settings.baseRate,
    baseMagnitude: settings.baseMagnitude,
    coupling: settings.linked ? settings.coupling : 0,
  });
}

function project(lm) {
  // Mirrored: the camera image is a mirror, and an unmirrored mapping makes the
  // artist's own hand move the wrong way relative to the cursor they are watching.
  return { x: (1 - lm.x) * window.innerWidth, y: lm.y * window.innerHeight };
}

function frame(nowMs) {
  if (tracker) {
    const s = tracker.update(nowMs, project);
    tremor.present = s.present;
    tremor.speed = s.speed;
    tremor.energy = s.energy;
    tremor.jitter = s.jitter;
    tremor.burst = s.burst;
    tremor.fps = s.fps;
    tremor.delegate = s.delegate;
    tremor.trace = tracker.trace;
    tremor.traceAt = tracker.traceAt;
    if (tracker.pendingFallback) tracker.applyFallback();
  }

  if (state.running && !state.drawMode && nowMs - lastTick >= settings.tickMs) {
    lastTick = nowMs;
    const mo = currentMutation();
    pop.step({
      rate: mo.rate,
      magnitude: mo.magnitude,
      immigrantRate: settings.immigrants,
      nicheShare: nicheShare(),
    });
    draw();
    adaptResolution();
  }
  const mo = currentMutation();
  hud({ ...tremor, rate: mo.rate, mag: mo.magnitude }, nowMs);
  // The scope's px-per-unit scale follows the window, so the trace means the same
  // thing on a laptop and on a 4K display.
  paintScope(sctx, tremor.trace, tremor.traceAt, {
    present: tremor.present,
    width: scope.width,
    height: scope.height,
    scale: 0.06 * Math.max(240, Math.min(window.innerWidth, window.innerHeight)),
  });
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- controls

function bindRange(id, label, key, format = (v) => v.toFixed(2)) {
  const el = $(id);
  const out = $(label);
  const apply = () => {
    settings[key] = parseFloat(el.value);
    out.textContent = format(settings[key]);
  };
  el.addEventListener('input', apply);
  apply();
}
bindRange('s-rate', 'l-rate', 'baseRate');
bindRange('s-mag', 'l-mag', 'baseMagnitude');
bindRange('s-coup', 'l-coup', 'coupling');
bindRange('s-imm', 'l-imm', 'immigrants', (v) => `${Math.round(v * 100)}%`);
bindRange('s-tick', 'l-tick', 'tickMs', (v) => `${Math.round(v)} ms`);

// The three selection weights, plus the wildness TARGET. The target is the control
// that matters: it says where the population should live, not just which way to
// lean, and the grid visibly changes species within about ten generations of
// dragging it.
function applyPressure() {
  const p = setPressure({
    legibility: settings.legibility,
    structure: settings.structure,
    wild: settings.wild,
    target: settings.wildTarget,
  });
  $('l-leg').textContent = fmt(p.legibility, 2);
  $('l-str').textContent = fmt(p.structure, 2);
  $('l-wild').textContent = fmt(p.wild, 2);
  $('l-target').textContent = `${nicheOf(settings.wildTarget).label} ${fmt(settings.wildTarget, 2)}`;
  // Re-score immediately: otherwise the HUD keeps reporting the old ranking and the
  // grid looks unchanged for a whole generation after the artist lets go of the
  // slider, which reads as the control being broken.
  pop.score();
  draw();
}
for (const [id, key] of [['s-leg', 'legibility'], ['s-str', 'structure'], ['s-wild', 'wild'], ['s-target', 'wildTarget']]) {
  const el = $(id);
  el.addEventListener('input', () => {
    settings[key] = parseFloat(el.value);
    applyPressure();
  });
}
applyPressure();

function setRunning(on) {
  state.running = on;
  $('btn-run').setAttribute('aria-pressed', String(on));
  $('btn-run').textContent = on ? '演化中' : '已暂停';
}

function setDrawMode(on) {
  state.drawMode = on;
  state.drawPts = null;
  $('btn-draw').setAttribute('aria-pressed', String(on));
  $('drawhint').classList.toggle('on', on);
  document.body.style.cursor = on ? 'crosshair' : '';
  draw();
}

function newFounder(fromGesture) {
  if (fromGesture) {
    const sk = founderFromGesture(state.drawPts);
    if (sk.strokes.length === 0) {
      $('drawhint').innerHTML = '这一笔太短了 · 再画一次 · <b>Esc</b> 取消';
      return false;
    }
    pop.setFounder(genomeFromSkeleton(sk, rng));
    state.founderLabel = `手绘 ${sk.strokes.length}笔`;
  } else {
    const g = randomGenome(rng);
    pop.setFounder(g);
    state.founderLabel = `随机 ${g.strokes.length}笔`;
  }
  draw();
  return true;
}

$('btn-run').addEventListener('click', () => setRunning(!state.running));
$('btn-draw').addEventListener('click', () => { if (!state.drawMode) setDrawMode(true); });
$('btn-new').addEventListener('click', () => newFounder(false));
$('btn-reset').addEventListener('click', () => { pop.reset(); draw(); });
$('btn-link').addEventListener('click', () => {
  settings.linked = !settings.linked;
  $('btn-link').setAttribute('aria-pressed', String(settings.linked));
});
$('btn-save').addEventListener('click', () => downloadCanvas(canvas, `glyphbestiary-${timestamp()}.png`));
$('btn-bare').addEventListener('click', () => {
  const bare = document.body.classList.toggle('bare');
  $('btn-bare').setAttribute('aria-pressed', String(bare));
});

async function disposeTracker() {
  tracker?.dispose();
  tracker = null;
  tremor.present = false;
  $('btn-hand').setAttribute('aria-pressed', 'false');
  $('scope').classList.add('hidden');
}

async function startTracker() {
  if (!tracker) {
    const t = new Tremor();
    await t.init();
    await t.openCamera($('camera'));
    tracker = t;
  }
  $('btn-hand').setAttribute('aria-pressed', 'true');
  $('scope').classList.remove('hidden');
  tracker.warmUp();
  return tracker;
}

$('btn-hand').addEventListener('click', () => {
  if (tracker) { disposeTracker(); return; }
  startTracker().catch((err) => {
    // The start screen is gone by now, so this has to be visible where the artist
    // is already looking.
    $('m-hand').textContent = '摄像头失败';
    $('sc-state').textContent = String(err?.message || err).slice(0, 40);
  });
});

// Founder gesture. Em-box coordinates, not pixels: the genome lives in [0,1] and
// the cell size is a rendering decision, so drawing in pixels would make the
// founder depend on the window.
const toEm = (e) => {
  const b = cellBox(0, layout);
  return [e.offsetX / b.s, e.offsetY / b.s];
};

canvas.addEventListener('pointerdown', (e) => {
  if (!state.drawMode) return;
  canvas.setPointerCapture(e.pointerId);
  state.drawPts = [toEm(e)];
});
canvas.addEventListener('pointermove', (e) => {
  if (!state.drawMode || !state.drawPts) return;
  const p = toEm(e);
  const last = state.drawPts[state.drawPts.length - 1];
  if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.008) return;
  state.drawPts.push(p);
  draw();
});
canvas.addEventListener('pointerup', () => {
  if (!state.drawMode || !state.drawPts) return;
  if (newFounder(true)) setDrawMode(false);
});

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space') { e.preventDefault(); setRunning(!state.running); }
  else if (k === 'd') setDrawMode(!state.drawMode);
  else if (k === 'f') newFounder(false);
  else if (k === 'r') { pop.reset(); draw(); }
  else if (k === 'c') $('btn-hand').click();
  else if (k === 's') $('btn-save').click();
  else if (k === 'h') $('btn-bare').click();
  else if (k === 'escape') setDrawMode(false);
});

window.addEventListener('resize', relayout);

// ---------------------------------------------------------------- boot

relayout();
requestAnimationFrame(frame);

$('gate-cam').addEventListener('click', async () => {
  $('gate-cam').disabled = true;
  $('gate-cam').textContent = '正在加载手部模型…';
  try {
    await startTracker();
    $('gate').classList.add('gone');
  } catch (err) {
    $('gate-err').textContent = `摄像头/模型不可用：${String(err?.message || err)}\n可以先用「不用摄像头」开始。`;
    $('gate-cam').disabled = false;
    $('gate-cam').textContent = '重试开摄像头';
  }
});
$('gate-plain').addEventListener('click', () => $('gate').classList.add('gone'));