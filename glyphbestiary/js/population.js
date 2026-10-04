// The population and the selection rule.
//
// The one thing this file exists to enforce: the population must NOT converge on
// a single best solution. Every genetic-typography demo does exactly that, and it
// is the wrong shape for this piece - a converged population is a slider, not an
// ecology. So selection here is deliberately three-way:
//
//   survivors  top slice by fitness, carried over untouched (elite, keeps the best)
//   children   tournament winners crossed and mutated
//   immigrants  fresh random genomes, no descent required at all
//
// The immigrant quota is what buys diversity: without it, selection only ever
// narrows, and the population reaches a local optimum and stops being alive
// within a few dozen generations. Lineage is recorded on every child from day one
// even though the clade tree is step 3, because ids that do not exist yet cannot
// be invented later.
import { NICHES } from './fitness.js';
import { diversity as sampleDiversity } from './fitness.js';
import { cloneGenome, genomeDistance, randomGenome } from './genome.js';
import { crossover, mutate } from './mutate.js';

let nextId = 1;

export class Population {
  constructor({ size = 200, rng, founder = null, res = 26, evaluate }) {
    this.size = size;
    this.rng = rng;
    this.res = res;
    this.evaluate = evaluate;
    this.gen = 0;
    this.seeded = founder;
    this.individuals = [];
    this.reset();
  }

  reset() {
    this.gen = 0;
    const rng = this.rng;
    const out = new Array(this.size);
    for (let i = 0; i < this.size; i++) {
      // Half the founders descend from the drawn founder, half arrive cold. A
      // population where all 200 start from one hand-drawn glyph looks like one
      // idea being slowly ruined; the cold half is what makes the first few
      // generations interesting to watch.
      const base = this.seeded && rng.chance(0.5) ? cloneGenome(this.seeded) : null;
      const g = base
        ? mutate(base, { rng, rate: 0.85, magnitude: 0.5 })
        : randomGenome(rng);
      out[i] = { id: nextId++, g, m: null, gen: 0, parents: null };
    }
    this.individuals = out;
    this.score();
    return this;
  }

  setFounder(founder) {
    this.seeded = founder;
    return this.reset();
  }

  score() {
    for (const ind of this.individuals) ind.m = this.evaluate(ind.g, { res: this.res });
    return this;
  }

