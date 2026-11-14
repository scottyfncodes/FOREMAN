/**
 * FOREMAN simulation data types. Units are metres, kilograms, seconds and newtons, with
 * gravity at 10 m/s². The world is a side-on section: x runs right, y runs up, ground is y = 0.
 */
export type Mat = 'timber' | 'brick' | 'concrete' | 'steel' | 'glass' | 'gas' | 'crate';

export interface MatDef {
  /** Display name. */
  label: string;
  /** kg per square metre of section. */
  density: number;
  /** Bearing strength: newtons per metre of contact width. */
  crush: number;
  /** Bending strength: newton-metres per square metre of depth (thickness squared). */
  bend: number;
  /** Impact speed (impulse over own mass, m/s) that shatters a piece outright. */
  shatter: number;
  /** How close to a blast it survives: 0 breaks at the edge of the radius, 1 never breaks. */
  blast: number;
  /** Charges it takes. 0 means charges cannot cut it. */
  hp: number;
  friction: number;
  bounce: number;
}

export const MATS: Record<Mat, MatDef> = {
  timber: { label: 'Timber', density: 420, crush: 90_000, bend: 420_000, shatter: 15, blast: 0.22, hp: 1, friction: 0.62, bounce: 0.08 },
  brick: { label: 'Brick', density: 1500, crush: 150_000, bend: 90_000, shatter: 8.5, blast: 0.34, hp: 1, friction: 0.74, bounce: 0.03 },
  concrete: { label: 'Concrete', density: 2200, crush: 520_000, bend: 1_500_000, shatter: 17, blast: 0.55, hp: 2, friction: 0.7, bounce: 0.03 },
  steel: { label: 'Steel', density: 1300, crush: 1_400_000, bend: 9_000_000, shatter: 1e9, blast: 1, hp: 0, friction: 0.5, bounce: 0.1 },
  glass: { label: 'Glass', density: 150, crush: 20_000, bend: 12_000, shatter: 1.6, blast: 0, hp: 1, friction: 0.4, bounce: 0.02 },
  gas: { label: 'Gas bottle', density: 380, crush: 200_000, bend: 1e9, shatter: 1e9, blast: 0, hp: 1, friction: 0.6, bounce: 0.15 },
  crate: { label: 'Supply crate', density: 300, crush: 60_000, bend: 1e9, shatter: 6, blast: 0, hp: 1, friction: 0.7, bounce: 0.05 },
};

export type Shape = 'box' | 'gable' | 'shedL' | 'shedR';

/** One piece of a building as a level describes it. x, y is the bottom-left corner. */
export interface MemberDef {
  mat: Mat;
  x: number;
  y: number;
  w: number;
  h: number;
  shape?: Shape;
  /** Starts damaged: half strength, and concrete needs one charge fewer. */
  cracked?: boolean;
  /** A gas bottle sealed inside. A pipe on the level points at it. */
  hidden?: 'gas';
  /** Part of a neighbour that must be left alone. */
  protect?: boolean;
  /** Visual depth class: 0 frame, 1 infill set back from the frame, 2 proud of the frame. */
  layer?: number;
}

/** A length of pipe: decoration that points at hidden gas. Disappears with its host piece. */
export interface PipeDef {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Index into the level's members. The pipe is drawn while that piece stands. */
  host?: number;
}

export interface LevelDef {
  id: string;
  name: string;
  /** Short caption: what kind of building it is. */
  kind: string;
  members: MemberDef[];
  pipes?: PipeDef[];
  /** Everything has to end up below this height. */
  lineY: number;
  /** Charges handed out. */
  charges: number;
  /** Charges for three stars. Two stars is one more. */
  par: number;
  /** One line of coaching shown under the job name. */
  brief: string;
  /** Taught the first time the level is opened. */
  lesson?: { title: string; body: string };
}

export type BreakCause = 'charge' | 'blast' | 'crush' | 'impact';

export type SimEvent =
  | { t: 'break'; id: number; cause: BreakCause; mat: Mat; x: number; y: number; w: number; h: number; a: number; vx: number; vy: number; standing: boolean; mass: number; protect: boolean }
  | { t: 'loose'; ids: number[]; why: 'unsupported' | 'tip'; mass: number; x: number; y: number }
  | { t: 'snap'; id: number; x: number; y: number; mat: Mat }
  | { t: 'crack'; id: number; x: number; y: number; mat: Mat }
  | { t: 'strain'; id: number; x: number; y: number; mode: 'crush' | 'snap' }
  | { t: 'impact'; x: number; y: number; j: number; mat: Mat }
  | { t: 'boom'; x: number; y: number; r: number }
  | { t: 'fuse'; id: number; x: number; y: number }
  | { t: 'reveal'; id: number; x: number; y: number }
  | { t: 'pickup'; x: number; y: number }
  | { t: 'protect'; id: number; x: number; y: number };
