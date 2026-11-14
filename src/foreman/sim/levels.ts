import type { LevelDef, Mat, MemberDef, PipeDef } from './types';

/** Small drafting kit: every helper takes the bottom-left corner. */
class Draft {
  readonly members: MemberDef[] = [];
  readonly pipes: PipeDef[] = [];
  box(mat: Mat, x: number, y: number, w: number, h: number, extra: Partial<MemberDef> = {}): number {
    this.members.push({ mat, x: r(x), y: r(y), w: r(w), h: r(h), ...extra });
    return this.members.length - 1;
  }
  /** Infill panel: light cladding set back from the frame. */
  infill(mat: Mat, x: number, y: number, w: number, h: number, extra: Partial<MemberDef> = {}): number {
    return this.box(mat, x, y, w, h, { layer: 1, ...extra });
  }
  pane(x: number, y: number, w: number, h: number): number {
    return this.box('glass', x, y, w, h, { layer: 1 });
  }
  roof(mat: Mat, x: number, y: number, w: number, h: number, shape: 'gable' | 'shedL' | 'shedR' = 'gable'): number {
    return this.box(mat, x, y, w, h, { shape });
  }
  pipe(x0: number, y0: number, x1: number, y1: number, host?: number): void {
    this.pipes.push({ x0, y0, x1, y1, host });
  }
}

const r = (v: number): number => Math.round(v * 1000) / 1000;

function hut(): LevelDef {
  const d = new Draft();
  d.box('timber', 0.5, 0, 0.3, 1.8);
  d.box('timber', 2.8, 0, 0.3, 1.8);
  d.box('timber', 0, 1.8, 3.6, 0.25);
  d.box('timber', 0, 2.05, 0.3, 1.7);
  d.box('timber', 3.3, 2.05, 0.3, 1.7);
  d.infill('timber', 0.3, 2.05, 1.0, 1.7);
  d.pane(1.3, 2.05, 1.0, 1.7);
  d.infill('timber', 2.3, 2.05, 1.0, 1.7);
  d.box('timber', 0, 3.75, 3.6, 0.2);
  d.roof('timber', -0.3, 3.95, 4.2, 1.0);
  return {
    id: 'hut', name: 'Watchman\'s Hut', kind: 'Timber hut on stilts', members: d.members, lineY: 2.9, shots: 3, par: 1,
    brief: 'Get everything below the red line.',
    lesson: { title: 'Take the shot', body: 'Touch the spot you want to hit, pull back for power, let go. Knock out what holds the hut up and the rest comes down with it.' },
  };
}


function frameHouse(): LevelDef {
  const d = new Draft();
  // Ground floor: a stout post in the middle, two thin ones at the ends.
  d.box('timber', 0, 0, 0.25, 2.4);
  d.box('timber', 2.7, 0, 0.6, 2.4);
  d.box('timber', 5.8, 0, 0.25, 2.4);
  d.pane(0.25, 0, 1.2, 2.4);
  d.infill('timber', 1.45, 0, 1.25, 2.4);
  d.infill('timber', 4.3, 0, 1.5, 2.4);
  d.box('timber', -0.2, 2.4, 6.45, 0.25);
  // Upper floor.
  d.box('timber', 0, 2.65, 0.25, 2.2);
  d.box('timber', 2.8, 2.65, 0.45, 2.2);
  d.box('timber', 5.8, 2.65, 0.25, 2.2);
  d.infill('timber', 0.25, 2.65, 1.5, 2.2);
  d.pane(1.75, 2.65, 1.05, 2.2);
  d.pane(3.25, 2.65, 1.05, 2.2);
  d.infill('timber', 4.3, 2.65, 1.5, 2.2);
  d.box('timber', -0.2, 4.85, 6.45, 0.2);
  d.roof('timber', -0.5, 5.05, 7.05, 1.6);
  return {
    id: 'frame', name: 'Frame House', kind: 'Two-storey timber house', members: d.members, lineY: 3.7, shots: 3, par: 1,
    brief: 'One post is doing more than its share.',
    lesson: { title: 'Loads move', body: 'Take a support away and its neighbours carry the difference. If that is more than they can take, they crack, then go. Aim at a piece to see what it is holding.' },
  };
}

