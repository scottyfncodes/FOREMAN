import { Box, Polygon, Vec2, World as PWorld, type Body, type Contact, type ContactImpulse, type Fixture } from 'planck';
import { KEEP, solve, TIPS, type SNode } from './structure';
import { MATS, type BreakCause, type LevelDef, type Mat, type MemberDef, type Shape, type SimEvent } from './types';

export const STANDING = 0;
export const LOOSE = 1;
export const GONE = 2;

export const DT = 1 / 60;
const G = 10;
const INSET = 0.012;
/** Overload damage per second per unit of overload. Sets how long a failing piece hesitates. */
const DMG_RATE = 5.2;
const MIN_OVER = 0.13;
/** Landing speed that starts to knock a falling chunk apart. */
const DETACH = 1.7;
const GAS_RADIUS = 2.3;

export interface Member {
  id: number;
  mat: Mat;
  shape: Shape;
  w: number;
  h: number;
  /** Rest pose (centre). Live pose comes from pose(). */
  x: number;
  y: number;
  state: number;
  mass: number;
  hp: number;
  cracked: boolean;
  /** Accumulated overload, 0 to 1. At 1 it fails. */
  dmg: number;
  /** Load over capacity from the last solve. */
  util: number;
  /** Newtons passing through it. */
  load: number;
  mode: number;
  strained: boolean;
  hidden: 'gas' | null;
  protect: boolean;
  layer: number;
  /** Seconds until a gas bottle goes off. Negative when not lit. */
  fuse: number;
  bonds: Set<number>;
  body: Body | null;
  fix: Fixture | null;
  lx: number;
  ly: number;
  extF: number;
  extX: number;
  stepJy: number;
  /** Sideways shove from loose pieces: this step's impulse and the smoothed force. */
  stepJh: number;
  extH: number;
  stepJx: number;
  hit: number;
  /** Index of the level member it came from, -1 for pieces made during play. */
  src: number;
}

interface BodyData {
  members: number[];
  pvx: number;
  pvy: number;
  pw: number;
  dirty: boolean;
}

export interface Pose {
  x: number;
  y: number;
  a: number;
}

/** Infill (layer 1) is thin cladding between the frame: a third of the weight and strength. */
const INFILL = 0.35;

function massOf(mat: Mat, shape: Shape, w: number, h: number, layer: number): number {
  return MATS[mat].density * w * h * (shape === 'box' ? 1 : 0.5) * (layer === 1 ? INFILL : 1);
}

function structural(m: Member): boolean {
  return m.layer !== 1 && m.mat !== 'glass' && m.mat !== 'gas' && m.mat !== 'crate';
}

function profile(shape: Shape, t: number): number {
  if (shape === 'gable') return 1 - Math.abs(2 * t - 1);
  if (shape === 'shedL') return 1 - t;
  if (shape === 'shedR') return t;
  return 1;
}

/**
 * The demolition world. Pieces stand still (and cost nothing) while the load solver says they
 * can; the moment one cannot, it and whatever it carried become real rigid bodies. Deterministic:
 * fixed step, no randomness.
 */
export class Sim {
  readonly level: LevelDef;
  readonly members: Member[] = [];
  readonly events: SimEvent[] = [];
  time = 0;
  private world: PWorld;
  private nodes: SNode[] = [];
  private alive = new Uint8Array(0);
  private quiet = 0;
  private kicked: number[] = [];
  private busyFor = 0;
  private dirtyBodies = new Set<Body>();
  private pendingImpacts: { x: number; y: number; j: number; mat: Mat }[] = [];
  /** Mass standing above the line when the level opened (neighbours excluded). */
  readonly targetMass: number;
  /** Mass of everything that can come down. */
  readonly totalMass: number;
  settled = true;
  /** Break lines left by snapped spans. Nothing bonds across one. */
  readonly cracks: { x: number; y: number }[] = [];

  constructor(level: LevelDef) {
    this.level = level;
    this.world = new PWorld({ gravity: new Vec2(0, -G), allowSleep: true });
    const ground = this.world.createBody({ type: 'static', position: new Vec2(0, 0) });
    ground.createFixture({ shape: new Box(400, 2, new Vec2(0, -2), 0), friction: 0.8, restitution: 0.02, userData: -1 });
    ground.setUserData({ members: [], pvx: 0, pvy: 0, pw: 0, dirty: false } satisfies BodyData);
    level.members.forEach((d, i) => this.addMember(d, i));
    this.link();
    this.world.on('post-solve', (c, imp) => this.onContact(c, imp));
    this.structural(0);
    let total = 0;
    for (const m of this.members) if (!m.protect) total += m.mass;
    this.totalMass = total;
    this.targetMass = Math.max(1, this.aboveMass());
  }

