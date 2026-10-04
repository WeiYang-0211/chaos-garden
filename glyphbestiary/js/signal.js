// The three hand signals, with no camera in sight.
//
// Separated from hand.js on purpose. The capture layer is MediaPipe plumbing that
// can only be tested in a browser; the arithmetic that turns a fingertip into
// "how fast", "how shaky" and "did you just hesitate" is the artistic core of the
// piece, and it is worth being able to throw a synthetic hand at it.
//
// The units are pixels per SECOND throughout. An earlier version mixed seconds and
// milliseconds, which meant every ordinary movement scored as a hard sprint: a
// 240px/s sweep came out at "240" against a ceiling of 1.4, so energy and burst
// were pinned at their maximum and the mutation rate stopped responding.
//
// Two derivations carry the weight here:
//
//  jitter - position minus PREDICTED position, not position minus smoothed
//           position. A plain slow average lags a moving hand by rate*tau, which
//           reads as tremor: measured, a 240px/s sweep scored jitter 1.0 (maximum
//           shake) purely because the average trailed it by 77px. Extrapolating
//           the average by its own smoothed velocity cancels that exactly, so a
//           straight sweep reads as calm and a hand that wobbles in place still
//           reads as shaky.
//
//  burst  - a decaying envelope of recent speed versus the current speed. Holding
//           a running peak instead meant the peak decayed at the same rate as the
//           signal, so "current speed below a quarter of the peak" was never true
//           and hesitation never registered at all.
import { approach, clamp } from './util.js';

const POS_TAU = 0.32;    // s. The prediction horizon; also how fast intent is followed.
const VEL_TAU = 0.12;   // s. Short enough that a 3-5Hz tremor survives it, long enough to cancel noise.
const SPEED_FULL = 1200; // px/s that counts as a hard flick across a large canvas.
const PEAK_DECAY = 2.5;  // per second. The envelope must outlive the collapse.
const BURST_ON = 250;    // px/s before a stop can count as a hesitation at all.
const BURST_OFF = 0.25;  // fraction of the recent peak that counts as "stopped".

export class TremorSignal {
  /**
   * `scale` is the residual in pixels that counts as maximum tremor. It depends on
   * the canvas, not on the camera, so the caller supplies it (0.012 of the short
   * screen edge is a good default) rather than this class guessing.
   */
  constructor({ posTau = POS_TAU, velTau = VEL_TAU, speedFull = SPEED_FULL, history = 24, scale = 12 } = {}) {
    this.posTau = posTau;
    this.velTau = velTau;
    this.speedFull = speedFull;
    this.scale = Math.max(1, scale);
    this.trace = new Float32Array(history);
    this.traceAt = 0;
    this.reset();
  }

  reset() {
    this.present = false;
    this.x = 0;
    this.y = 0;
    this.speed = 0;
    this.energy = 0;
    this.jitter = 0;
    this.burst = 0;
    this.emaX = null;
    this.emaY = null;
    this.velX = 0;
    this.velY = 0;
    this.instSpeed = 0;
    this.peak = 0;
    this.trace.fill(0);
    this.traceAt = 0;
    return this;
  }

  /**
   * Feed one detection. `dt` in seconds; `present` false means "finger not out",
   * which is treated as no hand at all rather than as a stationary one - otherwise
   * curling your finger to rest would look like the steadiest hand possible, and
   * the average would still be trailing the last position it saw.
   */
  push({ x, y, present = true, dt = 0 }) {
    const step = dt > 0 ? Math.min(0.25, dt) : 0;
    this.burst = approach(this.burst, 0, 6, step);
    if (!present) {
      this.present = false;
      this.emaX = null;
      this.emaY = null;
      this.velX = 0;
      this.velY = 0;
      this.instSpeed = 0;
      this.peak = 0;
      this.speed = 0;
      this.energy = 0;
      this.jitter = 0;
      return this.snapshot();
    }

    if (this.present && step > 0) {
      const vx = (x - this.x) / step;
      const vy = (y - this.y) / step;
      this.velX = approach(this.velX, vx, 1 / this.velTau, step);
      this.velY = approach(this.velY, vy, 1 / this.velTau, step);
      // Burst detection reads the raw frame-to-frame speed, not the smoothed one.
      // The smoothed velocity collapses over about a third of a second, so by the
      // time it noticed the hand had stopped it had already dragged the peak down
      // with it and the quarter-of-peak test could never be true.
      this.instSpeed = Math.hypot(vx, vy);
    } else {
      this.instSpeed = 0;
    }
    this.present = true;
    this.x = x;
    this.y = y;

    if (this.emaX === null) {
      this.emaX = x;
      this.emaY = y;
    } else if (step > 0) {
      this.emaX = approach(this.emaX, x, 1 / this.posTau, step);
      this.emaY = approach(this.emaY, y, 1 / this.posTau, step);
    }

    // Residual against the one-step-ahead prediction.
    //
    // The horizon is the DISCRETE lag of the exponential average, not `posTau`.
    // A first-order lag tracks a ramp late by exactly step*(1-f)/f, which is 5%
    // less than posTau at 30fps - and 5% of 240px/s is a residual of 4px, which
    // is a third of the full jitter scale. The sweep has to cancel completely or
    // speed leaks straight back in as tremor.
    const f = step > 0 ? 1 - Math.exp(-step / this.posTau) : 1;
    const horizon = step > 0 ? (step * (1 - f)) / f : 0;
    const px = (this.emaX ?? x) + this.velX * horizon;
    const py = (this.emaY ?? y) + this.velY * horizon;
    const residual = Math.hypot(x - px, y - py);

    this.speed = Math.hypot(this.velX, this.velY);
    this.peak = Math.max(this.instSpeed, approach(this.peak, 0, PEAK_DECAY, step));
    if (this.peak > BURST_ON && this.instSpeed < this.peak * BURST_OFF) {
      this.burst = Math.min(1, this.burst + (this.peak / this.speedFull) * 0.8);
    }

    this.trace[this.traceAt] = residual;
    this.traceAt = (this.traceAt + 1) % this.trace.length;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < this.trace.length; i++) {
      if (this.trace[i] > 0) { sum += this.trace[i]; n++; }
    }
    this.jitter = clamp((n ? sum / n : 0) / this.scale, 0, 1);
    this.energy = clamp(this.speed / this.speedFull, 0, 1);
    return this.snapshot();
  }

  snapshot() {
    return {
      present: this.present,
      x: this.x,
      y: this.y,
      speed: this.speed,
      energy: this.energy,
      jitter: this.jitter,
      burst: this.burst,
      trace: this.trace,
      traceAt: this.traceAt,
    };
  }
}