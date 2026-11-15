import * as THREE from 'three';
import type { Part } from '../sim/parts';

/**
 * Procedural surface detail for the instanced house parts. The shared standard
 * materials are patched so the fragment shader works out brick pitting and
 * mortar shadow, roof tile lips, wood grain and plaster mottling from each
 * instance's own box coordinates. No textures, no extra draw calls: one
 * per-instance attribute (`aSurf`) carries the half size, the surface class and
 * a seed. The detail multiplies the per-instance colour, so damage tinting,
 * hit flashes and the weak point glow all still show through.
 */

const enum Surf {
  Plain = 0,
  Brick = 1,
  Stone = 2,
  Plaster = 3,
  Tile = 4,
  Wood = 5,
}

function surfClass(p: Part): number {
  switch (p.mat) {
    case 'brick':
    case 'oldBrick':
      return Surf.Brick;
    case 'foundation':
    case 'lintel':
    case 'slab':
      return Surf.Stone;
    case 'plaster':
      return Surf.Plaster;
    case 'tile':
      return Surf.Tile;
    case 'frame':
    case 'door':
    case 'deck':
    case 'timber':
    case 'floor':
    case 'wood':
    case 'fence':
      return Surf.Wood;
    default:
      return Surf.Plain;
  }
}

/** A steady 0..1 number per part, so a rebuilt or restored house looks the same. */
function seedOf(id: number): number {
  let h = (id + 1) * 0x9e3779b1;
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) % 9973) / 9973;
}

/** Per-instance (half x, half y, half z, class + seed) for one instanced mesh. */
export function surfaceAttribute(list: Part[]): THREE.InstancedBufferAttribute {
  const a = new Float32Array(list.length * 4);
  list.forEach((p, i) => {
    a[i * 4] = p.hx;
    a[i * 4 + 1] = p.hy;
    a[i * 4 + 2] = p.hz;
    // The class is the whole part, the seed the fraction (kept clear of 0 and 1).
    a[i * 4 + 3] = surfClass(p) + 0.04 + seedOf(p.id) * 0.92;
  });
  return new THREE.InstancedBufferAttribute(a, 4);
}

const VERT_HEAD = /* glsl */ `
attribute vec4 aSurf;
varying vec3 vSurfPos;
flat varying vec4 vSurf;
varying vec2 vSurfW;
`;

const VERT_BODY = /* glsl */ `
vSurfPos = position;
vSurf = aSurf;
{
  #ifdef USE_INSTANCING
    mat4 surfM = modelMatrix * instanceMatrix;
  #else
    mat4 surfM = modelMatrix;
  #endif
  // World height (dust low on the wall) and how far down the slope a roof tile fragment sits.
  vSurfW = vec2((surfM * vec4(position, 1.0)).y, -sign(surfM[2].y) * position.z / max(aSurf.z, 0.001));
}
`;

const FRAG_HEAD = /* glsl */ `
varying vec3 vSurfPos;
flat varying vec4 vSurf;
varying vec2 vSurfW;
float surfHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float surfNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(surfHash(i), surfHash(i + vec3(1, 0, 0)), f.x), mix(surfHash(i + vec3(0, 1, 0)), surfHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(surfHash(i + vec3(0, 0, 1)), surfHash(i + vec3(1, 0, 1)), f.x), mix(surfHash(i + vec3(0, 1, 1)), surfHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float surfRand(float s, float k) {
  return fract(sin(s * 91.345 + k * 47.853) * 43758.5453);
}
// Reorders v as (along the longest side, the middle side, the thinnest side) of a box with half size h.
vec3 surfSort(vec3 h, vec3 v) {
  if (h.x >= h.y && h.x >= h.z) return h.y >= h.z ? v.xyz : v.xzy;
  if (h.y >= h.z) return h.x >= h.z ? v.yxz : v.yzx;
  return h.x >= h.y ? v.zxy : v.zyx;
}
`;

