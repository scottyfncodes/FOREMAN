import * as THREE from 'three';

/** Palette order matches MAT_INDEX. */
export const MAT_INDEX: Record<string, number> = { timber: 0, brick: 1, concrete: 2, steel: 3, glass: 4, gas: 5, crate: 6 };

export const PALETTE = {
  timber: '#cf9a58',
  brick: '#b4533b',
  concrete: '#b9b3a6',
  steel: '#4b5661',
  glass: '#a9d6dc',
  gas: '#d53a2c',
  crate: '#e3a72b',
  ink: '#262320',
  cream: '#efe8da',
  amber: '#f2b705',
  red: '#d6402b',
  blue: '#2c6cb0',
  mortar: '#d9cdb8',
};

export interface PieceUniforms {
  uTime: { value: number };
  uLoads: { value: number };
}

const lin = (hex: string): THREE.Color => new THREE.Color(hex);

/**
 * One material draws every piece of every building: per-instance attributes pick the
 * material pattern (drawn in the shader in metres, so bricks stay brick-sized on any piece),
 * the crack amount, the load reading and the outline.
 */
export function pieceMaterial(uniforms: PieceUniforms): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const pal = ['timber', 'brick', 'concrete', 'steel', 'glass', 'gas', 'crate'].map((k) => lin(PALETTE[k as keyof typeof PALETTE]));
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, {
      uPal: { value: pal },
      uInk: { value: lin(PALETTE.ink) },
      uCream: { value: lin(PALETTE.cream) },
      uAmber: { value: lin(PALETTE.amber) },
      uHot: { value: lin(PALETTE.red) },
      uWarm: { value: lin('#e9b23a') },
      uCool: { value: lin('#6aa86a') },
      uBlue: { value: lin(PALETTE.blue) },
      uMortar: { value: lin(PALETTE.mortar) },
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 aSize;
attribute vec4 aInfo;
attribute vec2 aMore;
varying vec3 vLocal;
varying vec3 vObjN;
varying vec3 vSize;
varying vec4 vInfo;
varying vec2 vMore;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vLocal = position * aSize;
vObjN = normal;
vSize = aSize;
vInfo = aInfo;
vMore = aMore;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
uniform float uLoads;
uniform vec3 uPal[7];
uniform vec3 uInk;
uniform vec3 uCream;
uniform vec3 uAmber;
uniform vec3 uHot;
uniform vec3 uWarm;
uniform vec3 uCool;
uniform vec3 uBlue;
uniform vec3 uMortar;
varying vec3 vLocal;
varying vec3 vObjN;
varying vec3 vSize;
varying vec4 vInfo;
varying vec2 vMore;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec3 an = abs(vObjN);
  vec3 hsz = vSize * 0.5;
  vec2 uv; vec2 hs;
  bool front = an.z > 0.5;
  if (front) { uv = vLocal.xy; hs = hsz.xy; }
  else if (an.y > an.x) { uv = vLocal.xz; hs = hsz.xz; }
  else { uv = vLocal.zy; hs = hsz.zy; }
  int mi = int(vInfo.x + 0.5);
  float fl = floor(vInfo.w + 0.5);
  float sel = mod(fl, 2.0);
  float prot = mod(floor(fl / 2.0), 2.0);
  float infill = mod(floor(fl / 4.0), 2.0);
  float shape = vMore.x;
  float seed = vMore.y;
  vec2 p = uv + seed * 7.31;
  vec3 col = uPal[mi];
  if (mi == 0) {
    vec2 q = hs.x >= hs.y ? p : p.yx;
    col *= 0.9 + 0.16 * vnoise(vec2(q.x * 0.9, q.y * 11.0));
    col *= 1.0 - 0.1 * step(0.93, fract(q.y / 0.21 + seed));
  } else if (mi == 1) {
    float row = floor(p.y / 0.16);
    float bx = p.x / 0.42 + 0.5 * mod(row, 2.0);
    vec2 f = vec2(fract(bx), fract(p.y / 0.16));
    float m = clamp(step(f.x, 0.07) + step(f.y, 0.15), 0.0, 1.0);
    col *= 0.8 + 0.34 * h21(vec2(floor(bx), row));
    col = mix(col, uMortar, m * 0.8);
  } else if (mi == 2) {
    col *= 0.92 + 0.12 * vnoise(p * 8.0);
    col *= 1.0 - 0.1 * step(fract(p.y / 0.9 + 0.3), 0.025);
    col *= 1.0 - 0.25 * step(length(fract(p / vec2(0.6, 0.9) + 0.3) - 0.5), 0.035);
  } else if (mi == 3) {
    col *= 0.9 + 0.18 * smoothstep(-hs.y, hs.y, uv.y);
    float fx = hs.x < hs.y ? abs(uv.x) / hs.x : abs(uv.y) / hs.y;
    col *= 1.0 + 0.22 * step(0.55, fx);
  } else if (mi == 4) {
    float g = fract((p.x + p.y) * 0.5);
    float glint = smoothstep(0.38, 0.44, g) * smoothstep(0.62, 0.56, g);
    col = mix(col, vec3(1.0), 0.3 * glint);
    col *= 0.86 + 0.22 * smoothstep(-hs.y, hs.y, uv.y);
  } else if (mi == 5) {
    col = mix(col, uCream, step(abs(uv.y - hs.y * 0.2), hs.y * 0.16));
    col = mix(col, uInk, 0.85 * step(hs.y * 0.7, uv.y));
  } else {
    float fr = step(min(hs.x - abs(uv.x), hs.y - abs(uv.y)), 0.1);
    float cross = step(abs(abs(uv.x) - abs(uv.y)), 0.05);
    col = mix(col, col * 0.62, max(fr, cross));
  }
  if (infill > 0.5) col = mix(col, uCream, 0.3);
  float dmg = vInfo.y;
  if (dmg > 0.01) {
    // Cracks: the borders of a jittered cell pattern, let in piece by piece as damage grows.
    vec2 cp = p * vec2(2.1, 1.5) + seed * 31.0;
    cp += 0.18 * vec2(vnoise(p * 6.0), vnoise(p * 6.0 + 7.7));
    vec2 ci = floor(cp);
    vec2 cf = fract(cp);
    float f1 = 9.0;
    float f2 = 9.0;
    for (int yy = -1; yy <= 1; yy++) for (int xx = -1; xx <= 1; xx++) {
      vec2 g = vec2(float(xx), float(yy));
      vec2 o = vec2(h21(ci + g), h21(ci + g + 13.7));
      float dd = length(g + o - cf);
      if (dd < f1) { f2 = f1; f1 = dd; } else if (dd < f2) { f2 = dd; }
    }
    float w = 0.022 + 0.03 * dmg;
    float reach = step(1.0 - dmg * 1.15, h21(ci + 3.1) * 0.6 + vnoise(p * 0.9 + seed * 5.0) * 0.5);
    float c = (1.0 - smoothstep(w * 0.4, w, f2 - f1)) * reach;
    col = mix(col, uInk, c * 0.9);
  }
  float e = min(hs.x - abs(uv.x), hs.y - abs(uv.y));
  if (front && shape > 0.5) {
    float slope = shape < 1.5
      ? ((hs.x - abs(uv.x)) * 2.0 * hs.y - (uv.y + hs.y) * hs.x) / sqrt(4.0 * hs.y * hs.y + hs.x * hs.x)
      : (hs.y * (shape > 2.5 ? -uv.x : uv.x) - hs.x * uv.y) / sqrt(hs.x * hs.x + hs.y * hs.y);
    e = min(e, slope);
  }
  float ink = 1.0 - smoothstep(0.012, 0.04, e);
  if (uLoads > 0.5 && mi < 4) {
    float u = clamp(vInfo.z, 0.0, 1.0);
    vec3 heat = u < 0.5 ? mix(uCool, uWarm, u * 2.0) : mix(uWarm, uHot, (u - 0.5) * 2.0);
    float lum = dot(col, vec3(0.3, 0.5, 0.2));
    col = infill > 0.5 ? vec3(lum) * 0.7 + 0.2 : mix(vec3(lum), heat, 0.82);
  }
  if (vInfo.z > 1.0) col = mix(col, uHot, 0.4 + 0.3 * sin(uTime * 24.0));
  col = mix(col, prot > 0.5 ? uBlue : uInk, ink * (prot > 0.5 ? 0.95 : 0.62));
  if (sel > 0.5) {
    float ring = 1.0 - smoothstep(0.07, 0.11, e);
    col = mix(col, uAmber, max(ring, 0.3 + 0.14 * sin(uTime * 7.0)));
  }
  diffuseColor.rgb = col;
}`,
      );
  };
  return mat;
}
