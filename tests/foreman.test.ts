import { describe, expect, it } from 'vitest';
import solutions from './foreman-solutions.json';
import { Session, starsFor } from '../src/foreman/game/session';
import { LEVELS } from '../src/foreman/sim/levels';
import { KEEP, solve, TIPS, UNSUPPORTED, type SNode } from '../src/foreman/sim/structure';
import { MATS } from '../src/foreman/sim/types';
import { GONE, STANDING, Sim } from '../src/foreman/sim/world';

function node(x0: number, x1: number, y0: number, weight: number, extra: Partial<SNode> = {}): SNode {
  return { x0, x1, y0, ground: y0 === 0, below: [], samples: [(x0 + x1) / 2, weight], crushPerM: 1000, bendCap: 0, ext: [], ...extra };
}

describe('load solver', () => {
  it('shares a beam between two posts by the lever rule', () => {
    const left = node(0, 1, 0, 0);
    const right = node(9, 10, 0, 0);
    const beam = node(0, 10, 1, 0, { samples: [3, 700], below: [{ j: 0, a: 0, b: 1 }, { j: 1, a: 9, b: 10 }], bendCap: 1e9 });
    const out = solve([left, right, beam], new Uint8Array([1, 1, 1]));
    expect(out.load[0]).toBeCloseTo(525, 3);
    expect(out.load[1]).toBeCloseTo(175, 3);
    expect([...out.removed]).toEqual([KEEP, KEEP, KEEP]);
  });

  it('drops what has nothing under it and tips what is off balance', () => {
    const post = node(0, 1, 0, 10);
    const beam = node(0, 10, 1, 100, { below: [{ j: 0, a: 0, b: 1 }] });
    const rider = node(4, 5, 2, 10, { below: [{ j: 1, a: 4, b: 5 }] });
    const out = solve([post, beam, rider], new Uint8Array([1, 1, 1]));
    expect(out.removed[0]).toBe(KEEP);
    expect(out.removed[1]).toBe(TIPS);
    expect(out.removed[2]).toBe(UNSUPPORTED);
  });

  it('reports crushing and bending as load over capacity', () => {
    const post = node(0, 1, 0, 0, { crushPerM: 500 });
    const post2 = node(9, 10, 0, 0, { crushPerM: 500 });
    const beam = node(0, 10, 1, 0, { samples: [5, 2000], below: [{ j: 0, a: 0, b: 1 }, { j: 1, a: 9, b: 10 }], bendCap: 2000 });
    const out = solve([post, post2, beam], new Uint8Array([1, 1, 1]));
    expect(out.util[0]).toBeCloseTo(2, 3);
    // Simply supported, 8 m clear span, 2000 N in the middle: 4000 N·m.
    expect(out.util[2]).toBeCloseTo(2, 3);
    expect(out.mode[2]).toBe(1);
    expect(out.snapX[2]).toBeCloseTo(5, 3);
  });
});

/** The intended answer to each level: one charge each. */
const SOLUTIONS: Record<string, number[]> = solutions;

function play(id: string, strikes: number[]): Session {
  const level = LEVELS.find((l) => l.id === id);
  if (!level) throw new Error(id);
  const s = new Session(level);
  for (const k of strikes) {
    if (!s.strike(k)) break;
    for (let i = 0; i < 2400 && s.status === 'busy'; i++) s.step();
    s.frame.length = 0;
  }
  return s;
}

describe('levels', () => {
  it('has a solution on record for every level', () => {
    expect(Object.keys(SOLUTIONS).sort()).toEqual(LEVELS.map((l) => l.id).sort());
  });

  for (const level of LEVELS) {
    describe(level.id, () => {
      it('stands on its own, with every piece inside its limit', () => {
        const sim = new Sim(level);
        for (const m of sim.members) {
          expect(m.state, `piece ${m.id}`).toBe(STANDING);
          expect(m.util, `piece ${m.id}`).toBeLessThan(0.97);
        }
        expect(sim.progress()).toBe(0);
      });

      it('is cleared by its recorded solution within par, with a keystone', () => {
        const s = play(level.id, SOLUTIONS[level.id]);
        expect(s.status).toBe('won');
        expect(s.used).toBeLessThanOrEqual(level.par);
        expect(s.stars).toBe(3);
        expect(s.keystone).toBe(true);
        expect(s.bestChain).toBeGreaterThanOrEqual(2);
        // Not a photo finish: the result must survive small differences between devices.
        expect(s.sim.aboveMass() / s.sim.targetMass).toBeLessThan(0.02);
      });

      it('plays out the same way every time', () => {
        const a = play(level.id, SOLUTIONS[level.id]);
        const b = play(level.id, SOLUTIONS[level.id]);
        expect(a.score).toBe(b.score);
        expect(a.sim.time).toBe(b.sim.time);
        expect(a.sim.members.map((m) => m.state)).toEqual(b.sim.members.map((m) => m.state));
      });

      it('is not cleared by a charge on a piece that holds nothing up', () => {
        const sim = new Sim(level);
        const idle = sim.members.find((m) => m.mat === 'glass' || (m.shape !== 'box' && MATS[m.mat].hp > 0));
        if (!idle) return;
        const s = play(level.id, [idle.id]);
        expect(s.status).not.toBe('won');
      });
    });
  }
});

describe('rules', () => {
  it('different strikes give different collapses', () => {
    const a = play('frame', [1]);
    const b = play('frame', [0]);
    expect(a.sim.progress()).toBeGreaterThan(0.95);
    expect(b.sim.progress()).toBeLessThan(0.5);
    expect(b.status).toBe('aim');
    expect(b.charges).toBe(2);
  });

  it('loses the tower job when it falls on the neighbour', () => {
    const s = play('stack', [4]);
    expect(s.status).toBe('lost');
    expect(s.loss).toBe('neighbour');
  });

  it('refuses a charge on steel and on the neighbour, and spends nothing', () => {
    const s = new Session(LEVELS.find((l) => l.id === 'stack')!);
    const steel = s.sim.members.find((m) => m.mat === 'steel')!;
    const next = s.sim.members.find((m) => m.protect)!;
    expect(s.strike(steel.id)).toBe(false);
    expect(s.strike(next.id)).toBe(false);
    expect(s.charges).toBe(s.level.charges);
  });

  it('cracks concrete on the first charge and breaks it on the second', () => {
    const s = play('flats', [9]);
    const m = s.sim.members[9];
    expect(m.cracked).toBe(true);
    expect(m.state).toBe(STANDING);
    const t = play('flats', [9, 9]);
    expect(t.sim.members[9].state).toBe(GONE);
  });

  it('needs the hidden gas on the shop: no single pier is enough', () => {
    for (const pier of [0, 1, 2]) expect(play('shop', [pier]).status).toBe('lost');
    const s = play('shop', [8]);
    expect(s.status).toBe('won');
  });

  it('hands over a spare charge when the supply crate is broken open', () => {
    const level = LEVELS.find((l) => l.id === 'shed')!;
    const s = new Session(level);
    const crate = s.sim.members.find((m) => m.mat === 'crate')!;
    s.strike(crate.id);
    for (let i = 0; i < 600 && s.status === 'busy'; i++) s.step();
    expect(s.charges).toBe(level.charges);
    expect(s.used).toBe(1);
  });

  it('gives three stars at par, two at one over', () => {
    const level = LEVELS[0];
    expect(starsFor(level, level.par)).toBe(3);
    expect(starsFor(level, level.par + 1)).toBe(2);
    expect(starsFor(level, level.par + 2)).toBe(1);
  });
});
