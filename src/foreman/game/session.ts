import { DT, Sim, STANDING } from '../sim/world';
import { BALLS, type BallKind, type LevelDef, type SimEvent } from '../sim/types';
import { flightTo, type Flight } from './shot';

export type Status = 'aim' | 'flight' | 'busy' | 'won' | 'lost';
export type Tier = 'big' | 'keystone';
export type LossReason = 'standing' | 'neighbour';
export type Effect = 'miss' | 'none' | 'weaken' | 'break' | 'gas' | 'blast' | 'short';

export type GameEvent =
  | SimEvent
  | { t: 'launch'; flight: Flight }
  | { t: 'strike'; effect: Effect; x: number; y: number; z: number; ball: BallKind; id: number }
  | { t: 'tier'; tier: Tier }
  | { t: 'chain'; n: number; x: number; y: number }
  | { t: 'bag'; ball: BallKind; n: number }
  | { t: 'settled'; status: Status };

/** Share of the building one shot has to bring down to count as each tier. */
export const BIG_DROP = 0.22;
export const KEYSTONE = 0.5;

/**
 * One star for getting it down inside the shot budget, two for doing it at par, three for
 * beating par or for a par finish that included a keystone (one shot, half the building).
 */
export function starsFor(level: LevelDef, used: number, keystone: boolean): number {
  if (used < level.par) return 3;
  if (used === level.par) return keystone ? 3 : 2;
  return 1;
}

/**
 * One attempt at a job: the shot budget, the ball bag, the chain counter, the score and the
 * verdict. It reads the simulation only through its events, so nothing here can fake a collapse.
 */
export class Session {
  readonly level: LevelDef;
  readonly sim: Sim;
  readonly teeX: number;
  shotsLeft: number;
  used = 0;
  score = 0;
  status: Status = 'aim';
  loss: LossReason | null = null;
  /** Special balls in the bag. Standard balls are only limited by the shot budget. */
  readonly bag: Record<BallKind, number> = { standard: Infinity, power: 0, heavy: 0, blast: 0 };
  /** Links in the current shot's chain: every failure the ball did not cause directly. */
  chain = 0;
  bestChain = 0;
  /** Share of the building the current shot has brought down so far. */
  felled = 0;
  tier: Tier | null = null;
  keystone = false;
  neighbourHit = false;
  flight: Flight | null = null;
  flightT = 0;
  private idle = 0;
  /** Everything that happened in the last step, for the renderer, sound and HUD. */
  readonly frame: GameEvent[] = [];