function terrace(): LevelDef {
  const d = new Draft();
  const W = 7.2;
  // Brick party walls either side, one brick pier in the middle, timber floors.
  for (let f = 0; f < 3; f++) {
    const y = f * 2.9;
    d.box('brick', 0, y, 0.9, 2.7);
    d.box('brick', W - 0.9, y, 0.9, 2.7);
    d.box('brick', 3.3, y, 0.6, 2.7);
    for (const x of [0.9, 3.9]) {
      const w = 2.4;
      d.infill('brick', x, y, w, 0.9);
      d.pane(x + w / 2 - 0.6, y + 0.9, 1.2, 1.3);
    }
    d.box('timber', 0, y + 2.7, W, 0.2);
  }
  d.roof('timber', -0.2, 8.7, W + 0.4, 1.3);
  return {
    id: 'terrace', name: 'Mill Row', kind: 'Brick terrace, timber floors', members: d.members, lineY: 4.0, shots: 3, par: 1,
    brief: 'A ball only cracks brick. Sometimes that is enough.',
    lesson: { title: 'Weaken it', body: 'A standard ball cracks brick: up to half its strength gone. A pier already near its limit cannot take that. LOADS shows which one.' },
  };
}

function stack(): LevelDef {
  const d = new Draft();
  // The job: a narrow brick tower on two legs.
  for (let f = 0; f < 4; f++) {
    const y = f * 2.5;
    d.box('brick', 0, y, 0.6, 2.2);
    d.box('brick', 2.4, y, 0.6, 2.2);
    if (f > 0) { d.infill('brick', 0.6, y, 1.8, 0.8); d.pane(1.0, y + 0.8, 1.0, 1.1); }
    d.box('concrete', -0.1, y + 2.2, 3.2, 0.3);
  }
  d.box('steel', 0.4, 10, 2.2, 1.0);
  // Next door: a house that has to still be there afterwards.
  const nx = 4.1;
  for (const p of [true]) {
    d.box('brick', nx, 0, 0.5, 2.6, { protect: p });
    d.box('brick', nx + 3.5, 0, 0.5, 2.6, { protect: p });
    d.infill('brick', nx + 0.5, 0, 3.0, 0.9, { protect: p });
    d.pane(nx + 1.3, 0.9, 1.4, 1.2);
    d.box('timber', nx - 0.1, 2.6, 4.2, 0.25, { protect: p });
    d.box('timber', nx - 0.3, 2.85, 4.6, 1.3, { protect: p, shape: 'gable' });
  }
  return {
    id: 'stack', name: 'Tank Tower', kind: 'Brick tower beside a house', members: d.members, lineY: 4.2, shots: 3, par: 1,
    brief: 'Drop the tower. Do not touch the house next door.',
    lesson: { title: 'Mind the neighbour', body: 'Cut a tower at the ground and it comes straight down. Break it higher up and the top topples over. The house with the blue outline is not yours to hit.' },
  };
}

function shop(): LevelDef {
  const d = new Draft();
  const W = 6.6;
  for (let f = 0; f < 2; f++) {
    const y = f * 3.1;
    d.box('brick', -0.1, y, 0.8, 2.7);
    d.box('brick', 2.7, y, 1.2, 2.7);
    d.box('brick', 5.9, y, 0.8, 2.7);
    d.box('concrete', -0.1, y + 2.7, W + 0.2, 0.4);
  }
  // Ground floor: a blank wall on the left, shop window on the right.
  const wall = d.infill('brick', 0.7, 0, 2.0, 2.7, { hidden: 'gas' });
  d.infill('brick', 3.9, 0, 2.0, 0.7);
  d.pane(3.9, 0.7, 2.0, 2.0);
  for (const x of [0.7, 3.9]) { d.infill('brick', x, 3.1, 2.0, 0.9); d.pane(x + 0.4, 4.0, 1.2, 1.3); }
  d.roof('timber', -0.3, 6.2, W + 0.6, 1.5);
  d.pipe(-1.6, 0.15, 0.3, 0.15);
  d.pipe(0.3, 0.15, 0.3, 1.2);
  d.pipe(0.3, 1.2, 1.4, 1.2, wall);
  return {
    id: 'shop', name: 'Corner Shop', kind: 'Brick shop, concrete floors', members: d.members, pipes: d.pipes, lineY: 3.8, shots: 2, par: 1,
    brief: 'No bottles in sight. Follow the yellow pipe.',
    lesson: { title: 'Follow the pipe', body: 'A yellow pipe always ends at a gas bottle, even when the bottle is sealed behind a wall. Put a ball through that wall and it goes off.' },
  };
}

