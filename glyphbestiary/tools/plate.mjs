// Contact sheet renderer: draw glyphs to a PNG so the ink can be looked at. Not
// part of the app - this is the instrument used to tune the drawing.
//
//   node tools/plate.mjs out.png [count] [generations] [seed]
//
// With generations = 0 it lays out a plain sheet of founders. With generations > 0
// it samples that many generations evenly and puts them side by side, left to
// right, so a column can be read as one descent: what selection did to a glyph over
// forty generations. That comparison is the point - if the plates get WORSE down
// the generations, the fitness is measuring the wrong thing, and no amount of
// tuning the ink will hide that.
import { evaluate, nicheShare, NICHES, setPressure } from '../js/fitness.js';
import { genomeFromSkeleton, randomGenome } from '../js/genome.js';
import { glyphPaths } from '../js/glyph.js';
import { Population } from '../js/population.js';
import { founderSkeleton } from '../js/archetype.js';
import { makeRng } from '../js/util.js';
import { Sheet, hexToRgb } from './png.js';
import { writeFileSync } from 'node:fs';

const [, , outPath = 'plate.png', countArg = '36', gensArg = '0', seedArg = '2026', targetArg = ''] = process.argv;
const COUNT = Math.max(1, parseInt(countArg, 10));
const GENS = Math.max(0, parseInt(gensArg, 10));
const SEED = parseInt(seedArg, 10);
const SAMPLES = 6;          // generations shown side by side
const INK = '#e8eef7';

if (targetArg !== '') setPressure({ target: parseFloat(targetArg) });
const share = nicheShare();

const rng = makeRng(SEED);
const pop = new Population({ size: COUNT, rng, evaluate });

/** Generations to show: the founders, then GENS/SAMPLES intervals. */
const stops = [0];
if (GENS > 0) {
  for (let i = 1; i < SAMPLES; i++) stops.push(Math.round((i * GENS) / (SAMPLES - 1)));
}

const panels = [pop.individuals.slice()];
for (let g = 1; g <= GENS; g++) {
  pop.step({ nicheShare: share });
  if (stops.includes(g)) panels.push(pop.individuals.slice());
}
if (GENS === 0) panels.length = 1;

// A plain sheet is a square grid; a descent is generations across, glyphs down.
const CELL = GENS > 0 ? 104 : 96;
const PAD = 10;
const gridCols = GENS > 0 ? panels.length : Math.ceil(Math.sqrt(COUNT));
const gridRows = GENS > 0 ? COUNT : Math.ceil(COUNT / gridCols);
const W = (GENS > 0 ? panels.length : gridCols) * CELL + PAD * 2;
const H = gridRows * CELL + PAD * 2;

const sheet = new Sheet(W, H);
const rule = hexToRgb('#232c38');

panels.forEach((inds, p) => {
  const panelX = GENS > 0 ? PAD + p * CELL : PAD;
  if (GENS > 0 && p > 0) sheet.rect(panelX - 1, PAD, 1, H - PAD * 2, rule, 0.9);
  for (let i = 0; i < COUNT; i++) {
    const ind = inds[i % inds.length];
    const ox = GENS > 0 ? panelX : PAD + (i % gridCols) * CELL;
    const oy = PAD + (GENS > 0 ? i : Math.floor(i / gridCols)) * CELL;
    const s = CELL - PAD * 2;
    const { paths } = glyphPaths(ind.g, { res: 26 });
    // Alpha carries fitness, exactly as the app draws it, so the plate shows what
    // the screen shows. Only the first glyph of a descent keeps its niche colour:
    // six columns of the same hue would say nothing the census does not.
    const colour = i === 0 ? hexToRgb(ind.m.niche.color) : hexToRgb(INK);
    for (const path of paths) {
      sheet.polygon(path.poly.map(([x, y]) => [ox + PAD / 2 + x * s, oy + PAD / 2 + y * s]), colour,
        0.35 + 0.65 * ind.m.fitness);
    }
  }
});

writeFileSync(outPath, sheet.toPNG());
const st = pop.stats(makeRng(1));
console.log(`target roughness ${targetArg || 'default'}\n${outPath}  ${W}x${H}  ${COUNT} glyphs  ${panels.length} panel(s)${GENS ? `, ${GENS} generations` : ''}, seed ${SEED}`);
console.log(`mean ${st.mean.toFixed(3)}  best ${st.best.fitness.toFixed(3)}  diversity ${st.diversity.toFixed(3)}`);
console.log('niches', Object.entries(st.niches).map(([k, v]) => `${k}:${v}`).join(' '),
  '|', NICHES.map((n) => `${n.label}=${n.color}`).join(' '));

if (GENS === 0) {
  // The archetypes on their own, at full ink: is the founder a character or noise?
  const f = new Sheet(8 * CELL + PAD * 2, 8 * CELL + PAD * 2);
  const fr = makeRng(SEED);
  for (let i = 0; i < 64; i++) {
    const g = genomeFromSkeleton(founderSkeleton(fr), fr);
    const { paths } = glyphPaths(g, { res: 26 });
    const x = PAD + (i % 8) * CELL;
    const y = PAD + Math.floor(i / 8) * CELL;
    const s = CELL - PAD * 2;
    for (const p of paths) {
      f.polygon(p.poly.map(([px, py]) => [x + PAD / 2 + px * s, y + PAD / 2 + py * s]), hexToRgb(INK), 0.92);
    }
  }
  const founderPath = outPath.replace(/\.png$/, '-founders.png');
  writeFileSync(founderPath, f.toPNG());
  console.log(`${founderPath}  ${f.w}x${f.h}  archetype founders at full ink`);
}