import { test } from 'vitest';
import { HOUSES, houseLevel } from '../../src/golf/game/houses';
import { World } from '../../src/golf/sim/world';

// The weakest walls each house can have and still stand untouched (no creak, nothing falling).
test('stable', () => {
  for (const h of HOUSES) {
    const lv = houseLevel(h);
    let found = 0;
    for (let k = 4; k <= 30; k++) {
      const strength = k * 0.05;
      const w = new World({ ...lv.house, strength }, lv.yard, 7);
      for (let i = 0; i < 360; i++) w.step();
      if (!w.drainEvents().some((e) => e.t === 'creak' || e.t === 'release' || e.t === 'break')) { found = strength; break; }
    }
    console.log(`${h.id} stands from strength ${found.toFixed(2)}`);
  }
});