const FRAG_BODY = /* glsl */ `
{
  float sKind = floor(vSurf.w + 0.001);
  if (sKind > 0.5) {
    float sSeed = floor(fract(vSurf.w) * 2048.0 + 0.5) / 2048.0;
    vec3 sH = vSurf.xyz;
    vec3 sP = vSurfPos;
    // Distance to the nearest edge of the box face this fragment is on.
    vec3 sD = max(sH - abs(sP), 0.0);
    float sEdge = sD.x + sD.y + sD.z - max(sD.x, max(sD.y, sD.z)) - min(sD.x, min(sD.y, sD.z));
    // Metres per pixel: fine detail fades out before it can shimmer.
    float sPx = length(fwidth(sP));
    float sFine = 1.0 - smoothstep(0.006, 0.02, sPx);
    float sMid = 1.0 - smoothstep(0.03, 0.12, sPx);
    vec3 sO = sP + sSeed * vec3(37.1, 17.3, 53.7);
    float r1 = surfRand(sSeed, 1.0);
    float r2 = surfRand(sSeed, 2.0);
    float r3 = surfRand(sSeed, 3.0);
    float sDust = (1.0 - smoothstep(0.15, 1.9, vSurfW.x)) * (0.55 + 0.45 * r3);
    vec3 sDet = vec3(1.0);
    if (sKind < 1.5) {
      // Brick: each one its own tone, now and then an odd one, pitted face, shadowed border.
      float tone = 1.0 + (r1 - 0.5) * 0.17;
      tone *= r2 > 0.9 ? 1.1 : r2 < 0.11 ? 0.86 : 1.0;
      float warm = (r3 - 0.5) * 0.07;
      sDet = tone * vec3(1.0 + warm, 1.0, 1.0 - warm);
      sDet *= 1.0 + (surfNoise(sO * 5.0) - 0.5) * 0.1 * sMid;
      sDet *= 1.0 - smoothstep(0.6, 0.9, surfNoise(sO * 22.0)) * 0.14 * sFine;
      float mortar = 1.0 - smoothstep(0.0, 0.032 + sPx, sEdge);
      sDet *= mix(vec3(1.0), vec3(0.64, 0.65, 0.68), mortar);
      sDet *= mix(vec3(1.0), vec3(0.88, 0.86, 0.82), sDust);
    } else if (sKind < 2.5) {
      // Cast stone and concrete: mottled, lightly pitted, grubby near the ground.
      sDet = vec3(1.0 + (r1 - 0.5) * 0.07);
      sDet *= 1.0 + (surfNoise(sO * 3.5) - 0.5) * 0.1 * sMid;
      sDet *= 1.0 - smoothstep(0.6, 0.9, surfNoise(sO * 20.0)) * 0.1 * sFine;
      sDet *= 1.0 - (1.0 - smoothstep(0.0, 0.025 + sPx * 1.5, sEdge)) * 0.16;
      sDet *= mix(vec3(1.0), vec3(0.9, 0.87, 0.82), sDust);
    } else if (sKind < 3.5) {
      // Plaster: soft trowel marks and a faint shadow at the joints.
      sDet = vec3(1.0 + (surfNoise(sO * 2.6) - 0.5) * 0.09 * sMid);
      sDet *= 1.0 - (1.0 - smoothstep(0.0, 0.03 + sPx * 1.5, sEdge)) * 0.07;
    } else if (sKind < 4.5) {
      // Roof tile: its own shade, a dark lower lip, pale weathered streaks down the slope.
      float tone = 1.0 + (r1 - 0.5) * 0.2;
      float warm = (r2 - 0.5) * 0.1;
      sDet = tone * vec3(1.0 + warm, 1.0, 1.0 - warm);
      float down = vSurfW.y;
      sDet *= 1.0 - smoothstep(0.55, 1.0, down) * 0.26;
      sDet *= 1.0 + smoothstep(-0.2, -1.0, down) * 0.06;
      float streak = surfNoise(vec3(sO.x * 9.0, sO.z * 1.4, sSeed * 9.0));
      sDet *= 1.0 + smoothstep(0.5, 0.85, streak) * 0.11 * (1.0 - smoothstep(0.01, 0.035, sPx));
      sDet *= 1.0 - (1.0 - smoothstep(0.0, 0.02 + sPx * 1.5, sEdge)) * 0.14;
    } else {
      // Wood: boards across the wide faces, fine grain along the length.
      vec3 q = surfSort(sH, sP);
      vec3 hq = surfSort(sH, sH);
      float boards = step(0.35, hq.y);
      float bw = 0.16;
      float bi = floor(q.y / bw);
      float bf = abs(fract(q.y / bw) - 0.5) * 2.0;
      float bt = surfRand(sSeed + bi * 0.071, 4.0);
      sDet = vec3(1.0 + (mix(r1, bt, boards) - 0.5) * 0.08);
      sDet *= 1.0 - boards * smoothstep(1.0 - (0.012 + sPx) / bw * 2.0, 1.0, bf) * 0.13 * sMid;
      float g = surfNoise(vec3(q.x * 1.7 + bt * 9.0 * boards, q.y * 46.0, q.z * 46.0) + sSeed * 23.0);
      sDet *= 1.0 + (g - 0.5) * 0.14 * sFine;
      sDet *= 1.0 + (surfNoise(vec3(q.x * 0.9, q.y * 9.0, q.z * 9.0) + sSeed * 5.0) - 0.5) * 0.07 * sMid;
    }
    diffuseColor.rgb *= sDet;
  }
}
`;

/** Adds the procedural detail to a standard material used by instanced house parts. */
export function patchSurface(mat: THREE.MeshStandardMaterial): void {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_BODY}`);
  };
  mat.customProgramCacheKey = () => 'golf-surface-2';
}
