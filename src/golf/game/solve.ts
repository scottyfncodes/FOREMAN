import { predict, solveAim } from '../sim/aim';
import type { BallId } from '../sim/balls';
import { DEG } from '../sim/math';
import { NO_MODS, type Shot, type ShotMods, type World } from '../sim/world';
import { powerFor } from './controls';

export interface AimedShot {
  shot: Shot;
  /** The ball reaches the target at this power. When false it falls short, flying its furthest. */
  reach: boolean;
}

/**
 * The shot that sends the ball through a target point at the power a pull
 * gives: the flattest flight that gets there. Too soft to get there, it flies
 * at its furthest angle so the guide shows it dropping short.
 */
export function shotAt(world: World, ball: BallId, target: { x: number; y: number; z: number }, pull: number, mods: ShotMods = NO_MODS): AimedShot {
  const power = powerFor(pull);
  const s = solveAim(world, ball, target, power, mods);
  if (s && s.pitch <= 60) return { shot: s, reach: true };
  const tee = world.info.tee;
  const yaw = Math.atan2(target.x - tee.x, tee.z - target.z) / DEG;
  return { shot: { ball, yaw, pitch: 38, power }, reach: false };
}

/**
 * The weak points a shot from the tee can actually get to: the flight aimed at
 * each one has to touch it, or the patch of wall around it, before anything
 * else. A spot hidden behind a corner or seen edge-on is no use to point at.
 */
export function reachableWeakPoints(world: World, max = 3): number[] {
  const job = reachableWeakPointsSteps(world, max);
  for (;;) {
    const r = job.next();
    if (r.done) return r.value;
  }
}

/** reachableWeakPoints in small steps (see World.weakPointsSteps). */
export function* reachableWeakPointsSteps(world: World, max = 3): Generator<void, number[], void> {
  const ranked = yield* world.weakPointsSteps(12);
  const out: number[] = [];
  const reach = world.punch > 1 ? 0.46 * world.punch * 0.55 : 0.35;
  for (const wp of ranked) {
    if (out.length >= max) break;
    const p = world.parts[wp.part];
    if (!p) continue;
    const aimed = shotAt(world, 'standard', p, 1);
    if (!aimed.reach) continue;
    const c = predict(world, aimed.shot).contact;
    if (c && Math.hypot(c.px - p.x, c.py - p.y, c.pz - p.z) <= reach) out.push(wp.part);
    yield;
  }
  return out;
}
