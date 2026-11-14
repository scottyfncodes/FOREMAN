import { test } from 'vitest';
import { LEVELS } from '../../src/foreman/sim/levels';
import { Session } from '../../src/foreman/game/session';
import type { BallKind } from '../../src/foreman/sim/types';

// SEQ="flats:26@0.5,0.5:standard;0@0.5,0.3:heavy|frame:1@0.5,0.2" plays shot sequences through the real session.
test('seq', () => {
  for (const spec of (process.env.SEQ ?? '').split('|').filter(Boolean)) {
    const [id, ...rest] = spec.split(':');
    const shots = rest.join(':').split(';');
    const s = new Session(LEVELS.find((l) => l.id === id)!);
    const log: string[] = [];
    for (const shot of shots) {
      const [where, ball = 'standard'] = shot.split(':');
      const [idx, at = '0.5,0.5'] = where.split('@');
      const m = idx === 'H' ? s.sim.members.find((q) => q.hidden && q.hidden !== 'gas' && q.state === 0)! : s.sim.members[Number(idx)];
      if (idx === 'H') log.push(`(H=${m.id})`);
      const [fx, fy] = at.split(',').map(Number);
      const ok = s.fire(m.x - m.w / 2 + fx * m.w, m.y - m.h / 2 + fy * m.h, 1, ball as BallKind);
      let effect = '';
      for (let i = 0; i < 4000 && (s.status === 'flight' || s.status === 'busy'); i++) { s.step(); for (const e of s.frame) if (e.t === 'strike') effect = e.effect; s.frame.length = 0; }
      log.push(`${shot}${ok ? '' : ' REFUSED'} -> ${effect} ${(s.sim.progress() * 100).toFixed(0)}% ${s.status} chain ${s.bestChain}${s.keystone ? ' KEY' : ''}`);
    }
    console.log(`${id}: ${log.join(' | ')} stars ${s.stars} bag ${JSON.stringify(s.bag)} margin ${(s.sim.aboveMass() / s.sim.targetMass).toFixed(3)}`);
  }
});
