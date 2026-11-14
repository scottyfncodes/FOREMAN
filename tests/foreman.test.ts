import { describe, expect, it } from 'vitest';
import solutions from './foreman-solutions.json';
import { Session, starsFor } from '../src/foreman/game/session';
import { flightAt, flightTo, FACE_Z } from '../src/foreman/game/shot';
import { LEVELS } from '../src/foreman/sim/levels';
import { KEEP, solve, TIPS, UNSUPPORTED, type SNode } from '../src/foreman/sim/structure';
import { BALLS, MATS, type BallKind } from '../src/foreman/sim/types';
import { GONE, STANDING, Sim } from '../src/foreman/sim/world';

function node(x0: number, x1: number, y0: number, weight: number, extra: Partial<SNode> = {}): SNode {
  return { x0, x1, y0, ground: y0 === 0, below: [], samples: [(x0 + x1) / 2, weight], crushPerM: 1000, bendCap: 0, ext: [], ...extra };
}

describe('load solver', () => {
  it('shares a beam between two posts by the lever rule', () => {
    const beam = node(0, 10, 1, 0, { samples: [3, 700], below: [{ j: 0, a: 0, b: 1 }, { j: 1, a: 9, b: 10 }], bendCap: 1e9 });
    const out = solve([node(0, 1, 0, 0), node(9, 10, 0, 0), beam], new Uint8Array([1, 1, 1]));
    expect(out.load[0]).toBeCloseTo(525, 3);
    expect(out.load[1]).toBeCloseTo(175, 3);
    expect([...out.removed]).toEqual([KEEP, KEEP, KEEP]);
  });

  it('drops what has nothing under it and tips what is off balance', () => {
    const beam = node(0, 10, 1, 100, { below: [{ j: 0, a: 0, b: 1 }] });
    const rider = node(4, 5, 2, 10, { below: [{ j: 1, a: 4, b: 5 }] });
    const out = solve([node(0, 1, 0, 10), beam, rider], new Uint8Array([1, 1, 1]));
    expect([...out.removed]).toEqual([KEEP, TIPS, UNSUPPORTED]);
  });

  it('reports crushing and bending as load over capacity', () => {
    const beam = node(0, 10, 1, 0, { samples: [5, 2000], below: [{ j: 0, a: 0, b: 1 }, { j: 1, a: 9, b: 10 }], bendCap: 2000 });
    const out = solve([node(0, 1, 0, 0, { crushPerM: 500 }), node(9, 10, 0, 0, { crushPerM: 500 }), beam], new Uint8Array([1, 1, 1]));
    expect(out.util[0]).toBeCloseTo(2, 3);
    // Simply supported, 8 m clear span, 2000 N in the middle: 4000 N·m.
    expect(out.util[2]).toBeCloseTo(2, 3);
    expect(out.mode[2]).toBe(1);
    expect(out.snapX[2]).toBeCloseTo(5, 3);
  });
});

describe('the golf shot', () => {
  it('lands exactly on the spot it was aimed at when the pull is enough', () => {
    const f = flightTo(4, 6, 9, 1, 'standard');
    expect(f.reach).toBe(true);
    const p = { x: 0, y: 0, z: 0 };
    flightAt(f, f.time, p);
    expect(p.x).toBeCloseTo(6, 4);
    expect(p.y).toBeCloseTo(9, 4);
    expect(p.z).toBeCloseTo(FACE_Z, 4);
  });

  it('hits harder the harder it is pulled, and falls short when it is too soft', () => {
    const soft = flightTo(0, 0, 1, 0.5, 'standard');
    const hard = flightTo(0, 0, 1, 1, 'standard');
    expect(soft.reach && hard.reach).toBe(true);
    expect(hard.energy).toBeGreaterThan(soft.energy * 2);
    expect(hard.energy).toBeCloseTo(BALLS.standard.energy, 1);
    const weak = flightTo(0, 0, 12, 0.2, 'standard');
    expect(weak.reach).toBe(false);
    expect(weak.energy).toBe(0);
    expect(weak.z).toBeGreaterThan(FACE_Z + 0.5);
  });
});

type Shot = [number | 'H', number?, number?, BallKind?];
const SOLUTIONS = solutions as unknown as Record<string, Shot[]>;

/** Plays shots through the real session at full power: a piece index (or H for the marked piece), where on it, and the ball. */
function play(id: string, shots: Shot[], power = 1): Session {
  const level = LEVELS.find((l) => l.id === id);
  if (!level) throw new Error(id);
  const s = new Session(level);
  for (const [which, fx = 0.5, fy = 0.5, ball = 'standard'] of shots) {
    const m = which === 'H' ? s.sim.members.find((q) => q.hidden && q.hidden !== 'gas' && q.state === STANDING) : s.sim.members[which];
    if (!m) throw new Error(`${id}: no piece ${which}`);
    if (!s.fire(m.x - m.w / 2 + fx * m.w, m.y - m.h / 2 + fy * m.h, power, ball)) break;
    for (let i = 0; i < 4000 && (s.status === 'flight' || s.status === 'busy'); i++) s.step();
    s.frame.length = 0;
  }
  return s;
}

