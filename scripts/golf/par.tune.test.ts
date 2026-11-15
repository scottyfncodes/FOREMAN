import { writeFileSync } from 'node:fs';
import { test } from 'vitest';
import { HOUSES, houseLevel } from '../../src/golf/game/houses';
import { shotAt } from '../../src/golf/game/solve';
import { PartState } from '../../src/golf/sim/parts';
import { Session } from '../../src/golf/sim/session';

// Greedy bot: each shot, tries a spread of targets on a copy of the house and keeps the one that
// brings the most down. Prints the destruction after each shot. Used to set goals, par and budgets.
// HOUSE=h3 limits it to one house; SHOTS sets how many shots to play (default: the house's par).
type Target = { x: number; y: number; z: number };

/** Share of the roof (tiles, decks, ridge) that is no longer up. */
export function roofDown(s: Session): number {
  let all = 0;
  let gone = 0;
  for (const p of s.world.parts) if (p.kind === 'tile' || p.kind === 'deck' || p.kind === 'ridge') { all++; if (p.state !== PartState.Intact) gone++; }
  return all ? gone / all : 0;
}
const metric = (s: Session): number => (process.env.METRIC === 'all' ? s.world.destruction() : roofDown(s) * 0.85 + s.world.destruction() * 0.15);

function play(id: string, targets: Target[]): Session {
  const h = HOUSES.find((q) => q.id === id)!;
  const lv = houseLevel(h);
  const E = process.env;
  const spec = { ...lv.house, ...(E.PUNCH ? { punch: Number(E.PUNCH) } : {}), ...(E.CASCADE ? { cascade: Number(E.CASCADE) } : {}), ...(E.STRENGTH ? { strength: Number(E.STRENGTH) } : {}) };
  const s = new Session({ ...lv, house: spec, shots: 99, par: 99, objectives: [{ kind: 'destruction', pct: 101 }] }, 7, { fastResolve: true });
  for (const t of targets) {
    s.fire(shotAt(s.world, 'standard', t, 1, s.mods()).shot);
    for (let i = 0; i < 6000 && s.phase !== 'aim'; i++) s.step();
  }
  return s;
}

function candidates(s: Session): Target[] {
  const w = s.world;
  const P = w.parts;
  const out: Target[] = [];
  const front = w.info.bounds.maxZ;
  for (const p of P) if (p.state === PartState.Intact && p.tags.includes('tank')) out.push({ x: p.x, y: p.y, z: p.z });
  for (const wp of w.weakPoints(5)) { const p = P[wp.part]; out.push({ x: p.x, y: p.y, z: p.z }); }
  const W = w.info.W;
  for (const y of [w.info.wallTop - 0.25, w.info.wallTop + 0.9, w.info.ridgeY - 0.6]) for (let x = -W / 2 + 0.3; x <= W / 2; x += 1.2) out.push({ x, y, z: y > w.info.wallTop ? 0 : front });
  for (const y of [0.9, 1.8, 3.6, 4.5, 6.3, 7.2]) {
    if (y > w.info.wallTop - 0.3) continue;
    for (let x = -W / 2 + 0.6; x <= W / 2 - 0.5; x += 1.5) out.push({ x, y, z: front });
  }
  return out;
}

test('par', () => {
  const only = process.env.HOUSE;
  const record: Record<string, number[][]> = {};
  for (const h of HOUSES) {
    const depth = Number(process.env.SHOTS ?? 7);
    if (only && h.id !== only) continue;
    const chosen: Target[] = [];
    const line: string[] = [];
    const t0 = Date.now();
    for (let k = 0; k < depth; k++) {
      const base = play(h.id, chosen);
      let best: Target | null = null;
      let bestPct = metric(base);
      for (const c of candidates(base)) {
        const pct = metric(play(h.id, [...chosen, c]));
        if (pct > bestPct + 1e-4) { bestPct = pct; best = c; }
      }
      if (!best) break;
      chosen.push(best);
      { const r = play(h.id, chosen); line.push(`roof ${(roofDown(r) * 100).toFixed(0)}/all ${(r.world.destruction() * 100).toFixed(0)}`); }
      line.push(`${(bestPct * 100).toFixed(0)}%@(${best.x.toFixed(1)},${best.y.toFixed(1)},${best.z.toFixed(1)})`);
      if (roofDown(play(h.id, chosen)) >= h.goal / 100 + 0.02) break;
    }
    record[h.id] = chosen.map((c) => [c.x, c.y, c.z]);
    console.log(`${h.id} ${h.name} parts ${play(h.id, []).world.parts.length} goal ${h.goal}: ${line.join(' ')}  [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
  }
  // WRITE=1 records the lines the par test replays.
  if (process.env.WRITE) writeFileSync('tests/golf-par.json', `${JSON.stringify(record, null, 1)}\n`);
});
