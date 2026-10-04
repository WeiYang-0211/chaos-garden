// The hand as the mutation source.
//
// This is the hook the whole piece hangs on. Three signals, all derived from the
// index fingertip, mapped onto mutation by mutate.js:
//
//   speed    how fast you are moving   -> mutation RATE. Still hand, quiet genes.
//   jitter   how much you are shaking   -> mutation MAGNITUDE. A shaky hand
//                                        makes big clumsy jumps.
//   burst    stopping after moving     -> a single loud mutation, the way a
//                                        moment of hesitation throws the pen.
//
// This module is only capture and inference. The arithmetic that turns a
// fingertip into those three numbers is in signal.js, which imports nothing and is
// therefore testable without a camera - see test/signal.test.mjs, because the
// claim that a fast hand is not a shaky hand is the one worth testing.
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { LM, isPointing } from './pose.js';
import { TremorSignal } from './signal.js';

const WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const FAIL_THRESHOLD = 12;
// Residual in px that counts as maximum tremor. Depends on the canvas rather than
// the camera, and is refreshed from the window on construction and on resize.
const SCALE_OF = () => 0.012 * Math.max(240, Math.min(window.innerWidth, window.innerHeight));

export class Tremor {
  constructor() {
    this.landmarker = null;
    this.video = null;
    this.stream = null;
    this.fileset = null;
    this.delegate = null;
    this.gpuError = null;
    this.lastVideoTime = -1;
    this.detecting = false;
    this.inferenceMs = 0;
    this.fps = 0;
    this.failStreak = 0;
    this.lastError = null;
    this.pendingFallback = false;
    this.sizeNote = null;

    this.#signal = new TremorSignal({ scale: SCALE_OF() });
    this.#lastMs = 0;
  }

  #signal;
  #lastMs = 0;

  /** Call after a resize: the same physical tremor is fewer pixels on a bigger canvas. */
  rescale() {
    this.#signal.scale = Math.max(1, SCALE_OF());
  }

  async init() {
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    this.fileset = fileset;
    const confidence = 0.3;
    const build = (delegate) => HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: confidence,
      minHandPresenceConfidence: confidence,
      minTrackingConfidence: confidence,
    });
    try {
      this.landmarker = await build('GPU');
      this.delegate = 'GPU';
    } catch (err) {
      this.gpuError = String(err?.message || err);
      this.landmarker = await build('CPU');
      this.delegate = 'CPU';
    }
    return this;
  }

  /** Pay the shader-compilation cost while the user is still on the start screen. */
  warmUp() {
    const v = this.video;
    if (!v || !this.landmarker || v.readyState < 2 || v.videoWidth < 16) return false;
    this.lastVideoTime = v.currentTime;
    this.landmarker.detectForVideo(v, performance.now());
    return true;
  }

  async openCamera(videoEl, { width = 1280, height = 720 } = {}) {
    this.video = videoEl;
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: width }, height: { ideal: height }, facingMode: 'user' },
      audio: false,
    });
    videoEl.srcObject = this.stream;
    await videoEl.play();
    if (videoEl.videoWidth < 16) {
      // Some drivers report 1x1 placeholders for the first frames. Bounded wait:
      // an unbounded one leaves the loading screen up forever with no error.
      this.sizeNote = '摄像头未上报有效分辨率';
    }
    return { width: videoEl.videoWidth, height: videoEl.videoHeight };
  }

  #fail(err) {
    const msg = String(err?.message || err);
    this.failStreak++;
    this.lastError = msg;
    this.detecting = false;
    if (this.failStreak === FAIL_THRESHOLD && this.delegate === 'GPU') this.pendingFallback = true;
  }

  async applyFallback() {
    if (!this.pendingFallback) return false;
    this.pendingFallback = false;
    try {
      this.landmarker?.close?.();
      this.landmarker = await HandLandmarker.createFromOptions(this.fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numHands: 1,
      });
      this.delegate = 'CPU';
      this.lastError = 'GPU 推理连续失败，已回退 CPU';
      return true;
    } catch (err) {
      this.lastError = `回退 CPU 失败：${String(err?.message || err).slice(0, 60)}`;
      return false;
    }
  }

  /**
   * Detect and update the three signals. `project` maps normalized landmarks to
   * canvas pixels; it is passed in because the tremor scale depends on the canvas,
   * not on the camera. The signal arithmetic itself lives in signal.js so it can be
   * tested without a camera.
   */
  update(nowMs, project) {
    const v = this.video;
    const dt = this.#lastMs ? Math.min(0.25, (nowMs - this.#lastMs) / 1000) : 0;
    this.#lastMs = nowMs;
    if (!v || !this.landmarker || v.readyState < 2 || v.videoWidth < 16) {
      this.#signal.push({ x: 0, y: 0, present: false, dt });
      return this.sample();
    }
    if (v.currentTime === this.lastVideoTime) return this.sample();
    this.lastVideoTime = v.currentTime;
    this.detecting = true;
    if (dt > 0) this.fps = this.fps ? this.fps * 0.9 + (1 / dt) * 0.1 : 1 / dt;

    const t0 = performance.now();
    let res;
    try {
      res = this.landmarker.detectForVideo(v, nowMs);
      this.failStreak = 0;
      this.lastError = null;
    } catch (err) {
      this.inferenceMs = performance.now() - t0;
      this.#fail(err);
      return this.sample();
    }
    this.inferenceMs = performance.now() - t0;

    const lm = res?.landmarks?.[0];
    if (!lm || lm.length < 21 || !isPointing(lm)) {
      // Finger curled: the hand is not pointing, so it is not authoring anything.
      this.#signal.push({ x: 0, y: 0, present: false, dt });
      return this.sample();
    }

    const p = project(lm[LM.INDEX_TIP]);
    this.#signal.push({ x: p.x, y: p.y, present: true, dt });
    return this.sample();
  }

  sample() {
    const s = this.#signal.snapshot();
    return {
      present: s.present,
      x: s.x,
      y: s.y,
      speed: s.speed,
      energy: s.energy,
      jitter: s.jitter,
      burst: s.burst,
      trace: s.trace,
      traceAt: s.traceAt,
      fps: this.fps,
      ms: this.inferenceMs,
      delegate: this.delegate,
      error: this.lastError,
    };
  }

  dispose() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.landmarker?.close?.();
    this.landmarker = null;
    this.#signal.reset();
  }
}