  private addMember(d: MemberDef, src: number): Member {
    const shape = d.shape ?? 'box';
    const m: Member = {
      id: this.members.length,
      mat: d.mat,
      shape,
      w: d.w,
      h: d.h,
      x: d.x + d.w / 2,
      y: d.y + d.h / 2,
      state: STANDING,
      mass: massOf(d.mat, shape, d.w, d.h, d.layer ?? 0),
      hp: Math.max(1, MATS[d.mat].hp - (d.cracked && MATS[d.mat].hp > 1 ? 1 : 0)),
      cracked: !!d.cracked,
      dmg: 0,
      util: 0,
      load: 0,
      mode: 0,
      strained: false,
      hidden: d.hidden ?? null,
      protect: !!d.protect,
      layer: d.layer ?? 0,
      fuse: -1,
      bonds: new Set(),
      body: null,
      fix: null,
      lx: 0,
      ly: 0,
      extF: 0,
      extX: 0,
      stepJy: 0,
      stepJh: 0,
      extH: 0,
      stepJx: 0,
      hit: 0,
      src,
    };
    this.members.push(m);
    const body = this.world.createBody({ type: 'static', position: new Vec2(m.x, m.y) });
    body.setUserData({ members: [m.id], pvx: 0, pvy: 0, pw: 0, dirty: false } satisfies BodyData);
    m.body = body;
    m.fix = this.makeFixture(body, m, 0, 0);
    return m;
  }

  private makeFixture(body: Body, m: Member, lx: number, ly: number): Fixture {
    const def = MATS[m.mat];
    const hw = Math.max(0.02, m.w / 2 - INSET);
    const hh = Math.max(0.02, m.h / 2 - INSET);
    let shape;
    if (m.shape === 'box') shape = new Box(hw, hh, new Vec2(lx, ly), 0);
    else {
      const apex = m.shape === 'gable' ? 0 : m.shape === 'shedL' ? -hw : hw;
      shape = new Polygon([new Vec2(lx - hw, ly - hh), new Vec2(lx + hw, ly - hh), new Vec2(lx + apex, ly + hh)]);
    }
    m.lx = lx;
    m.ly = ly;
    return body.createFixture({ shape, density: def.density * (m.layer === 1 ? INFILL : 1), friction: def.friction, restitution: def.bounce, userData: m.id });
  }

