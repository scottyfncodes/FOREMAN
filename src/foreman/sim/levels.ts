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
    id: 'hut', name: 'Watchman\'s Hut', kind: 'Timber hut on stilts', members: d.members, lineY: 2.9, charges: 2, par: 1,
    brief: 'Bring everything below the line.',
    lesson: { title: 'Set a charge', body: 'Tap a piece of the building, then press BLAST. Whatever it was holding up comes down with it.' },
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
    id: 'frame', name: 'Frame House', kind: 'Two-storey timber house', members: d.members, lineY: 2.9, charges: 3, par: 1,
    brief: 'One post is doing more than its share.',
    lesson: { title: 'Loads move', body: 'Take a support away and its neighbours carry the difference. If that is more than they can take, they crack, then go.' },
  };
}

function terrace(): LevelDef {
  const d = new Draft();
  const W = 7.2;
  // Brick party walls either side, one brick pier in the middle, timber floors.
  for (let f = 0; f < 3; f++) {
    const y = f * 2.9;
    d.box('brick', 0, y, 0.6, 2.7);
    d.box('brick', W - 0.6, y, 0.6, 2.7);
    d.box('brick', 3.3, y, 0.6, 2.7);
    for (const x of [0.6, 3.9]) {
      const w = 2.7;
      d.infill('brick', x, y, w, 0.9);
      d.pane(x + w / 2 - 0.6, y + 0.9, 1.2, 1.3);
    }
    d.box('timber', 0, y + 2.7, W, 0.2);
  }
  d.roof('timber', -0.2, 8.7, W + 0.4, 1.3);
  return {
    id: 'terrace', name: 'Mill Row', kind: 'Brick terrace, timber floors', members: d.members, lineY: 3.3, charges: 3, par: 1,
    brief: 'Brick is heavy. Timber floors only reach so far.',
    lesson: { title: 'Spans snap', body: 'A floor stretched between two supports bends. Take out the support in the middle and the span doubles. Too far and it snaps.' },
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
  const nx = 5.2;
  for (const p of [true]) {
    d.box('brick', nx, 0, 0.5, 2.6, { protect: p });
    d.box('brick', nx + 3.5, 0, 0.5, 2.6, { protect: p });
    d.infill('brick', nx + 0.5, 0, 3.0, 0.9, { protect: p });
    d.pane(nx + 1.3, 0.9, 1.4, 1.2);
    d.box('timber', nx - 0.1, 2.6, 4.2, 0.25, { protect: p });
    d.box('timber', nx - 0.3, 2.85, 4.6, 1.3, { protect: p, shape: 'gable' });
  }
  return {
    id: 'stack', name: 'Tank Tower', kind: 'Brick tower beside a house', members: d.members, lineY: 4.2, charges: 2, par: 1,
    brief: 'Drop the tower. Do not touch the house next door.',
    lesson: { title: 'Pick a direction', body: 'A building falls toward the support it lost. The house with the blue outline is not yours to break.' },
  };
}

function shop(): LevelDef {
  const d = new Draft();
  const W = 6.6;
  for (let f = 0; f < 2; f++) {
    const y = f * 3.1;
    d.box('brick', -0.1, y, 0.8, 2.8);
    d.box('brick', 3.0, y, 0.6, 2.8);
    d.box('brick', 5.9, y, 0.8, 2.8);
    d.box('concrete', -0.1, y + 2.8, W + 0.2, 0.3);
  }
  // Ground floor: a blank wall on the left, shop window on the right.
  const wall = d.infill('brick', 0.7, 0, 2.3, 2.8, { hidden: 'gas' });
  d.infill('brick', 3.6, 0, 2.3, 0.7);
  d.pane(3.6, 0.7, 2.3, 2.1);
  for (const x of [0.7, 3.6]) { d.infill('brick', x, 3.1, 2.3, 0.9); d.pane(x + 0.6, 4.0, 1.2, 1.3); }
  d.roof('timber', -0.3, 6.2, W + 0.6, 1.5);
  d.pipe(-1.6, 0.15, 0.3, 0.15);
  d.pipe(0.3, 0.15, 0.3, 1.2);
  d.pipe(0.3, 1.2, 1.5, 1.2, wall);
  return {
    id: 'shop', name: 'Corner Shop', kind: 'Brick shop, concrete floors', members: d.members, pipes: d.pipes, lineY: 3.5, charges: 1, par: 1,
    brief: 'One charge. Follow the yellow pipe.',
    lesson: { title: 'Gas does the work', body: 'A yellow pipe always ends at a gas bottle. Break the wall it runs into and the bottle goes off, taking everything close with it.' },
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
      d.infill('brick', x, y, 2.75, 0.9);
      d.pane(x + 0.5, y + 0.9, 1.75, 1.3);
    }
    d.box('concrete', -0.2, y + 2.75, 10.45, 0.25);
  }
  return {
    id: 'flats', name: 'Harbour Flats', kind: 'Concrete apartment block', members: d.members, lineY: 5.0, charges: 3, par: 2,
    brief: 'Concrete takes two charges. Or one, and enough weight.',
    lesson: { title: 'Weaken, then load', body: 'The first charge on concrete only cracks it. Cracked concrete holds less than half. Find the column that is already cracked.' },
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
  for (const x of [0.8, 3.0, 5.0, 7.0, 9.0, 11.2]) d.box('gas', x, 0, 0.4, 0.7);
  d.box('crate', 6.0, 0, 0.7, 0.7);
  for (let b = 0; b < 3; b++) { d.infill('steel', xs[b] + 0.4, 1.2, 3.7, 1.2); d.pane(xs[b] + 0.4, 2.4, 3.7, 1.0); }
  return {
    id: 'shed', name: 'Dockside Shed', kind: 'Steel warehouse on brick piers', members: d.members, lineY: 4.4, charges: 2, par: 1,
    brief: 'Charges will not cut steel. Something else in here will.',
    lesson: { title: 'Chain it', body: 'Steel shrugs off charges. But a gas bottle sets off every bottle near it, and the piers under the frame are only brick.' },
  };
}

export const LEVELS: LevelDef[] = [hut(), frameHouse(), terrace(), stack(), shop(), apartments(), warehouse()];

export function levelById(id: string): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}
