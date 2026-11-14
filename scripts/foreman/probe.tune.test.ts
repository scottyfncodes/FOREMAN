import { test } from 'vitest';
import { LEVELS } from '../../src/foreman/sim/levels';
import { Sim, STANDING, GONE } from '../../src/foreman/sim/world';
import { BALLS, MATS, type BallKind } from '../../src/foreman/sim/types';

const only = process.env.LEVEL;
const pairs = process.env.PAIRS === '1';

function tag(sim: Sim, id: number): string {
  const m = sim.members[id];
  return `#${id} ${m.mat}${m.layer === 1 ? '*' : ''} [${(m.x - m.w / 2).toFixed(1)},${(m.y - m.h / 2).toFixed(1)} ${m.w}x${m.h}]`;
}

const BALL = (process.env.BALL ?? 'standard') as BallKind;

/** Shots are 'id' (centre of the piece) or 'id@fx,fy' (fraction across and up it), optionally ':ball'. */
function play(level: (typeof LEVELS)[number], shots: string[]): { sim: Sim; ok: boolean; t: number } {
  const sim = new Sim(level);
  let t = 0;
  for (const shot of shots) {
    const [where, ballName] = shot.split(':');
    const [idText, at] = where.split('@');
    const m = sim.members[Number(idText)];
    const [fx, fy] = at ? at.split(',').map(Number) : [0.5, 0.5];
    const ball = BALLS[(ballName as BallKind) ?? BALL];
    sim.hit(m.x - m.w / 2 + fx * m.w, m.y - m.h / 2 + fy * m.h, ball.energy, ball.hole, ball.blast);
    sim.run(20);
    t += sim.time;
  }
  return { sim, ok: true, t };
}

test('probe', () => {
  for (const level of LEVELS) {
    if (only && level.id !== only) continue;
    const base = new Sim(level);
    console.log(`\n=== ${level.id}: ${base.members.length} pieces, mass ${(base.totalMass / 1000).toFixed(1)} t, target ${(base.targetMass / 1000).toFixed(1)} t`);
    const loose = base.members.filter((m) => m.state !== STANDING);
    if (loose.length) console.log('  UNSTABLE AT REST:', loose.map((m) => tag(base, m.id)).join(' | '));
    const hot = [...base.members].sort((a, b) => b.util - a.util).slice(0, process.env.ALL ? 999 : 8);
    for (const m of hot) console.log(`  util ${m.util.toFixed(2)} ${m.mode ? 'bend ' : 'crush'} load ${(m.load / 1000).toFixed(1)}kN  ${tag(base, m.id)}`);
    const targets = base.members.filter((m) => isFinite(MATS[m.mat].tough) && !m.protect).map((m) => m.id);
    const t0 = Date.now();
    const singles: { id: number; p: number }[] = [];
    for (const id of targets) {
      const { sim } = play(level, [String(id)]);
      const p = sim.progress();
      singles.push({ id, p });
      const fell = sim.members.filter((m) => m.src >= 0 && m.state !== STANDING).length;
      const prot = sim.events.some((e) => e.t === 'protect');
      const picks = sim.events.filter((e) => e.t === 'found').length;
      if (p >= Number(process.env.MIN ?? 0) || prot) console.log(`  strike ${tag(base, id).padEnd(40)} -> ${(p * 100).toFixed(0).padStart(3)}% ${sim.cleared() ? 'CLEARED' : '       '} fell ${fell}/${level.members.length} t=${sim.time.toFixed(1)}s n=${sim.members.length}${prot ? ' PROTECT-HIT' : ''}${picks ? ` +${picks}` : ''}${sim.members.length > 400 ? ' MANY' : ''}`);
    }
    console.log(`  singles took ${Date.now() - t0} ms`);
    if (pairs) {
      const wins: string[] = [];
      for (const a of targets) for (const b of targets) {
        if (a === b) continue;
        const { sim, ok } = play(level, [String(a), String(b)]);
        if (ok && sim.cleared() && !sim.events.some((e) => e.t === 'protect')) wins.push(`${a}+${b}`);
      }
      console.log(`  pair wins (${wins.length}): ${wins.slice(0, 60).join(' ')}`);
    }
  }
  void GONE; void MATS;
}, 3_600_000);
