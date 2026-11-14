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
  d.box('timber', 2.8, 0, 0.45, 2.4);
  d.box('timber', 5.8, 0, 0.25, 2.4);
  d.pane(0.25, 0, 1.2, 2.4);
  d.infill('timber', 1.45, 0, 1.35, 2.4);
  d.infill('timber', 4.3, 0, 1.5, 2.4);
  d.box('timber', -0.2, 2.4, 6.45, 0.25);
  // Upper floor.
  for (const x of [0, 2.9, 5.8]) d.box('timber', x, 2.65, 0.25, 2.2);
  d.infill('timber', 0.25, 2.65, 1.5, 2.2);
  d.pane(1.75, 2.65, 1.15, 2.2);
  d.pane(3.15, 2.65, 1.15, 2.2);
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
    if (f < 2) d.box('brick', 3.3, y, 0.6, 2.7);
    for (const x of [0.6, 3.9]) {
      const w = f < 2 ? 2.7 : 6.0;
      if (f === 2 && x > 1) continue;
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

export const LEVELS: LevelDef[] = [hut(), frameHouse(), terrace()];

export function levelById(id: string): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}
