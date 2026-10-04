// Does the ink geometry behave? These are the properties the renderer and the
// fitness rasterizer both depend on: centripetal splines must not loop when two
// knots are nearly coincident (which evolution produces constantly), resampling
// must be even, and the outline must not self-intersect at a tight corner.
import { outline, pathLength, resample, resampleSpline, totalTurn, tremorNoise, unitTangents, widthProfile } from '../js/curve.js';

let fail = 0;
const check = (name, ok, detail = '') => {
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ->  ' + detail : ''}`);
};

// --- resample --------------------------------------------------------------
{
  const line = [];
  for (let i = 0; i <= 100; i++) line.push([i / 100, 0.5]);
  const out = resample(line, 11);
  const gaps = out.slice(1).map((p, i) => Math.hypot(p[0] - out[i][0], p[1] - out[i][1]));
  const min = Math.min(...gaps);
  const max = Math.max(...gaps);
  check('resample: 100-unit line -> 11 evenly spaced points', max - min < 1e-6,
    `gaps ${min.toFixed(4)}..${max.toFixed(4)}`);
  check('resample: endpoints land on the endpoints',
    Math.abs(out[0][0] - 0) < 1e-9 && Math.abs(out[10][0] - 1) < 1e-9);

  check('resample: a degenerate polyline does not divide by zero',
    resample([[0.5, 0.5], [0.5, 0.5]], 6).every((p) => p[0] === 0.5 && p[1] === 0.5));
  check('resample: single point survives', resample([[0.2, 0.3]], 5).length === 5);
}

// --- centripetal Catmull-Rom ----------------------------------------------
// The failure mode being guarded: two adjacent control points at nearly the same
// place. A uniform-parameterisation spline puts a cusp or a loop there, and a
// loop in a stroke renders as a visible knot in the middle of a character.
{
  const degenerate = [[0.2, 0.2], [0.2005, 0.2002], [0.2, 0.2], [0.8, 0.8]];
  const pts = resampleSpline(degenerate, 40);
  let maxStep = 0;
  for (let i = 1; i < pts.length; i++) {
    maxStep = Math.max(maxStep, Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = pathLength(pts);
  check('coincident knots: no zero-length stall in the walk', maxStep > 1e-4,
    `max step ${maxStep.toExponential(2)}`);
  check('coincident knots: the stroke still spans the points', total > 0.5,
    `length ${total.toFixed(3)}`);

  const straight = resampleSpline([[0.1, 0.5], [0.4, 0.5], [0.7, 0.5], [1.0, 0.5]], 20);
  let drift = 0;
  for (const p of straight) drift = Math.max(drift, Math.abs(p[1] - 0.5));
  check('collinear knots: the spline stays collinear', drift < 1e-9, `drift ${drift.toExponential(2)}`);

  const single = resampleSpline([[0.3, 0.4]], 5);
  check('single-point skeleton does not throw', single.length === 5 && single[0][0] === 0.3);
}

// --- width profile --------------------------------------------------------
{
  const blunt = { weight: 0.05, contrast: 0.8, ends: [0, 0] };
  const tapered = { weight: 0.05, contrast: 0.8, ends: [1, 1] };
  check('width: blunt ends are thick', widthProfile(0.001, blunt) > blunt.weight * 0.8,
    `${widthProfile(0.001, blunt).toFixed(4)} vs weight ${blunt.weight}`);
  check('width: tapered ends are thin', widthProfile(0.001, tapered) < blunt.weight * 0.25,
    `${widthProfile(0.001, tapered).toFixed(4)}`);
  check('width: the middle is fatter than the ends when contrast is high',
    widthProfile(0.5, tapered) > widthProfile(0.05, tapered) * 1.2);
  check('width: contrast 0 gives a near-flat stroke',
    Math.abs(widthProfile(0.5, { weight: 0.05, contrast: 0, ends: [0, 0] }) / 0.05 - 1) < 0.2);
  check('width: never returns exactly zero (an inverted outline would self-intersect)',
    widthProfile(0, tapered) > 0 && widthProfile(1, tapered) > 0);
  let monotone = true;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    if (widthProfile(Math.min(1, t), blunt) <= 0) monotone = false;
  }
  check('width: positive across the whole stroke', monotone);
}

// --- outline --------------------------------------------------------------
{
  const center = resampleSpline([[0.2, 0.5], [0.35, 0.2], [0.5, 0.5], [0.65, 0.8], [0.8, 0.5]], 30);
  const half = center.map((_, i) => widthProfile(i / (center.length - 1), { weight: 0.05, contrast: 0.8, ends: [0.4, 0.7] }));
  const poly = outline(center, half);
  check('outline: closes back on itself', poly.length === center.length * 2, `${poly.length} points`);

  const tan = unitTangents(center);
  check('tangents: all unit length', tan.every(([x, y]) => Math.abs(Math.hypot(x, y) - 1) < 1e-9));

  // Signed area of the polygon, doubled. A self-intersecting outline has a near
  // zero or negative area even though the stroke looks solid on screen.
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const magnitude = Math.abs(area) / 2;
  const ribbon = center.reduce((s, p, i) => s + (i ? Math.hypot(p[0] - center[i - 1][0], p[1] - center[i - 1][1]) : 0), 0) * 0.09;
  check('outline: encloses about the ribbon area', magnitude > ribbon * 0.5 && magnitude < ribbon * 2,
    `area ${magnitude.toFixed(4)}, ribbon ${ribbon.toFixed(4)}`);
}

// --- turn -----------------------------------------------------------------
{
  const straight = resampleSpline([[0.1, 0.5], [0.9, 0.5]], 30);
  const zigzag = [];
  for (let i = 0; i <= 10; i++) zigzag.push([0.1 + i * 0.08, i % 2 ? 0.2 : 0.8]);
  check('turn: a straight line has none', totalTurn(straight) < 1e-6, `${totalTurn(straight).toExponential(2)}`);
  check('turn: a zigzag has a lot', totalTurn(zigzag) > 5, `${totalTurn(zigzag).toFixed(2)} rad`);
  check('turn: a degenerate point set is zero, not NaN', totalTurn([[0.5, 0.5]]) === 0);
}

// --- tremor noise ---------------------------------------------------------
{
  const n1 = tremorNoise(4242);
  const n2 = tremorNoise(4242);
  const n3 = tremorNoise(99);
  let maxDiff = 0;
  for (let t = 0; t <= 1; t += 0.01) maxDiff = Math.max(maxDiff, Math.abs(n1(t) - n2(t)));
  check('tremor: same seed gives the same curve', maxDiff === 0, `max diff ${maxDiff.toExponential(2)}`);

  let sep = 0;
  for (let t = 0; t <= 1; t += 0.01) sep += Math.abs(n1(t) - n3(t));
  check('tremor: different seeds differ', sep > 1);

  let jump = 0;
  let prev = n1(0);
  for (let t = 0.01; t <= 1; t += 0.01) {
    jump = Math.max(jump, Math.abs(n1(t) - prev));
    prev = n1(t);
  }
  check('tremor: continuous - no lattice seam', jump < 0.35, `largest step ${jump.toFixed(3)}`);
  check('tremor: stays inside +/-1', [-0.5, 0, 0.25, 0.5, 1].every((t) => Math.abs(n1(t)) <= 1));
  check('tremor: finite outside its domain', Number.isFinite(n1(-4)) && Number.isFinite(n1(9)));
}

console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILURE(S)`);
process.exit(fail ? 1 : 0);