import { BALLS, type BallKind } from '../sim/types';

/** Where the ball is hit from, and where the face of every building stands. */
export const TEE_Z = 17;
export const FACE_Z = 0.85;
export const G = 9.81;

export interface Flight {
  ball: BallKind;
  power: number;
  /** Launch point and velocity. */
  x0: number;
  y0: number;
  z0: number;
  vx: number;
  vy: number;
  vz: number;
  /** Seconds until it arrives (at the face, or at the ground if it falls short). */
  time: number;
  /** The pull was hard enough to carry to the spot. */
  reach: boolean;
  /** Where it arrives. */
  x: number;
  y: number;
  z: number;
  /** Impact energy in standard balls. Speed is what breaks things, so a soft shot does less. */
  energy: number;
  speed: number;
}

/**
 * The flight of a shot aimed at a spot on the face. Power sets the launch speed; the loft is
 * whatever carries the ball to the spot on the flattest path. Too soft and it drops short.
 */
export function flightTo(teeX: number, x: number, y: number, power: number, kind: BallKind): Flight {
  const ball = BALLS[kind];
  const v = ball.minSpeed + (ball.maxSpeed - ball.minSpeed) * Math.max(0, Math.min(1, power));
  const x0 = teeX;
  const y0 = 0.12;
  const z0 = TEE_Z;
  const dx = x - x0;
  const dz = FACE_Z - z0;
  const d = Math.hypot(dx, dz);
  const h = y - y0;
  const disc = v * v * v * v - G * (G * d * d + 2 * h * v * v);
  if (disc >= 0) {
    const pitch = Math.atan((v * v - Math.sqrt(disc)) / (G * d));
    const vh = v * Math.cos(pitch);
    const time = d / vh;
    const vImp = Math.sqrt(Math.max(0, v * v - 2 * G * h));
    return { ball: kind, power, x0, y0, z0, vx: (vh * dx) / d, vy: v * Math.sin(pitch), vz: (vh * dz) / d, time, reach: true, x, y, z: FACE_Z, energy: ball.energy * (vImp / ball.maxSpeed) ** 2, speed: vImp };
  }
  // Not enough to get there: the best it can do on that line, landing on the grass.
  const pitch = Math.PI / 4;
  const vh = v * Math.cos(pitch);
  const vy = v * Math.sin(pitch);
  const time = (vy + Math.sqrt(vy * vy + 2 * G * y0)) / G;
  const run = Math.min(d - 0.6, vh * time);
  return { ball: kind, power, x0, y0, z0, vx: (vh * dx) / d, vy, vz: (vh * dz) / d, time: run / vh, reach: false, x: x0 + (dx / d) * run, y: Math.max(0, y0 + vy * (run / vh) - 0.5 * G * (run / vh) ** 2), z: z0 + (dz / d) * run, energy: 0, speed: v };
}

export function flightAt(f: Flight, t: number, out: { x: number; y: number; z: number }): void {
  const k = Math.max(0, Math.min(f.time, t));
  out.x = f.x0 + f.vx * k;
  out.y = Math.max(0.02, f.y0 + f.vy * k - 0.5 * G * k * k);
  out.z = f.z0 + f.vz * k;
}