  /** Works out what touches what among the standing pieces, and rebuilds the solver's view. */
  private link(): void {
    const ms = this.members;
    const n = ms.length;
    this.nodes = [];
    this.alive = new Uint8Array(n);
    for (const m of ms) {
      if (m.state === STANDING) m.bonds.clear();
      const segs = Math.max(1, Math.ceil(m.w / 0.3));
      const samples: number[] = [];
      let sum = 0;
      for (let s = 0; s < segs; s++) sum += profile(m.shape, (s + 0.5) / segs);
      for (let s = 0; s < segs; s++) {
        const t = (s + 0.5) / segs;
        samples.push(m.x - m.w / 2 + t * m.w, (m.mass * G * profile(m.shape, t)) / sum);
      }
      const def = MATS[m.mat];
      const weak = (m.cracked ? 0.45 : 1) * (m.layer === 1 ? 0.08 : 1);
      this.nodes.push({
        x0: m.x - m.w / 2,
        x1: m.x + m.w / 2,
        y0: m.y - m.h / 2,
        ground: Math.abs(m.y - m.h / 2) < 0.02,
        below: [],
        samples,
        crushPerM: def.crush * weak,
        bendCap: m.shape === 'box' && m.w > m.h * 1.5 && m.w >= 0.9 ? def.bend * m.h * m.h * weak : 0,
        ext: [],
      });
      this.alive[m.id] = m.state === STANDING ? 1 : 0;
    }
    for (let i = 0; i < n; i++) {
      const a = ms[i];
      if (a.state !== STANDING) continue;
      for (let j = i + 1; j < n; j++) {
        const b = ms[j];
        if (b.state !== STANDING) continue;
        const ox = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
        const oy = Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2);
        if (ox > 0.03 && Math.abs(oy) < 0.02) {
          // One sits on the other.
          const up = a.y > b.y ? a : b;
          const dn = a.y > b.y ? b : a;
          if (dn.shape !== 'box') continue;
          if (!this.parted(a, b)) { a.bonds.add(b.id); b.bonds.add(a.id); }
          // Infill and glass hold nothing up. Whatever is over them spans across to the frame.
          if (!structural(dn) && structural(up)) continue;
          this.nodes[up.id].below.push({ j: dn.id, a: Math.max(a.x - a.w / 2, b.x - b.w / 2), b: Math.min(a.x + a.w / 2, b.x + b.w / 2) });
        } else if (oy > 0.03 && Math.abs(ox) < 0.02 && a.shape === 'box' && b.shape === 'box') {
          if (this.parted(a, b)) continue;
          a.bonds.add(b.id);
          b.bonds.add(a.id);
        }
      }
    }
  }

  /** True when a break line runs between two pieces. */
  private parted(a: Member, b: Member): boolean {
    for (const c of this.cracks) {
      if (a.y + a.h / 2 <= c.y + 0.02 || b.y + b.h / 2 <= c.y + 0.02) continue;
      if (a.x < c.x !== b.x < c.x) return true;
    }
    return false;
  }

  pose(m: Member, out: Pose): Pose {
    if (m.body && m.state === LOOSE) {
      const b = m.body;
      const p = b.getPosition();
      const a = b.getAngle();
      const c = Math.cos(a);
      const s = Math.sin(a);
      out.x = p.x + c * m.lx - s * m.ly;
      out.y = p.y + s * m.lx + c * m.ly;
      out.a = a;
    } else {
      out.x = m.x;
      out.y = m.y;
      out.a = 0;
    }
    return out;
  }

  private tmp: Pose = { x: 0, y: 0, a: 0 };

  /** Highest and lowest points of a piece where it is now. */
  private span(m: Member): [number, number] {
    const p = this.pose(m, this.tmp);
    const c = Math.abs(Math.cos(p.a));
    const s = Math.abs(Math.sin(p.a));
    const half = (m.w / 2) * s + (m.h / 2) * c;
    return [p.y - half, p.y + half];
  }

  /** Mass still above the line (neighbours excluded). */
  aboveMass(): number {
    const line = this.level.lineY;
    let sum = 0;
    for (const m of this.members) {
      if (m.state === GONE || m.protect) continue;
      const [lo, hi] = this.span(m);
      if (hi <= line) continue;
      sum += m.mass * Math.min(1, (hi - line) / Math.max(0.01, hi - lo));
    }
    return sum;
  }

  /** Share of the job done, 0 to 1. */
  progress(): number {
    return Math.max(0, Math.min(1, 1 - this.aboveMass() / this.targetMass));
  }

  cleared(): boolean {
    return this.aboveMass() <= this.targetMass * 0.015;
  }

  /** The piece under a point, preferring small pieces (they are the hard ones to hit). */
  pick(x: number, y: number, slack = 0.18): number {
    let best = -1;
    let bestScore = Infinity;
    for (const m of this.members) {
      if (m.state === GONE) continue;
      const p = this.pose(m, this.tmp);
      const c = Math.cos(-p.a);
      const s = Math.sin(-p.a);
      const dx = x - p.x;
      const dy = y - p.y;
      const qx = Math.abs(c * dx - s * dy) - m.w / 2;
      const qy = Math.abs(s * dx + c * dy) - m.h / 2;
      const d = Math.max(qx, qy);
      if (d > slack) continue;
      const score = Math.max(d, 0) * 10 + Math.min(m.w, m.h) * 0.2 + (d > 0 ? 1 : 0);
      if (score < bestScore) { bestScore = score; best = m.id; }
    }
    return best;
  }

  canStrike(id: number): boolean {
    const m = this.members[id];
    return !!m && m.state !== GONE && MATS[m.mat].hp > 0 && !m.protect;
  }

  /** Sets a charge on a piece. Returns false if a charge cannot do anything to it. */
  strike(id: number): boolean {
    if (!this.canStrike(id)) return false;
    const m = this.members[id];
    this.wake();
    if (m.mat === 'gas') {
      m.fuse = 0.02;
      return true;
    }
    m.hp -= 1;
    const p = this.pose(m, { x: 0, y: 0, a: 0 });
    if (m.hp <= 0) this.breakMember(m, 'charge');
    else {
      m.cracked = true;
      this.events.push({ t: 'crack', id: m.id, x: p.x, y: p.y, mat: m.mat });
      this.link();
    }
    // The charge rattles what is close: panes go, loose pieces jump.
    for (const o of this.members) {
      if (o.state === GONE || o === m) continue;
      const d = this.distTo(o, p.x, p.y);
      if (o.mat === 'glass' && d < 0.5) this.breakMember(o, 'blast');
      else if (o.state === LOOSE && d < 1.2 && o.body) this.push(o, p.x, p.y, (1 - d / 1.2) * 2.5);
    }
    return true;
  }

  private wake(): void {
    this.settled = false;
    this.quiet = 0;
    this.busyFor = 0;
  }

  private distTo(m: Member, x: number, y: number): number {
    const p = this.pose(m, this.tmp);
    const c = Math.cos(-p.a);
    const s = Math.sin(-p.a);
    const dx = x - p.x;
    const dy = y - p.y;
    const qx = Math.max(0, Math.abs(c * dx - s * dy) - m.w / 2);
    const qy = Math.max(0, Math.abs(s * dx + c * dy) - m.h / 2);
    return Math.hypot(qx, qy);
  }

  private push(m: Member, x: number, y: number, dv: number): void {
    const b = m.body;
    if (!b || m.state !== LOOSE) return;
    const p = this.pose(m, this.tmp);
    let dx = p.x - x;
    let dy = p.y - y + 0.4;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const j = Math.min(m.mass, 900) * dv;
    b.applyLinearImpulse(new Vec2(dx * j, dy * j), new Vec2(p.x, p.y), true);
  }

  private breakMember(m: Member, cause: BreakCause): void {
    if (m.state === GONE) return;
    const p = this.pose(m, { x: 0, y: 0, a: 0 });
    let vx = 0;
    let vy = 0;
    const standing = m.state === STANDING;
    const body = m.body;
    if (body) {
      if (!standing) {
        const v = body.getLinearVelocityFromWorldPoint(new Vec2(p.x, p.y));
        vx = v.x;
        vy = v.y;
      }
      if (standing) this.world.destroyBody(body);
      else {
        if (m.fix) body.destroyFixture(m.fix);
        const data = body.getUserData() as BodyData;
        data.members = data.members.filter((q) => q !== m.id);
        if (data.members.length === 0) { this.world.destroyBody(body); this.dirtyBodies.delete(body); }
        else { data.dirty = true; this.dirtyBodies.add(body); body.setAwake(true); }
      }
    }
    for (const o of m.bonds) this.members[o].bonds.delete(m.id);
    m.bonds.clear();
    m.body = null;
    m.fix = null;
    m.state = GONE;
    this.alive[m.id] = 0;
    m.util = 0;
    this.wake();
    this.events.push({ t: 'break', id: m.id, cause, mat: m.mat, x: p.x, y: p.y, w: m.w, h: m.h, a: p.a, vx, vy, standing, mass: m.mass, protect: m.protect });
    if (m.protect) this.events.push({ t: 'protect', id: m.id, x: p.x, y: p.y });
    if (m.mat === 'crate') this.events.push({ t: 'pickup', x: p.x, y: p.y });
    if (m.mat === 'gas') this.blast(p.x, p.y, GAS_RADIUS);
    if (m.hidden === 'gas') this.revealGas(p.x, p.y, vx, vy);
  }

  /** A bottle that was sealed in a piece drops out, already lit. */
  private revealGas(x: number, y: number, vx: number, vy: number): void {
    const g = this.addLoose({ mat: 'gas', x: x - 0.2, y: y - 0.35, w: 0.4, h: 0.7 }, vx, vy);
    g.fuse = 0.5;
    this.events.push({ t: 'reveal', id: g.id, x, y });
    this.events.push({ t: 'fuse', id: g.id, x, y });
  }

  private addLoose(d: MemberDef, vx: number, vy: number): Member {
    const m = this.addMember(d, -1);
    this.nodes.push({ x0: 0, x1: 0, y0: 0, ground: false, below: [], samples: [], crushPerM: 1, bendCap: 0, ext: [] });
    const alive = new Uint8Array(this.members.length);
    alive.set(this.alive);
    this.alive = alive;
    this.loosen([m.id], false);
    m.body?.setLinearVelocity(new Vec2(vx, vy));
    return m;
  }

  private blast(x: number, y: number, r: number): void {
    this.events.push({ t: 'boom', x, y, r });
    for (const m of this.members) {
      if (m.state === GONE) continue;
      const d = this.distTo(m, x, y);
      if (d >= r) continue;
      const f = 1 - d / r;
      const def = MATS[m.mat];
      if (m.mat === 'gas') {
        if (m.fuse < 0) { m.fuse = 0.16 + d * 0.09; const p = this.pose(m, this.tmp); this.events.push({ t: 'fuse', id: m.id, x: p.x, y: p.y }); }
      } else if (m.mat === 'concrete') {
        if (f > def.blast) {
          m.hp -= 1;
          if (m.hp <= 0) this.breakMember(m, 'blast');
          else if (!m.cracked) { m.cracked = true; const p = this.pose(m, this.tmp); this.events.push({ t: 'crack', id: m.id, x: p.x, y: p.y, mat: m.mat }); this.link(); }
        }
      } else if (f > def.blast) this.breakMember(m, 'blast');
      if (m.state === LOOSE) this.push(m, x, y, f * 7);
    }
  }

  /** Turns standing pieces into rigid bodies, grouped by what is still joined together. */
  private loosen(ids: number[], bonded = true): void {
    const set = new Set(ids);
    for (const id of ids) {
      const m = this.members[id];
      if (m.body) this.world.destroyBody(m.body);
      m.body = null;
      m.fix = null;
      m.state = LOOSE;
      this.alive[id] = 0;
      m.util = 0;
      for (const o of [...m.bonds]) if (!set.has(o) || !bonded) { m.bonds.delete(o); this.members[o].bonds.delete(id); }
    }
    const seen = new Set<number>();
    for (const id of ids) {
      if (seen.has(id)) continue;
      const group: number[] = [];
      const stack = [id];
      seen.add(id);
      while (stack.length) {
        const q = stack.pop() as number;
        group.push(q);
        for (const o of this.members[q].bonds) if (set.has(o) && !seen.has(o)) { seen.add(o); stack.push(o); }
      }
      group.sort((p, q) => p - q);
      const first = this.members[group[0]];
      this.makeBody(group, first.x, first.y, 0, (g) => [g.x - first.x, g.y - first.y], null);
    }
  }

  private makeBody(group: number[], x: number, y: number, a: number, local: (m: Member) => [number, number], from: Body | null): Body {
    const body = this.world.createBody({ type: 'dynamic', position: new Vec2(x, y), angle: a, angularDamping: 0.05, linearDamping: 0.01 });
    body.setUserData({ members: group, pvx: 0, pvy: 0, pw: 0, dirty: false } satisfies BodyData);
    for (const id of group) {
      const m = this.members[id];
      const [lx, ly] = local(m);
      m.body = body;
      m.fix = this.makeFixture(body, m, lx, ly);
    }
    if (from) {
      body.setLinearVelocity(from.getLinearVelocityFromWorldPoint(body.getWorldCenter()));
      body.setAngularVelocity(from.getAngularVelocity());
    }
    return body;
  }

  /** Splits a body whose pieces are no longer all joined. */
  private rechunk(body: Body): void {
    const data = body.getUserData() as BodyData;
    data.dirty = false;
    const all = data.members;
    if (all.length <= 1) return;
    const seen = new Set<number>();
    const groups: number[][] = [];
    for (const id of all) {
      if (seen.has(id)) continue;
      const group: number[] = [];
      const stack = [id];
      seen.add(id);
      while (stack.length) {
        const q = stack.pop() as number;
        group.push(q);
        for (const o of this.members[q].bonds) if (!seen.has(o)) { seen.add(o); stack.push(o); }
      }
      groups.push(group.sort((p, q) => p - q));
    }
    if (groups.length <= 1) return;
    const a = body.getAngle();
    for (const group of groups) {
      const first = this.members[group[0]];
      const origin = this.pose(first, { x: 0, y: 0, a: 0 });
      const fx = first.lx;
      const fy = first.ly;
      const locals = new Map<number, [number, number]>();
      for (const id of group) locals.set(id, [this.members[id].lx - fx, this.members[id].ly - fy]);
      this.makeBody(group, origin.x, origin.y, a, (m) => locals.get(m.id) as [number, number], body);
    }
    this.world.destroyBody(body);
  }

  private detach(m: Member, depth: number): void {
    if (m.state !== LOOSE || !m.body) return;
    let ring = [m.id];
    const seen = new Set(ring);
    for (let d = 0; d < depth && ring.length; d++) {
      const next: number[] = [];
      for (const id of ring) {
        const q = this.members[id];
        for (const o of [...q.bonds]) {
          q.bonds.delete(o);
          this.members[o].bonds.delete(id);
          if (!seen.has(o)) { seen.add(o); next.push(o); }
        }
      }
      ring = next;
    }
    (m.body.getUserData() as BodyData).dirty = true;
    this.dirtyBodies.add(m.body);
  }

  /** Replaces a standing box with two, cut at x. Returns false if it is too small to cut. */
  private split(m: Member, cut: number): boolean {
    const x0 = m.x - m.w / 2;
    const x1 = m.x + m.w / 2;
    if (m.shape !== 'box' || cut - x0 < 0.2 || x1 - cut < 0.2) return false;
    const base = { mat: m.mat, y: m.y - m.h / 2, h: m.h, cracked: m.cracked, layer: m.layer, protect: m.protect };
    if (m.body) this.world.destroyBody(m.body);
    m.body = null;
    m.fix = null;
    m.state = GONE;
    for (const o of m.bonds) this.members[o].bonds.delete(m.id);
    m.bonds.clear();
    const l = this.addMember({ ...base, x: x0, w: cut - x0 }, -1);
    const r = this.addMember({ ...base, x: cut, w: x1 - cut }, -1);
    l.dmg = r.dmg = Math.max(m.dmg * 0.5, 0.3);
    l.hp = r.hp = m.hp;
    if (m.hidden) (m.x < cut ? l : r).hidden = m.hidden;
    return true;
  }

  /**
   * A span gives way. The break does not stop at the piece that snapped: it runs up through
   * everything built across that line, so the two halves of the building can fold apart.
   */
  private snapMember(m: Member, sx: number): void {
    const x0 = m.x - m.w / 2;
    const x1 = m.x + m.w / 2;
    if (m.w < 0.7) { this.breakMember(m, 'crush'); return; }
    const cut = Math.min(x1 - 0.3, Math.max(x0 + 0.3, sx));
    const top = m.y + m.h / 2;
    const yBase = m.y - m.h / 2;
    const mat = m.mat;
    const cy = m.y;
    const prot = m.protect;
    this.split(m, cut);
    for (const o of [...this.members]) {
      if (o.state !== STANDING || o.y - o.h / 2 < top - 0.02) continue;
      const a = o.x - o.w / 2;
      const b = o.x + o.w / 2;
      if (a > cut - 0.12 || b < cut + 0.12) continue;
      if (o.mat === 'glass') this.breakMember(o, 'crush');
      else if (o.shape === 'gable') {
        // A gable parts at the ridge.
        const base = { mat: o.mat, y: o.y - o.h / 2, h: o.h, layer: o.layer, protect: o.protect };
        if (o.body) this.world.destroyBody(o.body);
        o.body = null; o.fix = null; o.state = GONE;
        for (const q of o.bonds) this.members[q].bonds.delete(o.id);
        o.bonds.clear();
        this.addMember({ ...base, x: a, w: o.w / 2, shape: 'shedR' }, -1);
        this.addMember({ ...base, x: o.x, w: o.w / 2, shape: 'shedL' }, -1);
      } else this.split(o, cut);
    }
    this.cracks.push({ x: cut, y: yBase });
    this.events.push({ t: 'snap', id: m.id, x: cut, y: cy, mat });
    if (prot) this.events.push({ t: 'protect', id: m.id, x: cut, y: cy });
    this.link();
  }

  /** Runs the load solver and applies what it finds. */
  private structural(dt: number): void {
    const ms = this.members;
    for (const m of ms) {
      const nd = this.nodes[m.id];
      nd.ext.length = 0;
      if (m.state === STANDING && m.extF > 1) nd.ext.push(m.extX, m.extF);
    }
    // A standing piece with nothing built on it can be shoved over by what leans on it.
    let topFree: Uint8Array | null = null;
    for (const m of ms) {
      if (m.state !== STANDING || Math.abs(m.extH) < 200) continue;
      if (!topFree) {
        topFree = new Uint8Array(ms.length).fill(1);
        for (const o of ms) if (o.state === STANDING && structural(o)) for (const sup of this.nodes[o.id].below) topFree[sup.j] = 0;
      }
      if (!topFree[m.id]) continue;
      if (Math.abs(m.extH) * m.h > 2.5 * (m.mass * G + m.extF) * (m.w / 2)) {
        this.alive[m.id] = 0;
        this.kicked.push(m.id);
      }
    }
    const out = solve(this.nodes, this.alive);
    const drop: number[] = this.kicked.splice(0);
    for (const id of drop) if (ms[id].protect) this.events.push({ t: 'protect', id, x: ms[id].x, y: ms[id].y });
    let why: 'unsupported' | 'tip' = 'unsupported';
    let mass = 0;
    let cx = 0;
    let cy = 0;
    for (const m of ms) {
      if (m.state !== STANDING || !this.alive[m.id]) continue;
      if (out.removed[m.id] !== KEEP) {
        drop.push(m.id);
        if (out.removed[m.id] === TIPS) why = 'tip';
        mass += m.mass;
        cx += m.x * m.mass;
        cy += m.y * m.mass;
        if (m.protect) this.events.push({ t: 'protect', id: m.id, x: m.x, y: m.y });
      } else {
        m.util = out.util[m.id];
        m.load = out.load[m.id];
        m.mode = out.mode[m.id];
      }
    }
    if (drop.length) {
      if (mass === 0) for (const id of drop) { mass += ms[id].mass; cx += ms[id].x * ms[id].mass; cy += ms[id].y * ms[id].mass; }
      this.loosen(drop);
      this.events.push({ t: 'loose', ids: drop, why, mass, x: cx / mass, y: cy / mass });
      this.wake();
    }
    if (dt <= 0) return;
    const failing: Member[] = [];
    for (const m of ms) {
      if (m.state !== STANDING || m.util <= 1) continue;
      if (!m.strained) {
        m.strained = true;
        this.events.push({ t: 'strain', id: m.id, x: m.mode ? out.snapX[m.id] : m.x, y: m.y, mode: m.mode ? 'snap' : 'crush' });
      }
      m.dmg += dt * DMG_RATE * Math.max(m.util - 1, MIN_OVER);
      if (m.dmg >= 1) failing.push(m);
    }
    for (const m of failing) {
      if (m.state !== STANDING) continue;
      if (m.mode === 1) this.snapMember(m, out.snapX[m.id]);
      else this.breakMember(m, 'crush');
    }
  }

  private onContact(c: Contact, imp: ContactImpulse): void {
    const count = c.getManifold().pointCount;
    let j = 0;
    for (let i = 0; i < count; i++) j += imp.normalImpulses[i];
    if (j < 0.5) return;
    const fa = c.getFixtureA();
    const fb = c.getFixtureB();
    const ia = fa.getUserData() as number;
    const ib = fb.getUserData() as number;
    const ma = ia >= 0 ? this.members[ia] : null;
    const mb = ib >= 0 ? this.members[ib] : null;
    const wm = c.getWorldManifold(null);
    if (!wm) return;
    const nx = wm.normal.x;
    const ny = wm.normal.y;
    const p = wm.points[0];
    // Weight and blows arriving on standing pieces feed the load solver.
    if (ma && ma.state === STANDING) { ma.stepJh -= j * nx; if (ny > 0) { ma.stepJy += j * ny; ma.stepJx += j * ny * p.x; } }
    if (mb && mb.state === STANDING) { mb.stepJh += j * nx; if (ny < 0) { mb.stepJy += -j * ny; mb.stepJx += -j * ny * p.x; } }
    // Was it a blow or just weight? Compare the speeds the bodies came in with.
    const ba = fa.getBody();
    const bb = fb.getBody();
    const da = ba.getUserData() as BodyData;
    const db = bb.getUserData() as BodyData;
    const pa = ba.getPosition();
    const pb = bb.getPosition();
    const vax = da.pvx - da.pw * (p.y - pa.y);
    const vay = da.pvy + da.pw * (p.x - pa.x);
    const vbx = db.pvx - db.pw * (p.y - pb.y);
    const vby = db.pvy + db.pw * (p.x - pb.x);
    const approach = (vax - vbx) * nx + (vay - vby) * ny;
    if (approach < 1.1) return;
    if (ma) ma.hit += j;
    if (mb) mb.hit += j;
    if (j > 600) this.pendingImpacts.push({ x: p.x, y: p.y, j, mat: (ma ?? mb)?.mat ?? 'concrete' });
  }

  step(): void {
    if (this.settled) return;
    this.time += DT;
    this.busyFor += DT;
    // Fuses.
    for (const m of this.members) {
      if (m.fuse < 0 || m.state === GONE) continue;
      m.fuse -= DT;
      if (m.fuse <= 0) { m.fuse = -1; this.breakMember(m, 'blast'); }
    }
    this.structural(DT);
    for (const b of this.dirtyBodies) this.rechunk(b);
    this.dirtyBodies.clear();
    // Remember incoming speeds, then step.
    let moving = 0;
    for (let b = this.world.getBodyList(); b; b = b.getNext()) {
      if (!b.isDynamic()) continue;
      const d = b.getUserData() as BodyData;
      const v = b.getLinearVelocity();
      d.pvx = v.x;
      d.pvy = v.y;
      d.pw = b.getAngularVelocity();
      if (b.isAwake()) moving = Math.max(moving, Math.hypot(v.x, v.y) + Math.abs(d.pw) * 0.5);
    }
    this.world.step(DT, 8, 3);
    // Blows.
    for (const m of this.members) {
      if (m.state === STANDING) {
        if (m.stepJy > 0) { m.extX = m.stepJx / m.stepJy; m.extF = m.extF * 0.7 + (m.stepJy / DT) * 0.3; }
        else m.extF *= 0.7;
        m.extH = m.extH * 0.7 + (m.stepJh / DT) * 0.3;
        m.stepJy = m.stepJx = m.stepJh = 0;
      }
      if (m.hit <= 0) continue;
      const hit = m.hit;
      m.hit = 0;
      if (m.state === GONE) continue;
      const bodyMass = m.state === LOOSE && m.body ? Math.max(m.mass, m.body.getMass()) : m.mass;
      const v = hit / bodyMass;
      if (m.mat === 'gas') {
        if (v > 2.6 && m.fuse < 0) { m.fuse = 0.28; const p = this.pose(m, this.tmp); this.events.push({ t: 'fuse', id: m.id, x: p.x, y: p.y }); }
        continue;
      }
      // A jolt through a falling chunk takes its panes with it.
      if (m.state === LOOSE && m.body && v > MATS.glass.shatter) {
        for (const o of [...(m.body.getUserData() as BodyData).members]) if (o !== m.id && this.members[o].mat === 'glass') this.breakMember(this.members[o], 'impact');
      }
      if (m.state === GONE) continue;
      if (v > MATS[m.mat].shatter * (m.layer === 1 ? 0.5 : 1)) this.breakMember(m, 'impact');
      else if (m.state === LOOSE && v > DETACH) this.detach(m, Math.min(4, Math.floor(v / DETACH)));
    }
    if (this.pendingImpacts.length) {
      this.pendingImpacts.sort((p, q) => q.j - p.j);
      for (let i = 0; i < Math.min(3, this.pendingImpacts.length); i++) this.events.push({ t: 'impact', ...this.pendingImpacts[i] });
      this.pendingImpacts.length = 0;
    }
    for (const b of this.dirtyBodies) this.rechunk(b);
    this.dirtyBodies.clear();
    // Settling.
    let pending = false;
    for (const m of this.members) if (m.state !== GONE && (m.fuse >= 0 || (m.state === STANDING && m.util > 1))) { pending = true; break; }
    if (!pending && moving < 0.12) this.quiet++;
    else this.quiet = 0;
    if (this.quiet > 40 || this.busyFor > 16) {
      this.settled = true;
      for (let b = this.world.getBodyList(); b; b = b.getNext()) if (b.isDynamic()) { b.setLinearVelocity(new Vec2(0, 0)); b.setAngularVelocity(0); b.setAwake(false); }
    }
  }

  /** Steps until everything has come to rest. For tests and tuning. */
  run(maxSeconds = 20): void {
    const steps = Math.ceil(maxSeconds / DT);
    for (let i = 0; i < steps && !this.settled; i++) this.step();
  }

  standingCount(): number {
    let n = 0;
    for (const m of this.members) if (m.state === STANDING) n++;
    return n;
  }
}
