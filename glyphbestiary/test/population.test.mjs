// The population, and specifically the claim this project is built on: the
// population must not converge on one form.
//
// The first version of this file tested a mechanism that turned out to be too weak.
// Global selection plus an immigrant quota kept the NUMBERS spread - diversity
// 0.127 against 0.059 - while the contact sheets showed every sampled lineage
// converging on the same 习-like glyph within forty generations. The fix was
// per-niche selection with a quota, so these tests now hold THAT to account:
// every niche must survive even with immigration switched off, the census must
// follow the artist's target, and nothing may go extinct by accident.
import { evaluate, nicheShare, NICHES, setPressure } from '../js/fitness.js';
import { genomeDistance, randomGenome } from '../js/genome.js';
import { Population } from '../js/population.js';
import { makeRng } from '../js/util.js';

let fail = 0;
const check = (name, ok, detail = '') => {
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ->  ' + detail : ''}`);
};

const mk = (seed, opts = {}) => new Population({ size: 120, rng: makeRng(seed), evaluate, ...opts });
const run = (seed, gens, opts = {}) => {
  const pop = mk(seed);
  const share = nicheShare();
  for (let i = 0; i < gens; i++) pop.step({ nicheShare: share, ...opts });
  return pop;
};
const census = (pop) => pop.stats(makeRng(12)).niches;

// --- bookkeeping ---------------------------------------------------------
{
  const pop = mk(1);
  check('the population has the requested size', pop.individuals.length === 120);
  check('every individual is scored at construction', pop.individuals.every((i) => i.m && Number.isFinite(i.m.fitness)));
  check('every id is unique', new Set(pop.individuals.map((i) => i.id)).size === 120);

  pop.step({ nicheShare: nicheShare() });
  check('a step advances the generation counter', pop.gen === 1);
  check('a step keeps the size', pop.individuals.length === 120);
  check('a step re-scores everyone', pop.individuals.every((i) => i.m && Number.isFinite(i.m.fitness)));
  check('ids stay unique across generations', new Set(pop.individuals.map((i) => i.id)).size === 120);
}

// --- the four channels: elite, child, immigrant, and regrown -------------
{
  const pop = mk(2);
  const before = new Map(pop.individuals.map((i) => [i.id, i.m.fitness]));
  // Each niche's champion, taken from THIS population - rebuilding an identical one
  // would consume the generator differently and the ids would not line up.
  const champions = new Map();
  for (const ind of pop.individuals) {
    const cur = champions.get(ind.m.niche.key);
    if (!cur || ind.m.fitness > cur.m.fitness) champions.set(ind.m.niche.key, ind);
  }
  pop.step({ nicheShare: nicheShare(), keepRate: 0.2, immigrantRate: 0.1 });

  const kept = pop.individuals.filter((i) => before.has(i.id));
  const fresh = pop.individuals.filter((i) => !before.has(i.id));
  const immigrants = fresh.filter((i) => i.parents === null);
  const children = fresh.filter((i) => i.parents !== null);

  check('some elite are carried over with their original ids', kept.length > 0 && kept.length < 120,
    `${kept.length} kept`);
  check('elite keep their exact score, not a rescored copy',
    kept.every((i) => i.m.fitness === before.get(i.id)));
  check('the champion of every occupied niche survives', (() => {
    const keptIds = new Set(kept.map((k) => k.id));
    return [...champions.values()].every((c) => keptIds.has(c.id));
  })(), `${champions.size} niches`);
  check('the immigrant quota is honoured', immigrants.length === 12, `${immigrants.length}`);
  check('the rest are children with one or two recorded parents',
    children.length > 60 && children.every((i) => i.parents.length >= 1 && i.parents.length <= 2),
    `${children.length} children`);
  check('children are stamped with their birth generation', children.every((i) => i.gen === 1));

  pop.step({ nicheShare: nicheShare(), immigrantRate: 0 });
  const noNewBlood = pop.individuals.filter((i) => i.parents === null && i.gen === 2).length;
  check('setting the quota to zero really stops the immigrants', noNewBlood === 0, `${noNewBlood}`);
}

