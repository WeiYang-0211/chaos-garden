// The hand signals, driven by synthetic fingertips at 30fps - roughly what
// MediaPipe delivers.
//
// The claim under test is the one the whole interaction rests on: a hand moving
// fast and a hand shaking are DIFFERENT inputs. Measuring raw displacement gets
// that wrong, and so does measuring position against a plain slow average - a
// 240px/s sweep trails that average by 77px and comes out as maximum tremor. The
// prediction has to cancel the lag exactly or speed leaks back in as shake.
//
// The numbers below are measured behaviour of js/signal.js, not aspirations:
// smooth motion of any speed reads 0.000 jitter, a 4px 5Hz tremor reads about
// 0.3, and sensor-level +/-2px noise stays under 0.1.
import { TremorSignal } from '../js/signal.js';
import { mutationFromHand } from '../js/mutate.js';

let fail = 0;
const check = (name, ok, detail = '') => {
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ->  ' + detail : ''}`);
};

const DT = 1 / 30;
const sig = (opts) => new TremorSignal({ scale: 12, ...opts });
const hold = (n, x = 500, y = 400) => Array.from({ length: n }, () => ({ x, y }));
const ramp = (n, pxPerFrame, x0 = 200, y = 400) => Array.from({ length: n }, (_, i) => ({ x: x0 + i * pxPerFrame, y }));
const tremor = (n, amp, hz) => Array.from({ length: n }, (_, i) => ({
  x: 500 + amp * Math.sin(2 * Math.PI * hz * i * DT),
  y: 400,
}));
/** Deterministic hash noise, so the sensor-noise case is reproducible. */
const noise = (n, amp) => Array.from({ length: n }, (_, i) => ({
  x: 500 + amp * (Math.sin(i * 12.9898) * 43758.5453 % 1),
  y: 400 + amp * (Math.sin(i * 78.233) * 43758.5453 % 1),
}));

function feed(s, frames) {
  let last = null;
  for (const f of frames) last = s.push({ dt: DT, ...f });
  return last;
}
const jitterOf = (s) => {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < s.trace.length; i++) {
    const v = s.trace[(s.traceAt + i) % s.trace.length];
    if (v > 0) { sum += v; n++; }
  }
  return (n ? sum / n : 0) / s.scale;
};

// --- a still hand ---------------------------------------------------------
{
  const s = sig();
  feed(s, hold(90));
  check('a hand that never moves is not shaky', jitterOf(s) < 0.01, `jitter ${jitterOf(s).toFixed(4)}`);
  check('a hand that never moves is not fast', s.energy === 0 && s.speed === 0);
  check('a still hand mutates nothing', (() => {
    const m = mutationFromHand(s.snapshot(), { baseRate: 0.3, baseMagnitude: 0.35 });
    return Math.abs(m.rate - 0.3) < 1e-9 && Math.abs(m.magnitude - 0.35) < 1e-9;
  })());
}

// --- a fast hand is NOT a shaky hand -------------------------------------
{
  const slow = sig();
  feed(slow, ramp(150, 8));      // 240px/s
  const quick = sig();
  feed(quick, ramp(150, 30));    // 900px/s
  const drift = sig();
  feed(drift, ramp(150, 1.33));  // 40px/s

  check('a 240px/s sweep registers as fast', slow.energy > 0.15, `energy ${slow.energy.toFixed(2)}, ${slow.speed.toFixed(0)}px/s`);
  check('a 900px/s sweep pins the energy scale', quick.energy > 0.7, `energy ${quick.energy.toFixed(2)}`);
  check('a 40px/s drift registers as barely moving', drift.energy > 0.02 && drift.energy < 0.1,
    `energy ${drift.energy.toFixed(3)}`);

  // The load-bearing assertion: at any speed, a straight line is calm.
  check('a straight sweep is calm at 240px/s', jitterOf(slow) < 0.02, `jitter ${jitterOf(slow).toFixed(4)}`);
  check('a straight sweep is calm at 900px/s', jitterOf(quick) < 0.02, `jitter ${jitterOf(quick).toFixed(4)}`);
  check('a slow drift is calm', jitterOf(drift) < 0.02, `jitter ${jitterOf(drift).toFixed(4)}`);
}