function apartments(): LevelDef {
  const d = new Draft();
  const xs = [0, 3.2, 6.4, 9.6];
  for (let f = 0; f < 4; f++) {
    const y = f * 3.0;
    xs.forEach((x) => d.box('concrete', x, y, 0.45, 2.75));
    for (let b = 0; b < 3; b++) {
      const x = xs[b] + 0.45;
      if (f === 0 && b === 1) continue;
      d.infill('brick', x, y, 2.75, 0.9, f === 2 && b === 1 ? { hidden: 'heavy' } : {});
      d.pane(x + 0.5, y + 0.9, 1.75, 1.3);
    }
    d.box('concrete', -0.2, y + 2.75, 10.45, 0.25);
  }
  return {
    id: 'flats', name: 'Harbour Flats', kind: 'Concrete apartment block', members: d.members, lineY: 5.0, shots: 4, par: 2,
    brief: 'Concrete laughs at a standard ball. Find a better one.',
    lesson: { title: 'Hidden balls', body: 'A painted ring marks a piece with a special ball sealed inside. Break it open and the ball is yours for this job. The Heavy ball goes through concrete.' },
  };
}

function warehouse(): LevelDef {
  const d = new Draft();
  const xs = [0, 4, 8, 12];
  for (const x of xs) {
    d.box('brick', x - 0.1, 0, 0.7, 1.2);
    d.box('steel', x + 0.1, 1.2, 0.3, 4.0);
  }
  d.box('steel', -0.3, 5.2, 13.1, 0.3);
  // Sawtooth roof.
  for (let i = 0; i < 3; i++) d.roof('steel', xs[i] + 0.2, 5.5, 3.9, 1.3, 'shedL');
  // Gas store along the back wall, and a locked cage of supplies.
  for (const x of [0.8, 2.6, 4.9, 9.2, 11.1]) d.box('gas', x, 0, 0.4, 0.7);
  d.box('crate', 6.1, 0, 0.7, 0.7);
  for (let b = 0; b < 3; b++) { d.infill('steel', xs[b] + 0.4, 1.2, 3.7, 1.2); d.pane(xs[b] + 0.4, 2.4, 3.7, 1.0); }
  return {
    id: 'shed', name: 'Dockside Shed', kind: 'Steel warehouse on brick piers', members: d.members, lineY: 4.9, shots: 2, par: 1,
    brief: 'A ball bounces off steel. Something else in here will not.',
    lesson: { title: 'Chain it', body: 'Steel shrugs off golf balls. But a gas bottle goes off when it is hit, sets off every bottle near it, and the piers under this frame are only brick.' },
  };
}

function exchange(): LevelDef {
  const d = new Draft();
  const xs = [0, 3.4, 6.8, 10.2];
  // A tall brick arcade at street level carries six concrete floors.
  for (const x of xs) d.box('brick', x - 0.95, 0, 2.4, 3.6);
  d.box('concrete', -1.0, 3.6, 12.4, 0.4);
  for (let f = 0; f < 5; f++) {
    const y = 4.0 + f * 2.9;
    for (const x of xs) d.box('concrete', x - 0.05, y, 0.55, 2.7);
    for (let b = 0; b < 3; b++) {
      const x = xs[b] + 0.5;
      const mark = f === 1 && b === 2 ? { hidden: 'blast' as const } : {};
      d.infill('brick', x, y, 2.85, 0.8, mark);
      d.pane(x + 0.35, y + 0.8, 2.15, 1.4);
    }
    d.box('concrete', -0.2, y + 2.7, 10.9, 0.2);
  }
  d.box('steel', 3.4, 18.5, 3.8, 0.8);
  return {
    id: 'exchange', name: 'Exchange House', kind: 'Six-storey office block', members: d.members, lineY: 7.0, shots: 4, par: 2,
    brief: 'Five floors of concrete on four brick legs.',
    lesson: { title: 'Soft storey', body: 'All that weight comes down through the columns of the lowest floors. There is a Charge ball in this building. Put it where the load is greatest.' },
  };
}

export const LEVELS: LevelDef[] = [hut(), frameHouse(), terrace(), stack(), warehouse(), shop(), apartments(), exchange()];

export function levelById(id: string): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}
