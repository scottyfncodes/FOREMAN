import { test } from 'vitest';
import { HOUSES, houseLevel } from '../../src/golf/game/houses';
import { reachableWeakPoints, shotAt } from '../../src/golf/game/solve';
import { PartState } from '../../src/golf/sim/parts';
import { Session } from '../../src/golf/sim/session';

// How a new player fares on each house, over N seeded runs (`pnpm novice`):
//   blind:  shots anywhere on the front of the house, any power from 60%.
//   guided: shots at what the game pulses yellow (reachable weak points and gas bottles), a little off.
// HOUSES=h1,h2 picks houses; GOAL, SHOTS and STRENGTH try other tunings.
const roofDown = (s: Session): number => {
  let all = 0;
  let gone = 0;
  for (const p of s.world.parts) if (p.kind === 'tile' || p.kind === 'deck' || p.kind === 'ridge') { all++; if (p.state !== PartState.Intact) gone++; }
  return all ? gone / all : 0;
};
const rng = (seed: number) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); };

test('novice', () => {
  const E = process.env;
  const ids = (E.HOUSES ?? 'h1,h2,h3,h4,h5').split(',');
  const N = Number(E.N ?? 40);
  for (const id of ids) {
    const h0 = HOUSES.find((q) => q.id === id)!;
    const goal = Number(E.GOAL ?? h0.goal);
    const shots = Number(E.SHOTS ?? h0.shots);
    for (const style of ['blind', 'guided'] as const) {
      let wins = 0;
      const finals: number[] = [];
      for (let n = 0; n < N; n++) {
        const r = rng(n * 97 + 13);
        const lv0 = houseLevel(h0);
        const lv = { ...lv0, house: { ...lv0.house, ...(E.STRENGTH ? { strength: Number(E.STRENGTH) } : {}) } };
        const s = new Session({ ...lv, shots: 99, par: 99, objectives: [{ kind: 'destruction', pct: 101 }] }, 7, { fastResolve: true });
        const w = s.world;
        for (let k = 0; k < shots && roofDown(s) * 100 < goal; k++) {
          let t: { x: number; y: number; z: number };
          if (style === 'guided') {
            const lit = [...reachableWeakPoints(w, 3), ...w.parts.filter((q) => q.volatile && q.state === PartState.Intact).map((q) => q.id).slice(0, 6)];
            const p = w.parts[lit[Math.floor(r() * lit.length)] ?? 0]!;
            t = { x: p.x + (r() - 0.5) * 0.8, y: p.y + (r() - 0.5) * 0.6, z: p.z };
          } else t = { x: (r() - 0.5) * w.info.W, y: 0.4 + r() * (w.info.wallTop + 1.2), z: w.info.bounds.maxZ };
          s.fire(shotAt(w, 'standard', t, 0.6 + r() * 0.4, s.mods()).shot);
          for (let i = 0; i < 6000 && s.phase !== 'aim'; i++) s.step();
        }
        const f = roofDown(s) * 100;
        finals.push(f);
        if (f >= goal) wins++;
      }
      finals.sort((a, b) => a - b);
      console.log(`${id} ${style}: ${wins}/${N} clear (goal ${goal}%, ${shots} shots); median roof ${finals[Math.floor(N / 2)]!.toFixed(0)}%`);
    }
  }
});