// --- a shaking hand ------------------------------------------------------
{
  const mild = sig();
  feed(mild, tremor(180, 4, 5));   // 4px at 5Hz: a steady human hand
  const heavy = sig();
  feed(heavy, tremor(180, 8, 3));  // 8px at 3Hz: someone concentrating
  const noiseOnly = sig();
  feed(noiseOnly, noise(180, 2));  // sensor-level wobble

  check('a 4px 5Hz tremor reads as tremor', jitterOf(mild) > 0.2, `jitter ${jitterOf(mild).toFixed(3)}`);
  check('a bigger, slower tremor reads as more tremor',
    jitterOf(heavy) > jitterOf(mild), `${jitterOf(mild).toFixed(3)} -> ${jitterOf(heavy).toFixed(3)}`);
    check('a shaking hand in one spot is not "fast"', mild.energy < 0.2,
    `energy ${mild.energy.toFixed(3)} at ${mild.speed.toFixed(0)}px/s`);
  check('tremor moves the magnitude hard and the rate barely',
    (() => {
      const m = mutationFromHand(mild.snapshot(), { baseRate: 0.3, baseMagnitude: 0.35 });
      return m.magnitude > 0.35 * 1.5 && m.rate < 0.3 * 1.1;
    })(), `rate ${mutationFromHand(mild.snapshot()).rate.toFixed(2)}, mag ${mutationFromHand(mild.snapshot()).magnitude.toFixed(2)}`);
  check('and sensor noise sits at a floor well below real tremor',
    jitterOf(noiseOnly) < jitterOf(mild) * 0.75, `${jitterOf(noiseOnly).toFixed(2)} vs ${jitterOf(mild).toFixed(2)}`);
}

// --- moving AND shaking: both signals fire -------------------------------
{
  const s = sig();
  const frames = Array.from({ length: 180 }, (_, i) => ({
    x: 300 + i * 6 + (i % 2 ? 4 : -4),
    y: 400 + (i % 3 ? -3 : 3),
  }));
  feed(s, frames);
  check('a hand that moves and shakes reports both', s.energy > 0.1 && jitterOf(s) > 0.1,
    `energy ${s.energy.toFixed(2)}, jitter ${jitterOf(s).toFixed(2)}`);
  check('and both reach the mutation', (() => {
    const m = mutationFromHand(s.snapshot(), { baseRate: 0.3, baseMagnitude: 0.35 });
    return m.rate > 0.3 && m.magnitude > 0.35;
  })());
}

// --- hesitation -----------------------------------------------------------
{
  const s = sig();
  const endX = 200 + 59 * 20;
  const frames = [...ramp(60, 20), ...hold(40, endX)];
  let peakBurst = 0;
  let at = -1;
  frames.forEach((f, i) => {
    const snap = s.push({ ...f, dt: DT });
    if (snap.burst > peakBurst) { peakBurst = snap.burst; at = i; }
  });
  check('a hand in motion has no burst', (() => {
    const t = sig();
    for (const f of ramp(60, 20)) t.push({ ...f, dt: DT });
    return t.burst === 0;
  })());
  check('stopping dead raises a burst', peakBurst > 0.5, `burst ${peakBurst.toFixed(3)} at frame ${at}`);
  check('the burst lands on the stop, not on the sweep', at >= 60 && at < 66, `frame ${at}`);
  const after = feed(s, hold(60, endX));
  check('and it decays within a second or so', after.burst < peakBurst * 0.05,
    `${peakBurst.toFixed(3)} -> ${after.burst.toFixed(3)}`);
}

// --- losing the hand ------------------------------------------------------
{
  const s = sig();
  feed(s, hold(30));
  const gone = s.push({ x: 0, y: 0, present: false, dt: DT });
  check('curling the finger reads as no hand', gone.present === false);
  check('and the signals go quiet rather than freezing',
    gone.jitter === 0 && gone.energy === 0 && gone.speed === 0);
  const back = s.push({ x: 900, y: 900, present: true, dt: DT });
  check('coming back does not fake a huge speed from the gap', back.speed < 400,
    `speed ${back.speed.toFixed(0)}px/s`);
  check('and does not fake a huge shake either', jitterOf(s) < 0.2, `jitter ${jitterOf(s).toFixed(3)}`);

  s.reset();
  check('reset clears everything', s.present === false && s.jitter === 0 && s.burst === 0 && s.speed === 0);
  check('reset clears the trace', [...s.trace].every((v) => v === 0));
}

// --- the trace the scope draws -------------------------------------------
{
  const s = sig();
  feed(s, tremor(60, 4, 5));
  const snap = s.snapshot();
  check('the trace is a fixed-length ring buffer', snap.trace.length === 24 && snap.trace instanceof Float32Array);
  check('the ring buffer only ever holds positive residuals', [...snap.trace].every((v) => v >= 0));
  check('a shaking hand leaves visible residuals in the trace',
    [...snap.trace].some((v) => v > 0.5), `max ${Math.max(...snap.trace).toFixed(2)}px`);
  check('traceAt wraps instead of running off the end', (() => {
    const t = sig();
    for (let i = 0; i < 100; i++) t.push({ x: 500, y: 400, dt: DT });
    return t.traceAt >= 0 && t.traceAt < t.trace.length;
  })());
}

// --- scale follows the canvas --------------------------------------------
{
  const small = sig({ scale: 6 });
  const big = sig({ scale: 24 });
  feed(small, tremor(120, 4, 5));
  feed(big, tremor(120, 4, 5));
  check('the same physical shake scores lower on a bigger canvas',
    jitterOf(small) > jitterOf(big) * 2, `${jitterOf(small).toFixed(2)} vs ${jitterOf(big).toFixed(2)}`);
  check('both stay inside 0..1', jitterOf(small) <= 1 && jitterOf(big) >= 0);
}

console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILURE(S)`);
process.exit(fail ? 1 : 0);