import { PALETTES, tankSpots, type HouseSpec } from '../sim/house';
import { house, oldPatch, reinforced, yardBasic, yardParty, type LevelDef, type Objective } from '../sim/levels';
import { Rng, hashString } from '../sim/math';
import type { Part } from '../sim/parts';
import type { SpecialId } from './rewards';

/**
 * The PLAY campaign: a street of houses, each bigger than the last. Every
 * house is a puzzle: bring a share of it down inside a shot budget. Par is what
 * a careful bot manages; stars reward matching and beating it. Each attempt
 * starts on a fresh house.
 * Special balls are hidden inside bricks, found by breaking them.
 */

export interface HouseDef {
  id: string;
  number: string;
  name: string;
  /** What this house is about, in one line. */
  hint: string;
  spec: HouseSpec;
  yard: LevelDef['yard'];
  /** Share of the roof (percent) that has to come down. The job is the roof on the ground. */
  goal: number;
  /** Shots allowed. Out of shots short of the goal is a fail, and a retry. */
  shots: number;
  /** Shots a good player needs: what a careful bot does with standard balls alone. */
  par: number;
  /** Special balls hidden in its bricks, and the kinds they can be. */
  hidden: number;
  pool: SpecialId[];
  wind?: { x: number; z: number };
}

const pal = (k: keyof typeof PALETTES): HouseSpec['palette'] => PALETTES[k] as HouseSpec['palette'];

/** How hard falling pieces hit in the campaign: collapses spread from piece to piece. */
export const CAMPAIGN_CASCADE = 2.2;

/** How big a hole a ball knocks in a campaign house: a standard ball takes out a patch of wall, not one brick. */
export const CAMPAIGN_PUNCH = 3.4;

/** Campaign houses stand closer to their limit: lose the right support and the load has nowhere to go. Each house sets its own. */
export const CAMPAIGN_STRENGTH = 0.5;

/** A campaign house: the cascade on, and this many gas bottles in the spots tankSpots picks. */
const rigged = (spec: HouseSpec, bottles: number, strength = CAMPAIGN_STRENGTH): HouseSpec => ({ ...spec, cascade: CAMPAIGN_CASCADE, punch: CAMPAIGN_PUNCH, strength, tanks: tankSpots(spec.width ?? 9, spec.storeys, bottles) });

