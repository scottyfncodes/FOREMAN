import * as THREE from 'three';
import { buildGolfer } from '../../golf/render/models';
import type { Effect, GameEvent, Session } from '../game/session';
import { FACE_Z, flightAt, TEE_Z, type Flight } from '../game/shot';
import { GONE, STANDING, type Member, type Pose } from '../sim/world';
import { BALLS, type BallKind, type Mat } from '../sim/types';
import { board, buildRange, type Range } from './range';
import { MAT_INDEX, PALETTE, pieceMaterial, type PieceUniforms } from './shader';

const MAX_FRAGS = 1500;
const GUIDE_DOTS = 18;
const TRAIL = 16;
const MAX_DUST = 260;
const FRONT = FACE_Z;

/** What the player is doing right now, for the golfer, the guide and the camera. */
export interface AimState {
  target: { x: number; y: number } | null;
  power: number;
  ball: BallKind;
  plan: Flight | null;
  effect: Effect | null;
  pulling: boolean;
}

/** Depth of a piece along the view axis, and how far its middle sits back. */
function depthOf(m: Member): [number, number] {
  if (m.mat === 'glass') return [0.14, 0.2];
  if (m.mat === 'gas' || m.mat === 'crate') return [Math.min(m.w, 0.7), 0];
  if (m.layer === 1) return [0.9, -0.12];
  if (m.shape !== 'box') return [2.05, 0];
  if (m.w > m.h * 1.5) return [1.9, 0];
  return [1.6, 0];
}

function prism(points: [number, number][]): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  return g;
}

interface Batch {
  mesh: THREE.InstancedMesh;
  size: THREE.InstancedBufferAttribute;
  info: THREE.InstancedBufferAttribute;
  more: THREE.InstancedBufferAttribute;
  count: number;
}

interface Frag {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rx: number; ry: number; rz: number;
  wx: number; wy: number; wz: number;
  sx: number; sy: number; sz: number;
  rest: boolean;
  floor: number;
}

function puffTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/**
 * Draws a session. Reads the simulation, never writes it. Buildings are a miniature set:
 * every piece is a solid block with drawn edges, lit by one low sun.
 */
