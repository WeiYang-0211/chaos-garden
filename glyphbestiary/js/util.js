export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);

// Deterministic PRNG. A genome must regenerate identically from its seed, or a
// lineage stored for the clade tree in step 3 could not be re-rendered, and the
// whole "this species came from that one" claim would rest on a drawing nobody
// can reproduce.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const r = mulberry32(seed);
  const range = (a, b) => a + r() * (b - a);
  return {
    next: r,
    range,
    int: (n) => Math.floor(r() * n),
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    chance: (p) => r() < p,
    // Symmetric jitter, used everywhere a gene or a joint needs to feel hand-made.
    jitter: (amp) => (r() * 2 - 1) * amp,
    // Approximately gaussian: the sum of three uniforms stays inside +/-1 and is
    // dense in the middle, which is what a mutation wants. A true gaussian would
    // need Box-Muller and produce rare huge jumps that wreck a skeleton.
    wobble: () => ((r() + r() + r()) / 1.5 - 1),
  };
}

export function fmt(n, digits = 1) {
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

// Frame-rate independent exponential approach. `rate` = how much of the gap is
// closed per second (0.9 -> fast, 0.15 -> lazy).
export function approach(current, target, rate, dt) {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

export function downloadCanvas(canvas, name) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, 'image/png');
}

export function timestamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}