// --- every niche survives, with immigration switched off -----------------
// This is the guarantee the quota buys, and it is the one global selection plus
// immigrants could not give: a species that exists only because fresh blood keeps
// arriving is not a species, it is a stream.
{
  for (const target of [0.2, 0.8, 1.4, 2.2]) {
    setPressure({ legibility: 0.33, structure: 0.5, wild: 0.28, target });
    const pop = run(11, 60, { immigrantRate: 0 });
    const n = census(pop);
    const present = NICHES.filter((k) => (n[k.key] || 0) > 0).length;
    check(`target ${target}: all four niches are still occupied after 60 generations with no immigrants`,
      present === 4, JSON.stringify(n));
    check(`target ${target}: the census roughly follows the artist's target`,
      (() => {
        const share = nicheShare();
        const want = NICHES.reduce((best, k, i) => (share[i] > share[best] ? i : best), 0);
        const got = NICHES.reduce((best, k, i) => ((n[k.key] || 0) > (n[NICHES[best].key] || 0) ? i : best), 0);
        return want === got;
      })(), `${JSON.stringify(n)} vs share ${nicheShare().map((s) => s.toFixed(2)).join('/')}`);
  }
}

// --- the floor: extinction should take work ------------------------------
{
  setPressure({ target: 0.2 });
  const pop = run(13, 80);
  const n = census(pop);
  check('a 楷-targeted population keeps stragglers of every other kind',
    NICHES.slice(1).every((k) => (n[k.key] || 0) >= 3), JSON.stringify(n));
  check('and is mostly 楷', (n.kai || 0) > 120 * 0.4, `楷 ${n.kai || 0}/120`);
}

// --- it evolves, but not into one shape ---------------------------------
{
  setPressure({ target: 0.55 });
  const pop = run(7, 60);
  const s = pop.stats(makeRng(8));
  const founders = mk(7).stats(makeRng(8)).mean;
  check('selection improves the population', s.mean > founders, `${founders.toFixed(3)} -> ${s.mean.toFixed(3)}`);
  check('but the population is still varied', s.diversity > 0.05, `diversity ${s.diversity.toFixed(3)}`);

  const wild = run(7, 60, { nicheShare: [0, 0, 0, 1] });
  check('a different target produces a different population',
    genomeDistance(pop.best().g, wild.best().g) > 0.05,
    genomeDistance(pop.best().g, wild.best().g).toFixed(3));
}

// --- founder -------------------------------------------------------------
{
  const founder = randomGenome(makeRng(555));
  const pop = mk(3, { founder });
  const plain = mk(4);
  pop.setFounder(founder);
  check('setFounder resets the generation', pop.gen === 0);

  const near = pop.individuals.filter((i) => genomeDistance(i.g, founder) < 0.25).length;
  check('most of a seeded population starts near the drawn founder', near > 90, `${near}/120 within 0.25`);
  check('the rest arrived cold', near < 120);

  const dist = (p) => p.individuals.reduce((s, i) => s + genomeDistance(i.g, founder), 0) / p.individuals.length;
  check('a seeded population is measurably closer to its founder than an unseeded one',
    dist(pop) < dist(plain), `${dist(pop).toFixed(3)} vs ${dist(plain).toFixed(3)}`);
}

// --- stats ---------------------------------------------------------------
{
  const pop = mk(21);
  const s = pop.stats(makeRng(22));
  check('stats report the population size', s.size === 120);
  check('the niche census adds up to the population',
    Object.values(s.niches).reduce((a, b) => a + b, 0) === 120, JSON.stringify(s.niches));
  check('diversity is in range', s.diversity >= 0 && s.diversity <= 1);
  check('best() agrees with stats', pop.best().m.fitness === s.best.fitness);
  check('a reset puts the generation counter back to zero', (pop.step({ nicheShare: nicheShare() }), pop.reset(), pop.gen === 0));
}

setPressure({ legibility: 0.33, structure: 0.5, wild: 0.28, target: 0.55 });
console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILURE(S)`);
process.exit(fail ? 1 : 0);