export const HOUSES: HouseDef[] = [
  {
    id: 'h1',
    number: '01',
    name: 'Starter Cottage',
    hint: 'Touch where to hit, pull back for power, let go. A roof sits on its walls. This one barely does.',
    spec: rigged(house({ storeys: 1, porch: false, chimney: false, palette: pal('honey'), zones: [oldPatch('front', -4.5, 4.5, 0.6, 3.3)] }), 2, 0.4),
    yard: yardBasic,
    goal: 95,
    shots: 3,
    par: 1,
    hidden: 3,
    pool: ['power'],
  },
  {
    id: 'h2',
    number: '02',
    name: 'Porch House',
    hint: 'Two columns hold up the porch roof. The main roof needs its gable ends just as badly.',
    spec: rigged(house({ storeys: 1, chimney: false, palette: pal('rose') }), 3, 0.4),
    yard: yardBasic,
    goal: 95,
    shots: 4,
    par: 2,
    hidden: 3,
    pool: ['power', 'heavy'],
  },
  {
    id: 'h3',
    number: '03',
    name: 'Two Up',
    hint: 'A second storey. The roof is a long way up, and what holds it is a long way down.',
    spec: rigged(house({ storeys: 2, porch: false, chimney: false, palette: pal('sand') }), 4, 0.6),
    yard: yardBasic,
    goal: 95,
    shots: 6,
    par: 4,
    hidden: 4,
    pool: ['power', 'heavy', 'super'],
  },
  {
    id: 'h4',
    number: '04',
    name: 'Chimney Corner',
    hint: 'The chimney is the tallest thing here. It has to land somewhere.',
    spec: rigged(house({ storeys: 2, palette: pal('honey'), teeX: 3 }), 4, 0.6),
    yard: { ...yardBasic, trees: [{ x: -8, z: 7, s: 1 }] },
    goal: 95,
    shots: 6,
    par: 4,
    hidden: 4,
    pool: ['power', 'heavy', 'super'],
  },
  {
    id: 'h5',
    number: '05',
    name: 'Wide Load',
    hint: 'Wide walls, long roof. Half of it will go before the other half thinks about it.',
    spec: rigged(house({ storeys: 2, chimney: false, width: 10.8, palette: pal('classic'), zones: [oldPatch('front', -5.4, 5.4, 0.6, 2.1)] }), 5, 0.55),
    yard: yardBasic,
    goal: 95,
    shots: 4,
    par: 2,
    hidden: 5,
    pool: ['power', 'heavy', 'super', 'multi'],
  },
  {
    id: 'h6',
    number: '06',
    name: 'Deep End',
    hint: 'Deeper rooms, more inside to break. The roof does not care about the furniture.',
    spec: rigged(house({ storeys: 2, width: 10.8, depth: 7.2, palette: pal('slate') }), 6, 0.6),
    yard: yardParty,
    goal: 95,
    shots: 4,
    par: 2,
    hidden: 5,
    pool: ['power', 'heavy', 'super', 'multi'],
  },
  {
    id: 'h7',
    number: '07',
    name: 'Three Up',
    hint: 'Three storeys. Bring the bottom down and the top follows.',
    spec: rigged(house({ storeys: 3, porch: false, chimney: false, width: 10.8, depth: 7.2, palette: pal('rose') }), 7, 0.95),
    yard: yardBasic,
    goal: 95,
    shots: 4,
    par: 2,
    hidden: 6,
    pool: ['power', 'heavy', 'super', 'multi', 'blast'],
  },
  {
    id: 'h8',
    number: '08',
    name: 'Town House',
    hint: 'The lower courses are reinforced. Break them with weight, or start higher up.',
    spec: rigged(house({ storeys: 3, chimney: false, width: 12.6, depth: 7.2, palette: pal('sand'), zones: [reinforced('front', -6.3, 6.3, 0.6, 1.5)] }), 7, 0.95),
    yard: yardParty,
    goal: 95,
    shots: 4,
    par: 2,
    hidden: 6,
    pool: ['power', 'heavy', 'super', 'multi', 'blast'],
  },
  {
    id: 'h9',
    number: '09',
    name: 'The Manor',
    hint: 'The corners carry the most, and the old brick at the front corners is the weak spot.',
    spec: rigged(house({ storeys: 3, width: 12.6, depth: 7.2, palette: pal('classic'), zones: [oldPatch('front', -6.3, -4.2, 0.6, 9), oldPatch('front', 4.2, 6.3, 0.6, 9)] }), 8, 0.95),
    yard: yardParty,
    goal: 95,
    shots: 4,
    par: 2,
    hidden: 7,
    pool: ['power', 'heavy', 'super', 'multi', 'blast'],
  },
  {
    id: 'h10',
    number: '10',
    name: 'Demo Day',
    hint: 'The biggest house on the street, a breeze from the left, and every trick you have learned.',
    spec: rigged(house({ storeys: 3, width: 14.4, depth: 8.4, palette: pal('honey'), zones: [reinforced('front', -7.2, 7.2, 0.6, 1.2), oldPatch('left', -8.1, -0.3, 0.6, 9)] }), 9, 1.0),
    yard: yardParty,
    goal: 95,
    shots: 4,
    par: 2,
    hidden: 8,
    pool: ['power', 'heavy', 'super', 'multi', 'blast'],
    wind: { x: 0.4, z: 0 },
  },
];

export function getHouse(id: string): HouseDef | undefined {
  return HOUSES.find((h) => h.id === id);
}

export function houseObjective(h: HouseDef): Objective {
  return { kind: 'roof', pct: h.goal };
}

/**
 * Stars for a house: one for reaching the goal inside the shot budget, two for doing it at
 * par, three for beating par (or for the single shot, where par is one).
 */
export function houseStars(h: HouseDef, used: number): number {
  if (used < h.par || (used === h.par && h.par === 1)) return 3;
  return used === h.par ? 2 : 1;
}

/** The house as a level the session can run: a shot budget and one goal. */
export function houseLevel(h: HouseDef): LevelDef {
  return {
    id: h.id,
    mode: 'house',
    number: h.number,
    title: h.name,
    blurb: h.hint,
    house: h.spec,
    yard: h.yard,
    shots: h.shots,
    par: h.par,
    objectives: [houseObjective(h)],
    balls: {},
    powerups: {},
    wind: h.wind,
  };
}

/**
 * Which bricks hide a special ball, and which ball. Fixed per house (seeded
 * by its id), so a ball stays in the same brick across visits and rebuilds.
 * Mostly in the walls the player can see; never in the concrete footing.
 */
export function hiddenBalls(h: HouseDef, parts: readonly Part[]): Map<number, SpecialId> {
  const rng = new Rng(hashString(`hidden:${h.id}`));
  const front = parts.filter((p) => p.kind === 'brick' && p.wall === 'front' && p.mat !== 'foundation');
  const sides = parts.filter((p) => p.kind === 'brick' && (p.wall === 'left' || p.wall === 'right') && p.mat !== 'foundation');
  const out = new Map<number, SpecialId>();
  let guard = 0;
  while (out.size < h.hidden && guard++ < 500) {
    const list = rng.next() < 0.75 || !sides.length ? front : sides;
    const p = list[Math.floor(rng.next() * list.length)];
    const ball = h.pool[Math.floor(rng.next() * h.pool.length)];
    if (p && ball && !out.has(p.id)) out.set(p.id, ball);
  }
  return out;
}
