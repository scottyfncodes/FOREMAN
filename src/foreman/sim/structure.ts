/**
 * The load solver. Pure and allocation-light: given the pieces still standing it works out
 * what holds what, how much weight passes through each piece, and which pieces cannot stay.
 *
 * The model is deliberately simple enough to reason about by eye:
 *  - weight only travels down, through the faces a piece sits on;
 *  - a load between two supports is shared by the lever rule, a load past the last support
 *    hangs off it;
 *  - a piece whose total load falls outside its supports tips;
 *  - a piece is crushed when the load over its bearing width beats its material;
 *  - a spanning piece snaps where the bending moment beats its depth.
 */
export interface Support {
  /** Index of the supporting node. */
  j: number;
  /** Contact interval along x. */
  a: number;
  b: number;
}

export interface SNode {
  x0: number;
  x1: number;
  y0: number;
  /** Rests on the ground. */
  ground: boolean;
  below: Support[];
  /** Own weight as flat [x, force] pairs. */
  samples: number[];
  /** Bearing capacity, newtons per metre of contact. */
  crushPerM: number;
  /** Bending capacity, newton-metres. 0 means it never snaps. */
  bendCap: number;
  /** Outside loads this step as flat [x, force] pairs (debris resting or landing on it). */
  ext: number[];
}

export const KEEP = 0;
export const UNSUPPORTED = 1;
export const TIPS = 2;

export interface SolveOut {
  /** KEEP, UNSUPPORTED or TIPS for every node. */
  removed: Int8Array;
  /** Load over capacity. Above 1 the piece is failing. */
  util: Float32Array;
  /** 0 crushing governs, 1 bending governs. */
  mode: Int8Array;
  /** Where it would snap. */
  snapX: Float32Array;
  /** Total force passing through the piece, newtons. */
  load: Float32Array;
}

const TOL = 0.03;

