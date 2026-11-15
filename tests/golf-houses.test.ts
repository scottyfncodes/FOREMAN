import PAR from './golf-par.json';
import { describe, expect, it } from 'vitest';
import { HOUSES, hiddenBalls, houseLevel, houseStars } from '../src/golf/game/houses';
import { shotAt } from '../src/golf/game/solve';
import { Session } from '../src/golf/sim/session';
import { World } from '../src/golf/sim/world';

/**
 * The campaign is a set of shot-budget puzzles. Par for each house is what a greedy bot
 * manages with standard balls alone (`pnpm par`); its shots are recorded in golf-par.json
 * and replayed here with the real controls, so a goal in the game is always reachable.
 */
describe('the campaign', () => {
  it('houses grow, every one stands untouched, and goals are not met by a fresh house', () => {
    let last = 0;
    for (const h of HOUSES) {
      const w = new World(h.spec, h.yard);
      w.solve(true);
      expect(w.drainEvents().filter((e) => e.t === 'release' || e.t === 'creak'), h.id).toHaveLength(0);
      expect(w.pending.size, `${h.id} has overloaded parts`).toBe(0);
      // Left alone for a while, nothing gives way.
      for (let i = 0; i < 240; i++) w.step();
      expect(w.drainEvents().filter((e) => e.t === 'break' || e.t === 'release'), `${h.id} falls down on its own`).toHaveLength(0);
      expect(new Session(houseLevel(h)).completed, h.id).toBe(false);
      expect(w.parts.length, `${h.id} is not bigger than the one before`).toBeGreaterThanOrEqual(last);
      last = w.parts.length;
    }
  });

  it('hides each house’s balls in the same bricks every time, never in the footing', () => {
    for (const h of HOUSES) {
      const w = new World(h.spec, h.yard);
      const a = hiddenBalls(h, w.parts);
      const b = hiddenBalls(h, new World(h.spec, h.yard).parts);
      expect([...a]).toEqual([...b]);
      expect(a.size).toBe(h.hidden);
      for (const [id, ball] of a) {
        expect(w.parts[id]?.kind).toBe('brick');
        expect(w.parts[id]?.mat).not.toBe('foundation');
        expect(h.pool).toContain(ball);
      }
    }
  });

  it('every house comes down at par to its recorded shots: standard balls, real controls, full pull', () => {
    const log: string[] = [];
    for (const h of HOUSES) {
      const shots = (PAR as Record<string, number[][]>)[h.id];
      expect(shots, `${h.id} has no recorded par line`).toBeDefined();
      expect(shots.length).toBeGreaterThanOrEqual(h.par);
      expect(h.shots).toBeGreaterThan(h.par);
      const s = new Session(houseLevel(h), 7, { fastResolve: true });
      for (const [x, y, z] of shots) {
        if (s.completed) break;
        expect(s.fire(shotAt(s.world, 'standard', { x, y, z }, 1, s.mods()).shot)).toBe(true);
        for (let i = 0; i < 8000 && s.phase !== 'aim'; i++) s.step();
      }
      const pct = s.world.roofDown() * 100;
      log.push(`${h.id}:${pct.toFixed(1)}/${h.goal}`);
      expect(s.completed, `${h.id} ${h.name}: ${pct.toFixed(1)}% of ${h.goal}% (${log.join(' ')})`).toBe(true);
      expect(s.shotsUsed, `${h.id} par line finished early: par is too generous`).toBe(h.par);
      expect(houseStars(h, s.shotsUsed)).toBe(h.par === 1 ? 3 : 2);
      // Not a photo finish.
      expect(pct).toBeGreaterThanOrEqual(h.goal);
    }
    console.log(log.join(' '));
  }, 300_000);

  it('a house is failed when the shots run out short of the goal, and takes no more shots', () => {
    const h = HOUSES[0];
    const s = new Session(houseLevel(h), 7, { fastResolve: true });
    let failed = false;
    s.onFail = () => { failed = true; };
    // Every ball into the lawn in front of the tee.
    for (let k = 0; k < h.shots; k++) {
      expect(s.fire({ ball: 'standard', yaw: 0, pitch: 3, power: 0.2 })).toBe(true);
      for (let i = 0; i < 8000 && s.phase !== 'aim'; i++) s.step();
    }
    expect(s.shotsLeft).toBe(0);
    expect(s.completed).toBe(false);
    expect(failed).toBe(true);
    expect(s.fire({ ball: 'standard', yaw: 0, pitch: 3, power: 0.2 })).toBe(false);
  });

  it('gives one star in budget, two at par, three under it', () => {
    const h = HOUSES[2];
    expect(houseStars(HOUSES[0], 1)).toBe(3);
    expect(houseStars(h, h.par - 1)).toBe(3);
    expect(houseStars(h, h.par)).toBe(2);
    expect(houseStars(h, h.shots)).toBe(1);
  });
});