export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(26, 1, 0.5, 1400);
  private uniforms: PieceUniforms = { uTime: { value: 0 }, uLoads: { value: 0 } };
  private batches: Batch[] = [];
  private session!: Session;
  private root = new THREE.Group();
  private fragMesh: THREE.InstancedMesh;
  private frags: Frag[] = [];
  private fragNext = 0;
  private dust: THREE.Points;
  private dustData = new Float32Array(MAX_DUST * 8);
  private dustNext = 0;
  private flashes: { mesh: THREE.Mesh; life: number; max: number; grow: number }[] = [];
  private flashGeo = new THREE.CircleGeometry(1, 28);
  private ringGeo = new THREE.RingGeometry(0.86, 1, 40);
  private line = new THREE.Group();
  private pipes: { mesh: THREE.Mesh; host: number }[] = [];
  private golfer: { body: THREE.Group; swing: THREE.Group };
  private swingT = -1;
  private ball: THREE.Mesh;
  private ballMats = {} as Record<BallKind, THREE.MeshStandardMaterial>;
  private guide: THREE.InstancedMesh;
  private trail: THREE.InstancedMesh;
  private trailPts: number[] = [];
  private reticle: THREE.Mesh;
  private env: Range | null = null;
  private marks: { mesh: THREE.Mesh; host: number }[] = [];
  private dead: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; r: number } | null = null;
  /** 0 = behind the golfer, 1 = up close on the building. */
  private cam = 0;
  aim: AimState = { target: null, power: 0, ball: 'standard', plan: null, effect: null, pulling: false };
  /** Hold the close view (results on screen). */
  holdClose = false;
  private target = new THREE.Vector3();
  private dist = 30;
  private trauma = 0;
  private push = 0;
  private dummy = new THREE.Object3D();
  private pose: Pose = { x: 0, y: 0, a: 0 };
  private color = new THREE.Color();
  private rnd = 1;
  private tmpV = { x: 0, y: 0, z: 0 };
  private w = 1;
  private h = 1;
  private insetTop = 0;
  private insetBottom = 0;
  selected = -1;
  calm = false;
  private time = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.pad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ color: '#b5a892' }));
    this.pad.rotation.x = -Math.PI / 2;
    this.pad.receiveShadow = true;
    this.scene.add(this.pad);

    // Late sun, low and warm, coming across the range from the left.
    this.scene.background = new THREE.Color('#f1d3a6');
    this.scene.fog = new THREE.Fog('#ecd0aa', 150, 620);
    this.scene.add(new THREE.HemisphereLight('#dcecff', '#c79a62', 1.25));
    const sun = new THREE.DirectionalLight('#ffd9a3', 2.9);
    sun.position.set(-14, 26, 22);
    sun.castShadow = true;
    const big = Math.min(window.innerWidth, window.innerHeight) >= 700;
    sun.shadow.mapSize.set(big ? 2048 : 1024, big ? 2048 : 1024);
    sun.shadow.bias = -0.0015;
    sun.shadow.normalBias = 0.04;
    this.sun = sun;
    this.scene.add(sun, sun.target);
    this.scene.add(this.root);

    const fragMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.fragMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), fragMat, MAX_FRAGS);
    this.fragMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fragMesh.count = 0;
    this.fragMesh.castShadow = true;
    this.fragMesh.frustumCulled = false;
    this.fragMesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.scene.add(this.fragMesh);

    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_DUST * 3), 3));
    dg.setAttribute('aDust', new THREE.BufferAttribute(new Float32Array(MAX_DUST * 2), 2));
    this.dust = new THREE.Points(
      dg,
      new THREE.ShaderMaterial({
        uniforms: { uMap: { value: puffTexture() }, uScale: { value: 1 }, uTint: { value: new THREE.Color('#e2c9a2') } },
        vertexShader: `attribute vec2 aDust; varying float vA; uniform float uScale;
          void main(){ vA = aDust.y; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aDust.x * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform sampler2D uMap; uniform vec3 uTint; varying float vA;
          void main(){ float a = texture2D(uMap, gl_PointCoord).a * vA; if (a < 0.004) discard; gl_FragColor = vec4(uTint, a); }`,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 5;
    this.scene.add(this.dust);

    // The pro: faded shirt, straw hat, seen better days.
    const g = buildGolfer(0x4f8f8a);
    this.golfer = g;
    const straw = new THREE.MeshStandardMaterial({ color: 0xd9c08a, roughness: 0.9 });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.03, 18), straw);
    brim.position.set(0.33 - 0.82, 1.76, 0);
    brim.rotation.z = -0.28;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.16, 14), straw);
    crown.position.set(0.31 - 0.82, 1.84, 0);
    crown.rotation.z = -0.28;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.153, 0.153, 0.04, 14), new THREE.MeshStandardMaterial({ color: 0x5a2f26 }));
    band.position.set(0.325 - 0.82, 1.79, 0);
    band.rotation.z = -0.28;
    for (const o of [brim, crown, band]) { o.castShadow = true; g.body.add(o); }
    (g.body.children[0] as THREE.Object3D).position.x = -0.82;
    g.swing.position.x = 0.24 - 0.82;
    this.scene.add(g.body);
    for (const k of Object.keys(BALLS) as BallKind[]) this.ballMats[k] = new THREE.MeshStandardMaterial({ color: BALLS[k].color, roughness: 0.35 });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), this.ballMats.standard);
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    this.guide = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false }), GUIDE_DOTS);
    this.guide.frustumCulled = false;
    this.guide.renderOrder = 6;
    this.scene.add(this.guide);
    this.trail = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }), TRAIL);
    this.trail.frustumCulled = false;
    this.trail.count = 0;
    this.scene.add(this.trail);
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.72, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false }));
    this.reticle.renderOrder = 7;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), this.reticle.material);
    dot.renderOrder = 7;
    this.reticle.add(dot);
    this.scene.add(this.reticle);
    this.scene.add(this.line);
  }

  private sun: THREE.DirectionalLight;
  private pad: THREE.Mesh;

  private rand(): number {
    this.rnd = (this.rnd * 16807) % 2147483647;
    return this.rnd / 2147483647;
  }

  private makeBatch(geo: THREE.BufferGeometry, cap: number): Batch {
    const mesh = new THREE.InstancedMesh(geo, this.material, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const size = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    const info = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    const more = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
    size.setUsage(THREE.DynamicDrawUsage);
    info.setUsage(THREE.DynamicDrawUsage);
    more.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aSize', size);
    geo.setAttribute('aInfo', info);
    geo.setAttribute('aMore', more);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.root.add(mesh);
    return { mesh, size, info, more, count: 0 };
  }

  private material = pieceMaterial(this.uniforms);

  /** Loads a session: builds the instanced batches, the line, the pipes, and frames the camera. */
  load(session: Session): void {
    this.session = session;
    for (const b of this.batches) { this.root.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.dispose(); }
    for (const p of this.pipes) { this.root.remove(p.mesh); p.mesh.geometry.dispose(); }
    this.pipes = [];
    const cap = 760;
    for (const m of this.marks) { this.root.remove(m.mesh); m.mesh.geometry.dispose(); }
    this.marks = [];
    this.batches = [
      this.makeBatch(new THREE.BoxGeometry(1, 1, 1), cap),
      this.makeBatch(prism([[-0.5, -0.5], [0.5, -0.5], [0, 0.5]]), 24),
      this.makeBatch(prism([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5]]), 24),
      this.makeBatch(prism([[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5]]), 24),
    ];
    this.fragMesh.count = 0;
    this.frags = [];
    this.fragNext = 0;
    this.dustData.fill(0);
    for (const f of this.flashes) this.scene.remove(f.mesh);
    this.flashes = [];
    this.selected = -1;
    this.trauma = 0;
    this.push = 0;
    this.rnd = 12345;
    this.cam = 0;
    this.dead = null;
    this.swingT = -1;
    this.trailPts = [];

    const level = session.level;
    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = 0;
    for (const m of level.members) {
      minX = Math.min(minX, m.x);
      maxX = Math.max(maxX, m.x + m.w);
      maxY = Math.max(maxY, m.y + m.h);
    }
    this.bounds = { minX, maxX, maxY };
    const cx = (minX + maxX) / 2;
    const wide = maxX - minX;
    this.pad.scale.set(wide + 5, 6, 1);
    this.pad.position.set(cx, 0.03, 0.2);
    if (this.env) { this.scene.remove(this.env.group); }
    this.env = buildRange(wide, TEE_Z);
    this.env.group.position.x = cx;
    this.scene.add(this.env.group);
    this.golfer.body.position.set(cx, 0, TEE_Z);
    for (const sg of session.level.signs ?? []) {
      const hostDef = session.level.members[sg.host];
      const mesh = board(sg.text, sg.w, sg.h, sg.bg ?? '#efe8da', sg.fg ?? '#1b1a18');
      mesh.position.set(sg.x + sg.w / 2, sg.y + sg.h / 2, (hostDef.layer === 1 ? 0.33 : hostDef.shape && hostDef.shape !== 'box' ? 1.03 : hostDef.w > hostDef.h * 1.5 ? 0.95 : FRONT - 0.05) + 0.03);
      this.root.add(mesh);
      this.marks.push({ mesh, host: sg.host });
    }
    // A painted ring marks a piece with a ball sealed in it.
    session.level.members.forEach((d, i) => {
      if (!d.hidden || d.hidden === 'gas') return;
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.13, 0.22, 24), new THREE.MeshBasicMaterial({ color: BALLS[d.hidden].color }));
      const core = new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), new THREE.MeshBasicMaterial({ color: BALLS[d.hidden].accent }));
      mesh.add(core);
      mesh.position.set(d.x + d.w / 2, d.y + d.h / 2, (d.layer === 1 ? 0.33 : FRONT - 0.05) + 0.02);
      this.root.add(mesh);
      this.marks.push({ mesh, host: i });
    });

    // The line everything has to end up under.
    this.line.clear();
    const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.red });
    const span = maxX - minX + 14;
    for (let x = -span / 2; x < span / 2; x += 0.62) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.07, 0.03), lineMat);
      dash.position.set((minX + maxX) / 2 + x + 0.18, level.lineY, FRONT + 0.12);
      this.line.add(dash);
    }

    const pipeMat = new THREE.MeshLambertMaterial({ color: PALETTE.amber });
    for (const p of level.pipes ?? []) {
      const len = Math.hypot(p.x1 - p.x0, p.y1 - p.y0) + 0.1;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.1), pipeMat);
      mesh.position.set((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, FRONT + 0.1);
      mesh.rotation.z = Math.atan2(p.y1 - p.y0, p.x1 - p.x0);
      mesh.castShadow = true;
      this.root.add(mesh);
      this.pipes.push({ mesh, host: p.host ?? -1 });
    }
    this.frame();
    this.sync(0);
  }

  private bounds = { minX: 0, maxX: 1, maxY: 1 };

  /** Canvas size and the strips the HUD covers at the top and bottom, in CSS pixels. */
  resize(w: number, h: number, insetTop: number, insetBottom: number): void {
    this.w = w;
    this.h = h;
    this.insetTop = insetTop;
    this.insetBottom = insetBottom;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    (this.dust.material as THREE.ShaderMaterial).uniforms.uScale.value = (h * this.renderer.getPixelRatio()) / (2 * Math.tan((26 * Math.PI) / 360));
    if (this.session) this.frame();
  }

  private frame(): void {
    const { minX, maxX, maxY } = this.bounds;
    const side = this.w < this.h ? 1.5 : 3.2;
    const wide = maxX - minX + side * 2;
    const tall = maxY + 1.4;
    const free = Math.max(0.35, 1 - (this.insetTop + this.insetBottom) / this.h);
    const tan = Math.tan((26 * Math.PI) / 360);
    const distV = tall / free / (2 * tan);
    const distH = wide / (2 * tan * this.camera.aspect);
    this.dist = Math.max(distV, distH) * 1.04;
    const visible = 2 * tan * this.dist;
    // Sit the building in the lower part of the space the HUD leaves free.
    const slack = Math.max(0, free * visible - tall);
    const groundAt = (this.insetBottom / this.h) * visible + 0.7 + slack * 0.3;
    this.target.set((minX + maxX) / 2, visible / 2 - groundAt, 0);
    const s = Math.max(wide, tall) * 0.75 + 6;
    const cam = this.sun.shadow.camera;
    cam.left = -s; cam.right = s; cam.top = s; cam.bottom = -s; cam.near = 1; cam.far = 120;
    cam.updateProjectionMatrix();
    this.sun.target.position.set((minX + maxX) / 2, maxY / 2, 0);
    this.sun.position.set((minX + maxX) / 2 - 30, maxY / 2 + 17, 26);
  }

  /** World point on the building's face under a screen position. */
  pick(clientX: number, clientY: number, rect: DOMRect): { x: number; y: number } {
    const ndc = new THREE.Vector3(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1, 0.5);
    ndc.unproject(this.camera);
    const o = this.camera.position;
    const dir = ndc.sub(o).normalize();
    const t = (FRONT - o.z) / dir.z;
    return { x: o.x + dir.x * t, y: o.y + dir.y * t };
  }

  /** Screen position (CSS pixels) of a point on the building's face. */
  project(x: number, y: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, FRONT).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h };
  }

  set loads(on: boolean) {
    this.uniforms.uLoads.value = on ? 1 : 0;
  }

  shake(amount: number): void {
    if (this.calm) amount *= 0.25;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Draws in on the action for a moment (used with slow motion). */
  lean(amount: number): void {
    this.push = Math.max(this.push, amount);
  }

  private spawnFrags(e: Extract<GameEvent, { t: 'break' }>): void {
    const mat = e.mat;
    const area = e.w * e.h;
    const n = Math.round(Math.min(46, Math.max(6, area * (mat === 'glass' ? 30 : mat === 'brick' ? 22 : 13))));
    const c = Math.cos(e.a);
    const s = Math.sin(e.a);
    const burst = e.cause === 'ball' ? 5 : e.cause === 'blast' ? 8 : e.cause === 'impact' ? 3 : 2.2;
    const base = this.color.set(PALETTE[mat as keyof typeof PALETTE] ?? PALETTE.concrete);
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);
    for (let i = 0; i < n; i++) {
      const u = this.rand() - 0.5;
      const v = this.rand() - 0.5;
      const lx = u * e.w;
      const ly = v * e.h;
      let sx: number;
      let sy: number;
      let sz: number;
      if (mat === 'timber') { sx = 0.2 + this.rand() * 0.55; sy = 0.03 + this.rand() * 0.05; sz = 0.04 + this.rand() * 0.08; }
      else if (mat === 'glass') { sx = 0.12 + this.rand() * 0.22; sy = 0.1 + this.rand() * 0.2; sz = 0.02; }
      else if (mat === 'brick') { sx = this.rand() < 0.5 ? 0.22 : 0.11; sy = 0.075; sz = 0.105; }
      else if (mat === 'steel' || mat === 'gas') { sx = 0.2 + this.rand() * 0.3; sy = 0.05; sz = 0.12; }
      else { sx = 0.08 + this.rand() * 0.2; sy = 0.07 + this.rand() * 0.14; sz = 0.07 + this.rand() * 0.14; }
      const k = Math.min(1, Math.min(e.w, e.h) / 0.3);
      sx *= 0.6 + 0.4 * k;
      const ang = this.rand() * Math.PI * 2;
      const sp = burst * (0.25 + this.rand() * 0.9);
      const f: Frag = {
        x: e.x + c * lx - s * ly, y: Math.max(0.05, e.y + s * lx + c * ly), z: (this.rand() - 0.5) * 1.2,
        vx: e.vx * 0.7 + Math.cos(ang) * sp * 0.8, vy: e.vy * 0.7 + Math.sin(ang) * sp * 0.7 + (e.cause === 'crush' ? 0.5 : 1.8), vz: (e.cause === 'ball' ? -(0.6 + this.rand()) : this.rand() - 0.25) * sp * 0.9,
        rx: this.rand() * 6, ry: this.rand() * 6, rz: e.a + this.rand() * 0.6,
        wx: (this.rand() - 0.5) * 14, wy: (this.rand() - 0.5) * 14, wz: (this.rand() - 0.5) * 14,
        sx, sy, sz, rest: false, floor: sy / 2,
      };
      const idx = this.fragNext;
      this.fragNext = (this.fragNext + 1) % MAX_FRAGS;
      this.frags[idx] = f;
      this.fragMesh.count = Math.max(this.fragMesh.count, idx + 1);
      this.color.setHSL(hsl.h, hsl.s, Math.min(0.92, hsl.l * (0.78 + this.rand() * 0.42)));
      this.fragMesh.setColorAt(idx, this.color);
    }
    if (this.fragMesh.instanceColor) this.fragMesh.instanceColor.needsUpdate = true;
    const puffs = mat === 'glass' ? 0 : Math.min(6, 1 + Math.round(area * 1.4));
    for (let i = 0; i < puffs; i++) this.puff(e.x + (this.rand() - 0.5) * e.w, e.y + (this.rand() - 0.5) * e.h, (this.rand() - 0.5) * 1.6, 0.3 + this.rand() * 0.8, 1.0 + this.rand() * 1.4, 0.34);
  }

  /** One dust puff: position, drift, size in metres, opacity. */
  private puff(x: number, y: number, vx: number, vy: number, size: number, alpha: number): void {
    const i = this.dustNext * 8;
    this.dustNext = (this.dustNext + 1) % MAX_DUST;
    const d = this.dustData;
    d[i] = x; d[i + 1] = Math.max(0.1, y); d[i + 2] = vx; d[i + 3] = vy;
    d[i + 4] = size; d[i + 5] = alpha; d[i + 6] = 0; d[i + 7] = 1.6 + this.rand() * 1.6;
  }

  private flash(x: number, y: number, r: number): void {
    const core = new THREE.Mesh(this.flashGeo, new THREE.MeshBasicMaterial({ color: '#fff1c2', transparent: true, depthTest: false, blending: THREE.AdditiveBlending }));
    core.position.set(x, y, FRONT + 0.5);
    core.scale.setScalar(r * 0.35);
    core.renderOrder = 8;
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, depthTest: false }));
    ring.position.set(x, y, FRONT + 0.5);
    ring.scale.setScalar(r * 0.3);
    ring.renderOrder = 8;
    this.scene.add(core, ring);
    this.flashes.push({ mesh: core, life: 0.16, max: 0.16, grow: r * 3.2 }, { mesh: ring, life: 0.34, max: 0.34, grow: r * 3.4 });
  }

  /** Feeds the frame's events to the effects. */
  consume(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.t) {
        case 'break':
          this.spawnFrags(e);
          if (e.cause === 'ball') this.shake(0.16);
          break;
        case 'strike': {
          this.trailPts.length = 0;
          if (e.effect === 'short') { for (let i = 0; i < 3; i++) this.puff(e.x + (this.rand() - 0.5) * 0.3, 0.15, (this.rand() - 0.5), 0.5, 0.5, 0.25); }
          if (e.effect === 'weaken' || e.effect === 'none' || e.effect === 'short') {
            // It did not go through: the ball comes back off the face and dies on the grass.
            const back = e.effect === 'short' ? -2 : 5 + this.rand() * 2;
            this.dead = { x: e.x, y: Math.max(0.2, e.y), z: e.z + 0.2, vx: (this.rand() - 0.5) * 2, vy: e.effect === 'short' ? 2.5 : 1.5, vz: back, life: 1.6, r: BALLS[e.ball].radius };
          }
          if (e.effect === 'weaken' || e.effect === 'none') { this.shake(0.1); for (let i = 0; i < 4; i++) this.puff(e.x + (this.rand() - 0.5) * 0.3, e.y + (this.rand() - 0.5) * 0.3, (this.rand() - 0.5) * 1.5, 0.3, 0.5 + this.rand() * 0.4, 0.3); }
          break;
        }
        case 'boom':
          this.flash(e.x, e.y, e.r);
          this.shake(0.55);
          for (let i = 0; i < 14; i++) { const a = this.rand() * Math.PI * 2; this.puff(e.x + Math.cos(a) * 0.6, e.y + Math.sin(a) * 0.5, Math.cos(a) * 3.2, Math.sin(a) * 2.2 + 0.6, 1.6 + this.rand() * 1.6, 0.42); }
          break;
        case 'impact': {
          const k = Math.min(1, e.j / 26000);
          this.shake(0.06 + k * 0.4);
          if (e.y < 1.2) {
            const n = 2 + Math.round(k * 7);
            for (let i = 0; i < n; i++) { const dir = this.rand() < 0.5 ? -1 : 1; this.puff(e.x + dir * this.rand() * 0.6, 0.25, dir * (1.2 + this.rand() * 3.4 * (0.4 + k)), 0.15 + this.rand() * 0.5, 1.2 + this.rand() * 1.8 * (0.5 + k), 0.2 + k * 0.22); }
          } else if (k > 0.1) this.puff(e.x, e.y, (this.rand() - 0.5) * 1.5, 0.4, 0.9 + k * 1.4, 0.28);
          break;
        }
        case 'loose':
          this.shake(Math.min(0.3, e.mass / 60000));
          break;
        case 'snap':
          this.shake(0.18);
          for (let i = 0; i < 4; i++) this.puff(e.x + (this.rand() - 0.5) * 0.4, e.y, (this.rand() - 0.5) * 1.4, -0.4 - this.rand(), 0.7 + this.rand() * 0.7, 0.3);
          break;
        case 'strain':
          for (let i = 0; i < 2; i++) this.puff(e.x + (this.rand() - 0.5) * 0.3, e.y + (this.rand() - 0.3) * 0.8, (this.rand() - 0.5) * 0.5, -0.6, 0.45, 0.32);
          break;
        default:
          break;
      }
    }
  }

  /** Advances the effects and uploads the scene. dt is real seconds, scale is slow motion. */
  sync(dt: number, scale = 1): void {
    const sim = this.session.sim;
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    const counts = [0, 0, 0, 0];
    const d = this.dummy;
    for (const m of sim.members) {
      if (m.state === GONE) continue;
      const bi = m.shape === 'box' ? 0 : m.shape === 'gable' ? 1 : m.shape === 'shedR' ? 2 : 3;
      const b = this.batches[bi];
      const i = counts[bi]++;
      if (i >= b.mesh.instanceMatrix.count) continue;
      const p = sim.pose(m, this.pose);
      const [depth, back] = depthOf(m);
      d.position.set(p.x, p.y, back);
      d.rotation.set(0, 0, p.a);
      d.scale.set(m.w, m.h, depth);
      d.updateMatrix();
      b.mesh.setMatrixAt(i, d.matrix);
      b.size.setXYZ(i, m.w, m.h, depth);
      const standing = m.state === STANDING;
      const frame = m.layer !== 1 && m.mat !== 'glass';
      const dmg = Math.max(m.weak * 0.9, m.dmg, standing ? (frame ? Math.max(0, (m.util - 0.7) * 1.1) : 0) : 0.25);
      const flags = (m.id === this.selected ? 1 : 0) + (m.protect ? 2 : 0) + (m.layer === 1 ? 4 : 0);
      b.info.setXYZW(i, MAT_INDEX[m.mat], Math.min(1, dmg), standing ? m.util : 0, flags);
      b.more.setXY(i, bi === 0 ? 0 : bi === 1 ? 1 : bi === 2 ? 2 : 3, ((m.id * 0.6180339) % 1));
    }
    this.batches.forEach((b, bi) => {
      b.mesh.count = Math.min(counts[bi], b.mesh.instanceMatrix.count);
      b.mesh.instanceMatrix.needsUpdate = true;
      b.size.needsUpdate = true;
      b.info.needsUpdate = true;
      b.more.needsUpdate = true;
    });
    for (const p of this.pipes) p.mesh.visible = p.host < 0 || sim.members[p.host].state === STANDING;

    // Debris: thrown, bounced once or twice, then left where it lands.
    const sdt = dt * scale;
    let moved = false;
    for (let i = 0; i < this.frags.length; i++) {
      const f = this.frags[i];
      if (!f) continue;
      if (!f.rest) {
        moved = true;
        f.vy -= 10 * sdt;
        f.x += f.vx * sdt; f.y += f.vy * sdt; f.z += f.vz * sdt;
        f.rx += f.wx * sdt; f.ry += f.wy * sdt; f.rz += f.wz * sdt;
        if (f.y < f.floor) {
          f.y = f.floor;
          if (Math.abs(f.vy) < 1.3) { f.rest = true; f.rx = 0; f.ry = 0; f.rz = Math.round(f.rz / Math.PI) * Math.PI; }
          else { f.vy = -f.vy * 0.32; f.vx *= 0.6; f.vz *= 0.6; f.wx *= 0.5; f.wy *= 0.5; f.wz *= 0.5; }
        }
        d.position.set(f.x, f.y, f.z);
        d.rotation.set(f.rx, f.ry, f.rz);
        d.scale.set(f.sx, f.sy, f.sz);
        d.updateMatrix();
        this.fragMesh.setMatrixAt(i, d.matrix);
      }
    }
    if (moved) this.fragMesh.instanceMatrix.needsUpdate = true;

    const pos = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    const aux = this.dust.geometry.getAttribute('aDust') as THREE.BufferAttribute;
    const dd = this.dustData;
    for (let i = 0; i < MAX_DUST; i++) {
      const o = i * 8;
      if (dd[o + 7] <= 0) { aux.setXY(i, 0, 0); continue; }
      dd[o + 6] += sdt;
      const t = dd[o + 6] / dd[o + 7];
      if (t >= 1) { dd[o + 7] = 0; aux.setXY(i, 0, 0); continue; }
      const drag = Math.exp(-1.6 * sdt);
      dd[o + 2] *= drag; dd[o + 3] = dd[o + 3] * drag + 0.25 * sdt;
      dd[o] += dd[o + 2] * sdt; dd[o + 1] += dd[o + 3] * sdt;
      pos.setXYZ(i, dd[o], dd[o + 1], FRONT + 0.6);
      aux.setXY(i, dd[o + 4] * (0.55 + t * 1.5), dd[o + 5] * Math.min(1, t * 9) * (1 - t) * (1 - t));
    }
    pos.needsUpdate = true;
    aux.needsUpdate = true;

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      const t = 1 - Math.max(0, f.life) / f.max;
      f.mesh.scale.setScalar(f.mesh.scale.x + f.grow * dt);
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * (1 - t);
      if (f.life <= 0) { this.scene.remove(f.mesh); (f.mesh.material as THREE.Material).dispose(); this.flashes.splice(i, 1); }
    }

    this.env?.update(dt, this.time);
    for (const mk of this.marks) mk.mesh.visible = sim.members[mk.host].state === STANDING;

    // Golfer: club drawn back with the pull, then through the ball.
    const st = this.session.status;
    const sw = this.golfer.swing;
    if (st === 'aim') {
      this.swingT = -1;
      const back = -0.25 - (this.aim.pulling ? this.aim.power : 0) * 1.75;
      sw.rotation.x += (back + Math.sin(this.time * 2.2) * 0.03 - sw.rotation.x) * Math.min(1, dt * 10);
    } else {
      if (this.swingT < 0) this.swingT = 0;
      this.swingT += dt;
      const through = this.swingT < 0.08 ? 0 : Math.min(2.3, ((this.swingT - 0.08) / 0.22) * 2.3);
      sw.rotation.x += (through - sw.rotation.x) * Math.min(1, dt * 30);
    }

    // The ball: on the tee, in the air, or dropping away after a hit that did not go through.
    const f = this.session.flight;
    const bp = this.tmpV;
    const def = BALLS[f ? f.ball : this.aim.ball];
    this.ball.material = this.ballMats[f ? f.ball : this.aim.ball];
    this.ball.scale.setScalar(def.radius);
    if (st === 'flight' && f) {
      flightAt(f, this.session.flightT, bp);
      this.ball.visible = true;
      this.ball.position.set(bp.x, bp.y, bp.z);
      this.trailPts.push(bp.x, bp.y, bp.z);
      if (this.trailPts.length > TRAIL * 3) this.trailPts.splice(0, 3);
    } else if (this.dead) {
      const b = this.dead;
      b.life -= dt;
      b.vy -= 9.81 * sdt;
      b.x += b.vx * sdt; b.y += b.vy * sdt; b.z += b.vz * sdt;
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.45; b.vx *= 0.7; b.vz *= 0.7; }
      this.ball.visible = true;
      this.ball.position.set(b.x, b.y, b.z);
      if (b.life <= 0) this.dead = null;
      if (this.trailPts.length) this.trailPts.splice(0, 3);
    } else {
      this.ball.visible = st === 'aim';
      this.ball.position.set(this.golfer.body.position.x, def.radius + 0.05, TEE_Z);
      if (this.trailPts.length) this.trailPts.splice(0, 3);
    }
    const tn = this.trailPts.length / 3;
    for (let i = 0; i < tn; i++) {
      d.position.set(this.trailPts[i * 3], this.trailPts[i * 3 + 1], this.trailPts[i * 3 + 2]);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(def.radius * (0.25 + 0.7 * (i / tn)));
      d.updateMatrix();
      this.trail.setMatrixAt(i, d.matrix);
    }
    this.trail.count = tn;
    this.trail.instanceMatrix.needsUpdate = true;

    // Aim guide: the flight as a row of dots, and a ring where it lands coloured by what it will do.
    const plan = st === 'aim' ? this.aim.plan : null;
    this.guide.count = plan ? GUIDE_DOTS : 0;
    this.reticle.visible = !!plan;
    if (plan) {
      for (let i = 0; i < GUIDE_DOTS; i++) {
        flightAt(plan, (plan.time * (i + 1)) / (GUIDE_DOTS + 1), bp);
        d.position.set(bp.x, bp.y, bp.z);
        d.rotation.set(0, 0, 0);
        d.scale.setScalar(0.07 + 0.05 * (i / GUIDE_DOTS));
        d.updateMatrix();
        this.guide.setMatrixAt(i, d.matrix);
      }
      this.guide.instanceMatrix.needsUpdate = true;
      const e = this.aim.effect;
      const col = e === 'break' || e === 'gas' || e === 'blast' ? PALETTE.red : e === 'weaken' ? PALETTE.amber : '#ffffff';
      (this.reticle.material as THREE.MeshBasicMaterial).color.set(col);
      (this.guide.material as THREE.MeshBasicMaterial).color.set(col);
      this.reticle.position.set(plan.x, plan.y + (plan.reach ? 0 : 0.05), plan.z + 0.06);
      if (plan.reach) this.reticle.rotation.set(0, 0, 0);
      else this.reticle.rotation.set(-Math.PI / 2, 0, 0);
      const pulse = 1 + 0.08 * Math.sin(this.time * 6);
      this.reticle.scale.setScalar((0.34 + this.dist * 0.004) * pulse);
    }

    // Camera: behind the golfer to aim, travelling in with the ball, close for the collapse.
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    this.push = Math.max(0, this.push - dt * 0.55);
    let want = 0;
    if (st === 'flight' && f) want = Math.min(1, (this.session.flightT / f.time) * 1.15);
    else if (st === 'busy' || st === 'won' || st === 'lost' || this.holdClose) want = 1;
    const rate = want > this.cam ? (st === 'flight' ? 9 : 4) : 2.2;
    this.cam += (want - this.cam) * Math.min(1, dt * rate);
    const k = this.cam * this.cam * (3 - 2 * this.cam);
    const { minX, maxX, maxY } = this.bounds;
    const cx = (minX + maxX) / 2;
    const portrait = this.w < this.h;
    const tan26 = Math.tan((26 * Math.PI) / 360);
    // Close pose (the framing worked out in frame()).
    const yaw = -0.2;
    const pitch = 0.085;
    const cdist = this.dist * (1 - 0.07 * Math.min(1, this.push));
    const cpx = this.target.x + Math.sin(yaw) * Math.cos(pitch) * cdist;
    const cpy = this.target.y + Math.sin(pitch) * cdist;
    const cpz = Math.cos(yaw) * Math.cos(pitch) * cdist;
    // Tee pose: over the golfer's shoulder, the whole building above them.
    const apx = cx + (portrait ? 0.9 : 1.6);
    // Tall buildings push the tee camera back so the ground floor stays in view.
    const tallBy = Math.max(0, maxY - 9);
    const apy = (portrait ? 2.7 : 2.4) + tallBy * 0.3;
    const apz = TEE_Z + (portrait ? 4.8 : 4.4) + tallBy * 1.1;
    const alx = cx;
    const aly = Math.max(2.2, maxY * 0.47);
    const adist = Math.hypot(apz, apy - aly);
    const halfW = (maxX - minX) / 2 + 2.2;
    const fovW = (2 * Math.atan(Math.tan(Math.atan(halfW / adist)) / this.camera.aspect) * 180) / Math.PI;
    const fovH = (2 * Math.atan(((maxY + 2.2) * 0.62) / adist) * 180) / Math.PI;
    const afov = Math.max(24, Math.min(66, Math.max(fovW, fovH)));
    void tan26;
    const sh = this.trauma * this.trauma;
    const ox = Math.sin(this.time * 61) * sh * 0.5;
    const oy = Math.cos(this.time * 53) * sh * 0.5;
    this.camera.position.set(apx + (cpx - apx) * k + ox, apy + (cpy - apy) * k + oy, apz + (cpz - apz) * k);
    this.camera.fov = afov + (26 - afov) * k;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(alx + (this.target.x - alx) * k + ox, aly + (this.target.y - aly) * k + oy, 0);
    this.camera.rotateZ(Math.sin(this.time * 47) * sh * 0.012);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

export type { Mat };