export function solve(nodes: SNode[], alive: Uint8Array): SolveOut {
  const n = nodes.length;
  const removed = new Int8Array(n);
  const util = new Float32Array(n);
  const mode = new Int8Array(n);
  const snapX = new Float32Array(n);
  const load = new Float32Array(n);
  const order: number[] = [];
  for (let i = 0; i < n; i++) if (alive[i]) order.push(i);
  // Bottom to top. A piece always sits higher than whatever it rests on.
  order.sort((p, q) => nodes[p].y0 - nodes[q].y0 || p - q);
  const held = new Uint8Array(n);
  const inc: number[][] = new Array(n);
  const sa: number[] = [];
  const sb: number[] = [];
  const sr: number[] = [];
  const sm: number[] = [];
  const sj: number[] = [];

  for (let guard = 0; guard <= n; guard++) {
    held.fill(0);
    for (const i of order) {
      if (removed[i]) continue;
      const nd = nodes[i];
      let ok = nd.ground;
      if (!ok) for (const s of nd.below) if (held[s.j]) { ok = true; break; }
      if (ok) held[i] = 1;
      else removed[i] = UNSUPPORTED;
    }
    for (const i of order) inc[i] = [];
    let tipped = false;
    for (let k = order.length - 1; k >= 0; k--) {
      const i = order[k];
      if (!held[i]) continue;
      const nd = nodes[i];
      // Supports, left to right.
      sa.length = sb.length = sr.length = sm.length = sj.length = 0;
      if (nd.ground) { sa.push(nd.x0); sb.push(nd.x1); sj.push(-1); }
      else {
        for (const s of nd.below) if (held[s.j]) {
          let at = sa.length;
          while (at > 0 && sa[at - 1] > s.a) at--;
          sa.splice(at, 0, s.a); sb.splice(at, 0, s.b); sj.splice(at, 0, s.j);
        }
      }
      const ns = sa.length;
      for (let s = 0; s < ns; s++) { sr.push(0); sm.push(0); }
      let total = 0;
      let moment = 0;
      let bear = 0;
      for (let s = 0; s < ns; s++) bear += sb[s] - sa[s];
      const hullL = sa[0];
      const hullR = sb[ns - 1];
      let overL = 0;
      let overR = 0;
      const lists = [nd.samples, nd.ext, inc[i]];
      for (const list of lists) {
        for (let q = 0; q < list.length; q += 2) {
          const x = list[q];
          const f = list[q + 1];
          total += f;
          moment += f * x;
          if (x <= hullL) { sr[0] += f; sm[0] += f * hullL; overL += f * (hullL - x); continue; }
          if (x >= hullR) { sr[ns - 1] += f; sm[ns - 1] += f * hullR; overR += f * (x - hullR); continue; }
          for (let s = 0; s < ns; s++) {
            if (x <= sb[s]) {
              if (x >= sa[s]) { sr[s] += f; sm[s] += f * x; }
              else {
                // Between support s-1 and s: lever rule.
                const l = sb[s - 1];
                const r = sa[s];
                const fr = (f * (x - l)) / (r - l);
                sr[s] += fr; sm[s] += fr * r;
                sr[s - 1] += f - fr; sm[s - 1] += (f - fr) * l;
              }
              break;
            }
          }
        }
      }
      load[i] = total;
      if (total <= 0) continue;
      const xc = moment / total;
      if (xc < hullL - TOL || xc > hullR + TOL) {
        removed[i] = TIPS;
        tipped = true;
        break;
      }
      // Spanning pieces fail in bending; only posts, piers and walls are checked for crushing.
      let u = nd.bendCap > 0 ? 0 : total / (nd.crushPerM * Math.max(bear, 0.02));
      let md = 0;
      let sx = 0;
      if (nd.bendCap > 0) {
        let worst = overL;
        sx = hullL - 0.02;
        if (overR > worst) { worst = overR; sx = hullR + 0.02; }
        // Spans between supports.
        for (let s = 0; s + 1 < ns; s++) {
          const l = sb[s];
          const r = sa[s + 1];
          const len = r - l;
          if (len < 0.3) continue;
          const span = spanMoment(lists, l, r);
          if (span.m > worst) { worst = span.m; sx = span.x; }
        }
        const ub = worst / nd.bendCap;
        if (ub > u) { u = ub; md = 1; }
      }
      util[i] = u;
      mode[i] = md;
      snapX[i] = sx;
      for (let s = 0; s < ns; s++) {
        const j = sj[s];
        if (j < 0 || sr[s] <= 0) continue;
        inc[j].push(Math.min(sb[s], Math.max(sa[s], sm[s] / sr[s])), sr[s]);
      }
    }
    if (!tipped) break;
  }
  for (let i = 0; i < n; i++) if (removed[i]) { util[i] = 0; load[i] = 0; }
  return { removed, util, mode, snapX, load };
}

const spanX: number[] = [];
const spanF: number[] = [];

/** Largest bending moment of a simply supported span carrying the point loads inside it. */
function spanMoment(lists: number[][], l: number, r: number): { m: number; x: number } {
  spanX.length = spanF.length = 0;
  for (const list of lists) {
    for (let q = 0; q < list.length; q += 2) {
      const x = list[q];
      if (x <= l || x >= r) continue;
      let at = spanX.length;
      while (at > 0 && spanX[at - 1] > x) at--;
      spanX.splice(at, 0, x);
      spanF.splice(at, 0, list[q + 1]);
    }
  }
  const len = r - l;
  let left = 0;
  for (let q = 0; q < spanX.length; q++) left += (spanF[q] * (r - spanX[q])) / len;
  let best = 0;
  let bestX = (l + r) / 2;
  for (let q = 0; q < spanX.length; q++) {
    let m = left * (spanX[q] - l);
    for (let p = 0; p < q; p++) m -= spanF[p] * (spanX[q] - spanX[p]);
    if (m > best) { best = m; bestX = spanX[q]; }
  }
  return { m: best, x: bestX };
}