  /** Tournament pick. k is small on purpose: large k is nearly elitist. */
  #pick(pool, k = 3) {
    const rng = this.rng;
    let best = pool[rng.int(pool.length)];
    for (let i = 1; i < k; i++) {
      const c = pool[rng.int(pool.length)];
      if (c.m.fitness > best.m.fitness) best = c;
    }
    return best;
  }

  /**
   * One generation.
   *
   * Selection is per NICHE, not global, and that is the fix for the failure this
   * file used to have. With one global ranking, the three metrics have a single
   * optimum - a compact, connected, centred mark of about 30% ink - and every
   * lineage finds it independently. Measured on a contact sheet, forty generations
   * turned all eight sampled lineages into the same 习-like glyph while the
   * diversity readout still said 0.13, which is the exact "a slider, not an
   * ecology" outcome this project is supposed to refuse. Immigration could not
   * help: fresh founders were re-selected out within a generation or two.
   *
   * So each niche gets its own quota, breeds from its own members (assortative,
   * the way a species mates with its own kind), and only a `crossRate` fraction of
   * the offspring reach outside. Gene flow stays alive without letting any one
   * species swallow the grid. If a niche empties out entirely, `#regrow` grows one
   * back by mutating the best available glyph until its roughness lands in the
   * missing band - the ecosystem repairs itself rather than going extinct.
   *
   * `keepRate`, `immigrantRate` and `nicheShare` are left open because the UI drives
   * them: cranking immigrants up is the "give me more species" control, and
   * `nicheShare` is how the artist decides how much of the page 狂 is allowed.
   */
  step({
    keepRate = 0.22,
    immigrantRate = 0.1,
    crossoverRate = 0.7,
    crossRate = 0.08,
    rate = 0.3,
    magnitude = 0.35,
    tournamentSize = 3,
    nicheShare = null,
  } = {}) {
    const rng = this.rng;
    const groups = this.#byNiche();
    const next = [];

    const nImm = Math.round(this.size * immigrantRate);
    for (let i = 0; i < nImm; i++) {
      next.push({ id: nextId++, g: randomGenome(rng), m: null, gen: this.gen + 1, parents: null });
    }

    const slots = this.size - nImm;
    const quota = this.#quotas(slots, nicheShare);
    for (let n = 0; n < NICHES.length; n++) {
      const niche = NICHES[n];
      const want = quota[n];
      if (want <= 0) continue;
      const pool = groups.get(niche.key);
      pool.sort((a, b) => b.m.fitness - a.m.fitness);

      const keep = Math.min(pool.length, Math.max(1, Math.round(want * keepRate)));
      for (let i = 0; i < keep; i++) {
        const src = pool[i];
        next.push({ id: src.id, g: src.g, m: src.m, gen: src.gen, parents: src.parents });
      }
      let made = keep;
      let guard = want * 8;
      while (made < want && guard-- > 0) {
        const child = this.#breed(pool, groups, niche.key, {
          crossoverRate, crossRate, rate, magnitude, tournamentSize,
        });
        if (!child) break;
        next.push(child);
        made++;
      }
      // A niche with nobody in it: grow one back rather than let the grid lose a
      // colour. Bounded attempts, because rejection sampling that cannot hit the
      // band must not hang the frame loop.
      while (made < want) {
        next.push(...this.#regrow(want - made, { rate, magnitude }));
        made++;
      }
    }

    this.individuals = next;
    this.gen++;
    this.score();
    return this;
  }

  #byNiche() {
    const groups = new Map(NICHES.map((n) => [n.key, []]));
    for (const ind of this.individuals) groups.get(ind.m.niche.key).push(ind);
    return groups;
  }

  /** Slots per niche. Equal by default; `nicheShare` lets the artist skew it. */
  #quotas(slots, share) {
    const quotas = new Array(NICHES.length).fill(0);
    if (!share) {
      const per = Math.floor(slots / NICHES.length);
      let spare = slots - per * NICHES.length;
      for (let i = 0; i < NICHES.length; i++) quotas[i] = per + (spare-- > 0 ? 1 : 0);
      return quotas;
    }
    let left = slots;
    for (let i = 0; i < NICHES.length; i++) {
      const q = i === NICHES.length - 1 ? left : Math.round(slots * Math.max(0, share[i]));
      quotas[i] = Math.max(0, q);
      left -= quotas[i];
    }
    return quotas;
  }

  /** One child of a niche, reaching outside only `crossRate` of the time. */
  #breed(pool, groups, key, { crossoverRate, crossRate, rate, magnitude, tournamentSize }) {
    const rng = this.rng;
    if (!pool.length) return null;
    const a = this.#pick(pool, tournamentSize);
    const outside = rng.chance(crossRate);
    const otherKeys = [...groups.keys()].filter((k) => k !== key && groups.get(k).length);
    const b = outside && otherKeys.length
      ? this.#pick(groups.get(rng.pick(otherKeys)), tournamentSize)
      : this.#pick(pool, tournamentSize);
    let g;
    let parents;
    if (rng.chance(crossoverRate) && b !== a) {
      g = crossover(a.g, b.g, rng, { rate, magnitude });
      parents = [a.id, b.id];
    } else {
      g = mutate(cloneGenome(a.g), { rng, rate, magnitude });
      parents = [a.id];
    }
    return { id: nextId++, g, m: null, gen: this.gen + 1, parents };
  }

  /**
   * Mutate the current best until the roughness falls inside `niche`. Used only to
   * refill an empty niche, so it is allowed to be a blunt instrument: it moves one
   * gene, the contrast, which is the strongest lever on how much the pen turns.
   */
  #regrow(count, { rate, magnitude }) {
    const rng = this.rng;
    const out = new Array(count);
    for (let i = 0; i < count; i++) {
      let g = cloneGenome(this.best().g);
      const want = NICHES[Math.min(NICHES.length - 1, Math.floor(this.#emptyNicheIndex()))];
      for (let attempt = 0; attempt < 14; attempt++) {
        if (this.evaluate(g, { res: this.res }).niche.key === want.key) break;
        g = crossover(g, randomGenome(rng), rng, { rate, magnitude });
      }
      out[i] = { id: nextId++, g, m: null, gen: this.gen + 1, parents: null };
    }
    return out;
  }

  #emptyNicheIndex() {
    const groups = this.#byNiche();
    for (let i = 0; i < NICHES.length; i++) if (!groups.get(NICHES[i].key).length) return i;
    return NICHES.length - 1;
  }

  best() {
    let b = this.individuals[0];
    for (const ind of this.individuals) if (ind.m.fitness > b.m.fitness) b = ind;
    return b;
  }

  stats(rng = this.rng) {
    let sum = 0;
    const niches = {};
    for (const ind of this.individuals) {
      sum += ind.m.fitness;
      niches[ind.m.niche.key] = (niches[ind.m.niche.key] || 0) + 1;
    }
    return {
      gen: this.gen,
      size: this.individuals.length,
      mean: sum / this.individuals.length,
      best: this.best().m,
      diversity: sampleDiversity(this.individuals, rng, genomeDistance),
      niches,
    };
  }
}