  constructor(level: LevelDef) {
    this.level = level;
    this.sim = new Sim(level);
    this.sim.events.length = 0;
    this.shotsLeft = level.shots;
    for (const k of Object.keys(level.kit ?? {}) as BallKind[]) this.bag[k] = level.kit?.[k] ?? 0;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const m of level.members) { minX = Math.min(minX, m.x); maxX = Math.max(maxX, m.x + m.w); }
    this.teeX = (minX + maxX) / 2;
  }

  get multiplier(): number {
    return 1 + Math.min(this.chain, 20) * 0.25;
  }

  get stars(): number {
    return this.status === 'won' ? starsFor(this.level, this.used, this.keystone) : 0;
  }

  /** The flight a shot would take, without taking it. */
  plan(x: number, y: number, power: number, ball: BallKind): Flight {
    return flightTo(this.teeX, x, y, power, ball);
  }

  /** What that flight would do where it lands. For the aim guide. */
  foresee(f: Flight): { id: number; effect: Effect } {
    if (!f.reach) return { id: -1, effect: 'short' };
    return this.sim.preview(f.x, f.y, f.energy, BALLS[f.ball].blast);
  }

  canFire(ball: BallKind): boolean {
    return this.status === 'aim' && this.shotsLeft > 0 && this.bag[ball] > 0;
  }

  fire(x: number, y: number, power: number, ball: BallKind): boolean {
    if (!this.canFire(ball)) return false;
    this.shotsLeft -= 1;
    this.used += 1;
    if (ball !== 'standard') { this.bag[ball] -= 1; this.frame.push({ t: 'bag', ball, n: this.bag[ball] }); }
    this.chain = 0;
    this.felled = 0;
    this.tier = null;
    this.flight = flightTo(this.teeX, x, y, power, ball);
    this.flightT = 0;
    this.status = 'flight';
    this.frame.push({ t: 'launch', flight: this.flight });
    return true;
  }

  /** Advances one fixed step. */
  step(): void {
    if (this.status === 'flight' && this.flight) {
      this.flightT += DT;
      if (this.flightT >= this.flight.time) this.land(this.flight);
      return;
    }
    if (this.status !== 'busy') return;
    if (this.idle > 0) {
      // Nothing was set moving: give the miss a beat, then hand the turn back.
      this.idle -= DT;
      if (this.idle <= 0) this.resolve();
      return;
    }
    this.sim.step();
    this.digest();
    if (this.sim.settled) this.resolve();
  }

  private land(f: Flight): void {
    this.status = 'busy';
    if (!f.reach) {
      this.frame.push({ t: 'strike', effect: 'short', x: f.x, y: f.y, z: f.z, ball: f.ball, id: -1 });
      this.idle = 0.7;
      return;
    }
    const def = BALLS[f.ball];
    const out = this.sim.hit(f.x, f.y, f.energy, def.hole, def.blast);
    this.frame.push({ t: 'strike', effect: out.effect, x: f.x, y: f.y, z: f.z, ball: f.ball, id: out.id });
    this.digest();
    if (out.effect === 'miss' || out.effect === 'none') { this.idle = 0.7; this.sim.settled = true; }
  }

  private link(x: number, y: number): void {
    this.chain += 1;
    this.bestChain = Math.max(this.bestChain, this.chain);
    this.frame.push({ t: 'chain', n: this.chain, x, y });
  }

  private fell(mass: number): void {
    this.felled += mass / this.sim.totalMass;
    this.score += Math.round((mass / 25) * this.multiplier);
    const tier: Tier | null = this.felled >= KEYSTONE ? 'keystone' : this.felled >= BIG_DROP ? 'big' : null;
    if (tier && tier !== this.tier && this.tier !== 'keystone') {
      this.tier = tier;
      if (tier === 'keystone') this.keystone = true;
      this.frame.push({ t: 'tier', tier });
    }
  }

  private digest(): void {
    const evs = this.sim.events;
    for (const e of evs) {
      this.frame.push(e);
      switch (e.t) {
        case 'break':
          if (e.protect) break;
          if (e.standing) {
            this.fell(e.mass);
            if (e.cause === 'crush' || e.cause === 'impact') this.link(e.x, e.y);
          } else this.score += Math.round((e.mass / 60) * this.multiplier);
          break;
        case 'loose': {
          let mass = 0;
          for (const id of e.ids) if (!this.sim.members[id].protect) mass += this.sim.members[id].mass;
          if (mass > 0) { this.fell(mass); this.link(e.x, e.y); }
          break;
        }
        case 'snap':
        case 'boom':
          this.link(e.x, e.y);
          break;
        case 'found':
          this.bag[e.ball] += 1;
          this.frame.push({ t: 'bag', ball: e.ball, n: this.bag[e.ball] });
          break;
        case 'protect':
          this.neighbourHit = true;
          break;
        default:
          break;
      }
    }
    evs.length = 0;
  }

  private resolve(): void {
    this.idle = 0;
    this.flight = null;
    if (this.neighbourHit) { this.status = 'lost'; this.loss = 'neighbour'; }
    else if (this.sim.cleared()) {
      this.status = 'won';
      this.score += this.shotsLeft * 500 + (this.keystone ? 1500 : 0);
    } else if (this.shotsLeft <= 0) { this.status = 'lost'; this.loss = 'standing'; }
    else this.status = 'aim';
    this.frame.push({ t: 'settled', status: this.status });
  }

  standing(): number {
    let n = 0;
    for (const m of this.sim.members) if (m.state === STANDING && !m.protect) n++;
    return n;
  }
}
