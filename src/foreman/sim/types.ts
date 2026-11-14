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
  /** Impact energy that punches through it. One full-power standard ball is 1. */
  tough: number;
  friction: number;
  bounce: number;
}

export const MATS: Record<Mat, MatDef> = {
  timber: { label: 'Timber', density: 420, crush: 90_000, bend: 420_000, shatter: 15, blast: 0.22, tough: 0.6, friction: 0.62, bounce: 0.08 },
  brick: { label: 'Brick', density: 1500, crush: 240_000, bend: 90_000, shatter: 4.2, blast: 0.34, tough: 1.5, friction: 0.74, bounce: 0.03 },
  concrete: { label: 'Concrete', density: 1500, crush: 520_000, bend: 1_500_000, shatter: 9, blast: 0.55, tough: 3.4, friction: 0.7, bounce: 0.03 },
  steel: { label: 'Steel', density: 1300, crush: 1_400_000, bend: 9_000_000, shatter: 1e9, blast: 1, tough: Infinity, friction: 0.5, bounce: 0.1 },
  glass: { label: 'Glass', density: 150, crush: 20_000, bend: 12_000, shatter: 1.6, blast: 0, tough: 0.03, friction: 0.4, bounce: 0.02 },
  gas: { label: 'Gas bottle', density: 380, crush: 200_000, bend: 1e9, shatter: 1e9, blast: 0, tough: 0.03, friction: 0.6, bounce: 0.15 },
  crate: { label: 'Supply crate', density: 300, crush: 60_000, bend: 1e9, shatter: 6, blast: 0, tough: 0.2, friction: 0.7, bounce: 0.05 },
};

export type BallKind = 'standard' | 'power' | 'heavy' | 'blast';

export interface BallDef {
  name: string;
  /** What it is for, in a few words. */
  hint: string;
  /** Impact energy at full power, in standard balls. */
  energy: number;
  /** Width of the hole it punches, metres. */
  hole: number;
  /** Radius of the explosion on contact, 0 for none. */
  blast: number;
  /** Launch speed at the lightest and the fullest pull, m/s. */
  minSpeed: number;
  maxSpeed: number;
  radius: number;
  color: number;
  accent: number;
}

export const BALLS: Record<BallKind, BallDef> = {
  standard: { name: 'Standard', hint: 'breaks timber, cracks brick', energy: 1, hole: 0.55, blast: 0, minSpeed: 13, maxSpeed: 34, radius: 0.13, color: 0xf7f4ea, accent: 0x9aa3a8 },
  power: { name: 'Power', hint: 'punches through brick', energy: 2.4, hole: 0.7, blast: 0, minSpeed: 14, maxSpeed: 40, radius: 0.13, color: 0xf2b705, accent: 0x1b1a18 },
  heavy: { name: 'Heavy', hint: 'cracks open concrete', energy: 4.6, hole: 0.95, blast: 0, minSpeed: 12, maxSpeed: 30, radius: 0.17, color: 0x3d4650, accent: 0xf2b705 },
  blast: { name: 'Charge', hint: 'goes off on contact', energy: 1, hole: 0.55, blast: 1.9, minSpeed: 13, maxSpeed: 32, radius: 0.14, color: 0xd6402b, accent: 0xf7f4ea },
};

export const BALL_ORDER: BallKind[] = ['standard', 'power', 'heavy', 'blast'];

export type Shape = 'box' | 'gable' | 'shedL' | 'shedR';

/** One piece of a building as a level describes it. x, y is the bottom-left corner. */
export interface MemberDef {
  mat: Mat;
  x: number;
  y: number;
  w: number;
  h: number;
  shape?: Shape;
  /** Starts damaged: already half way to breaking, and weaker for it. */
  cracked?: boolean;
  /** Sealed inside: a gas bottle (a pipe points at it) or a special ball (marked on the face). */
  hidden?: 'gas' | BallKind;
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
  /** Shots allowed. Out of shots with the job not done is a fail. */
  shots: number;
  /** Shots a good player needs. At par is two stars; under par, or a keystone at par, is three. */
  par: number;
  /** Special balls in the bag at the start. */
  kit?: Partial<Record<BallKind, number>>;
  /** One line of coaching shown under the job name. */
  brief: string;
  /** Taught the first time the level is opened. */
  lesson?: { title: string; body: string };
}

export type BreakCause = 'ball' | 'blast' | 'crush' | 'impact';

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
  | { t: 'found'; ball: BallKind; x: number; y: number }
  | { t: 'weaken'; id: number; x: number; y: number; mat: Mat; weak: number }
  | { t: 'clang'; x: number; y: number }
  | { t: 'protect'; id: number; x: number; y: number };
