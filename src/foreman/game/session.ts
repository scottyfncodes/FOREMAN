import { Sim, STANDING } from '../sim/world';
import type { LevelDef, SimEvent } from '../sim/types';

export type Status = 'aim' | 'busy' | 'won' | 'lost';
export type Tier = 'big' | 'keystone';
export type LossReason = 'standing' | 'neighbour';

export type GameEvent =
  | SimEvent
  | { t: 'tier'; tier: Tier }
  | { t: 'chain'; n: number; x: number; y: number }
  | { t: 'charge'; n: number }
  | { t: 'settled'; status: Status };

/** Share of the building one strike has to bring down to count as each tier. */
export const BIG_DROP = 0.22;
export const KEYSTONE = 0.5;

export function starsFor(level: LevelDef, used: number): number {
  return used <= level.par ? 3 : used <= level.par + 1 ? 2 : 1;
}

/**
 * One attempt at a level: the charge budget, the chain counter, the score and the verdict.
 * Reads the simulation only through its events, so nothing here can fake a collapse.
 */
export class Session {
  readonly level: LevelDef;
  readonly sim: Sim;
  charges: number;
  used = 0;
  score = 0;
  status: Status = 'aim';
  loss: LossReason | null = null;
  /** Links in the current strike's chain: every failure the charge did not cause directly. */
  chain = 0;
  bestChain = 0;
  /** Share of the building the current strike has brought down so far. */
  felled = 0;
  tier: Tier | null = null;
  /** A single strike brought down half the building. */
  keystone = false;
  neighbourHit = false;
  /** Everything that happened in the last step, for the renderer, sound and HUD. */
  readonly frame: GameEvent[] = [];

  constructor(level: LevelDef) {
    this.level = level;
    this.sim = new Sim(level);
    this.sim.events.length = 0;
    this.charges = level.charges;
  }

  get multiplier(): number {
    return 1 + Math.min(this.chain, 20) * 0.25;
  }

  get stars(): number {
    return this.status === 'won' ? starsFor(this.level, this.used) : 0;
  }

  canStrike(id: number): boolean {
    return this.status === 'aim' && this.charges > 0 && this.sim.canStrike(id);
  }

  strike(id: number): boolean {
    if (!this.canStrike(id)) return false;
    this.charges -= 1;
    this.used += 1;
    this.chain = 0;
    this.felled = 0;
    this.tier = null;
    this.status = 'busy';
    this.sim.strike(id);
    return true;
  }

  step(): void {
    if (this.status !== 'busy') return;
    this.sim.step();
    this.digest();
    if (this.sim.settled) this.resolve();
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
          this.link(e.x, e.y);
          break;
        case 'boom':
          this.link(e.x, e.y);
          break;
        case 'pickup':
          this.charges += 1;
          this.frame.push({ t: 'charge', n: this.charges });
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
    if (this.neighbourHit) { this.status = 'lost'; this.loss = 'neighbour'; }
    else if (this.sim.cleared()) {
      this.status = 'won';
      this.score += this.charges * 500 + (this.keystone ? 1500 : 0);
    } else if (this.charges <= 0) { this.status = 'lost'; this.loss = 'standing'; }
    else this.status = 'aim';
    this.frame.push({ t: 'settled', status: this.status });
  }

  /** Pieces still standing, for the HUD. */
  standing(): number {
    let n = 0;
    for (const m of this.sim.members) if (m.state === STANDING && !m.protect) n++;
    return n;
  }
}