describe('jobs', () => {
  it('has a solution on record for every job', () => {
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
        expect(level.par).toBeLessThanOrEqual(level.shots);
      });

      it('comes down to its recorded solution at par, for three stars, with a chain', () => {
        const s = play(level.id, SOLUTIONS[level.id]);
        expect(s.status).toBe('won');
        expect(s.used).toBe(level.par);
        expect(s.keystone).toBe(true);
        expect(s.stars).toBe(3);
        expect(s.bestChain).toBeGreaterThanOrEqual(2);
        // Not a photo finish: the result has to survive small differences between devices.
        expect(s.sim.aboveMass() / s.sim.targetMass).toBeLessThan(0.02);
      });

      it('plays out the same way every time', () => {
        const a = play(level.id, SOLUTIONS[level.id]);
        const b = play(level.id, SOLUTIONS[level.id]);
        expect(a.score).toBe(b.score);
        expect(a.sim.time).toBe(b.sim.time);
        expect(a.sim.members.map((m) => m.state)).toEqual(b.sim.members.map((m) => m.state));
      });

      it('is not brought down by a ball through a window', () => {
        const sim = new Sim(level);
        const pane = sim.members.find((m) => m.mat === 'glass' && !m.protect);
        if (!pane) return;
        expect(play(level.id, [[pane.id]]).status).not.toBe('won');
      });
    });
  }
});

describe('rules', () => {
  it('different shots give different collapses', () => {
    const a = play('frame', [[1]]);
    const b = play('frame', [[0]]);
    expect(a.sim.progress()).toBeGreaterThan(0.95);
    expect(b.sim.progress()).toBeLessThan(0.5);
    expect(b.status).toBe('aim');
    expect(b.shotsLeft).toBe(b.level.shots - 1);
  });

  it('a ball punches a hole where it lands and leaves the rest of the piece standing', () => {
    const level = LEVELS.find((l) => l.id === 'shop')!;
    const sim = new Sim(level);
    const wall = sim.members.find((m) => m.layer === 1 && m.mat === 'brick' && m.w >= 1.9 && m.h < 1)!;
    const before = sim.members.length;
    const out = sim.hit(wall.x, wall.y, 1, 0.55);
    expect(out.effect).toBe('break');
    expect(wall.state).toBe(GONE);
    const rest = sim.members.slice(before).filter((m) => m.state === STANDING);
    expect(rest.length).toBe(2);
    expect(rest.reduce((a, m) => a + m.w, 0)).toBeCloseTo(wall.w - 0.55, 2);
  });

  it('a standard ball only cracks brick, and the crack costs it strength', () => {
    const sim = new Sim(LEVELS.find((l) => l.id === 'terrace')!);
    const pier = sim.members[0];
    const before = pier.util;
    expect(sim.hit(pier.x, pier.y, 1, 0.55).effect).toBe('weaken');
    sim.run(5);
    expect(pier.state).toBe(STANDING);
    expect(pier.util).toBeGreaterThan(before * 1.3);
    // A second ball goes through.
    expect(sim.hit(pier.x, pier.y, 1, 0.55).effect).toBe('break');
  });

  it('bounces off steel, and a soft shot does less than a hard one', () => {
    const s = new Session(LEVELS.find((l) => l.id === 'shed')!);
    const steel = s.sim.members.find((m) => m.mat === 'steel')!;
    expect(s.foresee(s.plan(steel.x, steel.y, 1, 'standard')).effect).toBe('none');
    const t = new Session(LEVELS.find((l) => l.id === 'frame')!);
    const post = t.sim.members[1];
    expect(t.foresee(t.plan(post.x, post.y, 1, 'standard')).effect).toBe('break');
    expect(t.foresee(t.plan(post.x, post.y, 0.45, 'standard')).effect).toBe('weaken');
    expect(MATS.steel.tough).toBe(Infinity);
  });

  it('loses the tower job when it comes down on the neighbour', () => {
    const s = play('stack', [[4]]);
    expect(s.status).toBe('lost');
    expect(s.loss).toBe('neighbour');
  });

  it('needs the hidden gas on the shop: no pier gives way to the two shots allowed', () => {
    for (const pier of [0, 1, 2]) expect(play('shop', [[pier], [pier]]).status).toBe('lost');
  });

  it('hands over the ball sealed in a marked piece, and spends it when it is used', () => {
    const s = play('flats', [['H']]);
    expect(s.bag.heavy).toBe(1);
    expect(s.status).toBe('aim');
    expect(s.canFire('heavy')).toBe(true);
    expect(s.canFire('power')).toBe(false);
    const t = play('flats', [['H'], [3, 0.5, 0.4, 'heavy']]);
    expect(t.bag.heavy).toBe(0);
  });

  it('fails the job when the shots run out', () => {
    const level = LEVELS.find((l) => l.id === 'flats')!;
    const pane = new Sim(level).members.filter((m) => m.mat === 'glass').slice(0, level.shots).map((m): Shot => [m.id]);
    const s = play('flats', pane);
    expect(s.shotsLeft).toBe(0);
    expect(s.status).toBe('lost');
    expect(s.loss).toBe('standing');
  });

  it('scores stars on par and the keystone', () => {
    const level = LEVELS.find((l) => l.id === 'flats')!;
    expect(starsFor(level, level.par - 1, false)).toBe(3);
    expect(starsFor(level, level.par, true)).toBe(3);
    expect(starsFor(level, level.par, false)).toBe(2);
    expect(starsFor(level, level.par + 1, true)).toBe(1);
  });
});
