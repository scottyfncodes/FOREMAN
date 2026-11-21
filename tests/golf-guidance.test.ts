import { describe, expect, it } from 'vitest';
import { HOUSES, houseLevel } from '../src/golf/game/houses';
import { reachableWeakPoints, reachableWeakPointsSteps, shotAt } from '../src/golf/game/solve';
import { predict } from '../src/golf/sim/aim';
import { PartState } from '../src/golf/sim/parts';
import { Session } from '../src/golf/sim/session';

// The yellow pulse is the game's guidance: it has to mark spots a shot from the tee can
// reach, and on the first house following it has to be enough to do the job.

const h1 = HOUSES[0] as (typeof HOUSES)[number];

const settle = (s: Session): void => {
  for (let i = 0; i < 6000 && s.phase !== 'aim'; i++) s.step();
};

describe('weak-point guidance', () => {
  it('marks spots on the first house that the flight aimed at them actually touches first', () => {
    const s = new Session(houseLevel(h1), 7, { fastResolve: true });
    const lit = reachableWeakPoints(s.world, 3);
    expect(lit.length).toBeGreaterThan(0);
    for (const id of lit) {
      const p = s.world.parts[id]!;
      const c = predict(s.world, shotAt(s.world, 'standard', p, 1).shot).contact;
      expect(c, `weak point ${id} is reachable`).not.toBeNull();
      expect(Math.hypot(c!.px - p.x, c!.py - p.y, c!.pz - p.z)).toBeLessThan(1);
    }
  });

  it('a player who only ever shoots at the pulse brings the first house down inside its budget', () => {
    const s = new Session(houseLevel(h1), 7, { fastResolve: true });
    while (s.shotsLeft > 0 && !s.completed) {
      const lit = reachableWeakPoints(s.world, 3);
      const bottle = s.world.parts.find((p) => p.volatile && p.state === PartState.Intact);
      const target = s.world.parts[lit[0] ?? bottle?.id ?? 0]!;
      expect(s.fire(shotAt(s.world, 'standard', target, 1, s.mods()).shot)).toBe(true);
      settle(s);
    }
    expect(s.completed).toBe(true);
  });

  it('the stepped search gives the same answer as the one-shot search', () => {
    const s = new Session(houseLevel(HOUSES[1]!), 7, { fastResolve: true });
    const job = reachableWeakPointsSteps(s.world, 3);
    let r = job.next();
    let steps = 0;
    while (!r.done) {
      r = job.next();
      steps++;
    }
    expect(steps).toBeGreaterThan(1);
    expect(r.value).toEqual(reachableWeakPoints(s.world, 3));
  });
});
