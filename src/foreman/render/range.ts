import * as THREE from 'three';

/**
 * The setting: a worn-out driving range somewhere west of anywhere, late in the day.
 * Hardpan and scrub out to the mesas, a row of telephone poles, a pump jack nodding on the
 * horizon, a windmill, an old pickup by the tee and range balls all over the place.
 * Everything here is scenery: nothing in it touches the simulation.
 */
export interface Range {
  group: THREE.Group;
  update(dt: number, t: number): void;
}

const mat = (color: number | string, rough = 0.95): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });

function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  b.castShadow = shadow;
  b.receiveShadow = shadow;
  return b;
}

function groundTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#c7a26a';
  g.fillRect(0, 0, 512, 512);
  let seed = 11;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Blotches of paler dust and darker damp, then dry grass in tufts.
  for (let i = 0; i < 260; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(222,190,138,0.22)' : 'rgba(150,112,66,0.16)';
    g.beginPath();
    g.ellipse(rnd() * 512, rnd() * 512, 8 + rnd() * 34, 5 + rnd() * 18, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 2600; i++) {
    const k = rnd();
    g.fillStyle = k < 0.45 ? 'rgba(150,146,78,0.5)' : k < 0.8 ? 'rgba(188,168,96,0.5)' : 'rgba(104,112,62,0.45)';
    g.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 2, 2 + rnd() * 4);
  }
  for (let i = 0; i < 500; i++) {
    g.fillStyle = 'rgba(96,74,48,0.35)';
    g.fillRect(rnd() * 512, rnd() * 512, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(26, 26);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function fairwayTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 512;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  let seed = 5;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 16; i++) {
    g.fillStyle = i % 2 ? '#a9a55c' : '#b4ad63';
    g.fillRect(0, i * 32, 128, 32);
  }
  // Bare patches where the grass gave up.
  for (let i = 0; i < 70; i++) {
    g.fillStyle = 'rgba(199,162,106,0.75)';
    g.beginPath();
    g.ellipse(rnd() * 128, rnd() * 512, 4 + rnd() * 16, 3 + rnd() * 9, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(120,128,60,0.4)' : 'rgba(214,204,130,0.35)';
    g.fillRect(rnd() * 128, rnd() * 512, 1, 3);
  }
  // Soft edges so it fades into the dirt.
  const edge = g.createLinearGradient(0, 0, 128, 0);
  edge.addColorStop(0, 'rgba(199,162,106,1)');
  edge.addColorStop(0.16, 'rgba(199,162,106,0)');
  edge.addColorStop(0.84, 'rgba(199,162,106,0)');
  edge.addColorStop(1, 'rgba(199,162,106,1)');
  g.fillStyle = edge;
  g.fillRect(0, 0, 128, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function board(text: string, w: number, h: number, bg: string, fg: string): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = Math.round((256 * h) / w);
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  // Sun-bleached streaks.
  let seed = text.length * 97 + 3;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) { g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(rnd() * c.width, 0, 2 + rnd() * 6, c.height); }
  g.fillStyle = fg;
  g.font = `900 ${Math.round(c.height * 0.66)}px "Saira Stencil One", "Barlow Condensed", Impact, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height * 0.55, c.width * 0.9);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  m.castShadow = true;
  return m;
}

/** A signboard on two legs. */
function sign(text: string, w: number, h: number, bg: string, fg: string, leg: number): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x7a5a3c);
  g.add(box(0.09, leg + h, 0.09, wood, -w * 0.36, (leg + h) / 2, -0.06), box(0.09, leg + h, 0.09, wood, w * 0.36, (leg + h) / 2, -0.06));
  const b = board(text, w, h, bg, fg);
  b.position.set(0, leg + h / 2, 0);
  g.add(b);
  return g;
}

function pickup(): THREE.Group {
  const g = new THREE.Group();
  const paint = mat(0x5f9a96, 0.7);
  const rust = mat(0x8a5a3a);
  const dark = mat(0x23262a, 0.8);
  const glass = mat(0x9fc4cf, 0.3);
  g.add(box(4.6, 0.55, 1.75, paint, 0, 0.78, 0));
  g.add(box(1.5, 0.75, 1.65, paint, 0.35, 1.42, 0));
  g.add(box(1.52, 0.42, 1.5, glass, 0.35, 1.5, 0));
  g.add(box(1.5, 0.08, 1.7, paint, 0.35, 1.82, 0));
  g.add(box(1.9, 0.5, 0.08, paint, -1.3, 1.25, 0.84), box(1.9, 0.5, 0.08, paint, -1.3, 1.25, -0.84), box(0.08, 0.5, 1.75, paint, -2.26, 1.25, 0));
  g.add(box(1.3, 0.14, 1.78, rust, 1.68, 1.06, 0));
  g.add(box(0.12, 0.2, 1.8, mat(0xc9ccd0, 0.4), 2.34, 0.62, 0), box(0.12, 0.2, 1.8, mat(0xc9ccd0, 0.4), -2.34, 0.62, 0));
  for (const [x, z] of [[1.45, 0.82], [1.45, -0.82], [-1.4, 0.82], [-1.4, -0.82]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14), dark);
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 0.42, z);
    w.castShadow = true;
    g.add(w);
  }
  // A cooler and a spare bag in the bed.
  g.add(box(0.7, 0.4, 0.45, mat(0xd6402b, 0.6), -1.0, 1.25, 0.3), box(0.7, 0.06, 0.45, mat(0xf1ece0, 0.6), -1.0, 1.48, 0.3));
  return g;
}

function pumpJack(): { group: THREE.Group; beam: THREE.Group } {
  const g = new THREE.Group();
  const iron = mat(0x4a3f3a);
  g.add(box(6, 0.4, 2, iron, 0, 0.2, 0, false));
  g.add(box(0.5, 5, 0.5, iron, -0.6, 2.7, 0.6, false), box(0.5, 5, 0.5, iron, -0.6, 2.7, -0.6, false));
  const beam = new THREE.Group();
  beam.position.set(-0.6, 5.2, 0);
  beam.add(box(7.4, 0.55, 0.5, iron, 0.4, 0, 0, false), box(1.3, 2.4, 0.6, iron, 4.0, -0.6, 0, false), box(1.6, 1.6, 0.9, iron, -3.1, -0.4, 0, false));
  g.add(beam);
  return { group: g, beam };
}

function windmill(): { group: THREE.Group; wheel: THREE.Group } {
  const g = new THREE.Group();
  const steel = mat(0x8d8f8c, 0.6);
  for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
    const leg = box(0.12, 9.2, 0.12, steel, x * 0.55, 4.5, z * 0.55, false);
    leg.rotation.z = -x * 0.1;
    leg.rotation.x = z * 0.1;
    g.add(leg);
  }
  for (const y of [2.2, 4.6, 7]) g.add(box(1.6 - y * 0.12, 0.08, 0.08, steel, 0, y, 0.5, false), box(1.6 - y * 0.12, 0.08, 0.08, steel, 0, y, -0.5, false));
  const wheel = new THREE.Group();
  wheel.position.set(0, 9.4, 0.5);
  for (let i = 0; i < 14; i++) {
    const blade = box(0.34, 1.5, 0.04, steel, 0, 0.95, 0, false);
    const arm = new THREE.Group();
    arm.rotation.z = (i / 14) * Math.PI * 2;
    blade.rotation.y = 0.5;
    arm.add(blade);
    wheel.add(arm);
  }
  g.add(wheel, box(1.6, 0.9, 0.06, steel, 0, 9.4, -0.9, false));
  return { group: g, wheel };
}

export function buildRange(width: number, teeZ: number): Range {
  const group = new THREE.Group();

  // Sky: deep overhead, burning out to peach at the horizon. Late afternoon.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color(0x3f7fc0) }, mid: { value: new THREE.Color(0xa9cbe0) }, low: { value: new THREE.Color(0xf6cf9a) }, sun: { value: new THREE.Vector3(-0.62, 0.2, -0.76).normalize() } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 sun; varying vec3 vD; void main(){ float t = clamp(vD.y,0.0,1.0); vec3 c = t < 0.2 ? mix(low, mid, t/0.2) : mix(mid, top, (t-0.2)/0.8); float s = max(0.0, dot(normalize(vD), sun)); c += vec3(1.0,0.82,0.5) * (pow(s, 90.0) * 0.9 + pow(s, 8.0) * 0.22); gl_FragColor = vec4(c,1.0); }',
    }),
  );
  sky.renderOrder = -10;
  group.add(sky);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -120);
  ground.receiveShadow = true;
  group.add(ground);

  // The range itself: a strip that somebody still waters, when they remember.
  const fairway = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(26, width + 16), 130), new THREE.MeshStandardMaterial({ map: fairwayTexture(), roughness: 1, transparent: true }));
  fairway.rotation.x = -Math.PI / 2;
  fairway.position.set(0, 0.015, teeZ - 46);
  fairway.receiveShadow = true;
  group.add(fairway);

  // Tee: a rubber mat, a wire bucket, the bag.
  group.add(box(2.6, 0.05, 2.0, mat(0x3d6b45, 0.9), -0.5, 0.03, teeZ + 0.1));
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.34, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.5, wireframe: true }));
  bucket.position.set(0.95, 0.2, teeZ + 0.75);
  group.add(bucket);
  const ballMat = mat(0xf4f1e4, 0.5);
  const heap = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 6), ballMat, 190);
  const d = new THREE.Object3D();
  let seed = 23;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let n = 0;
  for (let i = 0; i < 22; i++) { d.position.set(0.95 + (rnd() - 0.5) * 0.3, 0.1 + rnd() * 0.28, teeZ + 0.75 + (rnd() - 0.5) * 0.3); d.updateMatrix(); heap.setMatrixAt(n++, d.matrix); }
  // A day's worth of range balls nobody has picked up.
  for (let i = 0; i < 168; i++) {
    const far = rnd();
    d.position.set((rnd() - 0.5) * (width + 22) * (0.5 + far), 0.055, teeZ - 5 - far * far * 60 - rnd() * 6);
    if (Math.abs(d.position.z) < 4.5 && Math.abs(d.position.x) < width / 2 + 1.5) d.position.z = 5 + rnd() * 3;
    d.updateMatrix();
    heap.setMatrixAt(n++, d.matrix);
  }
  heap.castShadow = true;
  group.add(heap);
  const bag = new THREE.Group();
  const bagBody = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.95, 10), mat(0x6f2f2a, 0.8));
  bagBody.position.y = 0.5;
  bagBody.castShadow = true;
  bag.add(bagBody);
  for (let i = 0; i < 4; i++) bag.add(box(0.025, 0.5, 0.025, mat(0xbfc4c8, 0.4), -0.08 + i * 0.05, 1.18, (i % 2) * 0.06 - 0.03));
  bag.position.set(1.6, 0, teeZ + 1.3);
  bag.rotation.z = -0.22;
  group.add(bag);

  // The truck he drove in on, and the sign out front.
  const truck = pickup();
  truck.position.set(-width / 2 - 6.2, 0, teeZ - 5.5);
  truck.rotation.y = 0.5;
  group.add(truck);
  const front = sign('DRIVING RANGE', 4.6, 1.15, '#efe8da', '#b23a2a', 2.3);
  front.position.set(width / 2 + 6.5, 0, teeZ - 9);
  front.rotation.y = -0.45;
  group.add(front);
  const beer = sign('BUCKET $3', 2.2, 0.7, '#f2b705', '#1b1a18', 0.9);
  beer.position.set(width / 2 + 4.6, 0, teeZ - 2.5);
  beer.rotation.y = -0.6;
  group.add(beer);

  // Yardage boards, pacing off into the distance.
  [['50', -18], ['100', -52], ['150', -88], ['200', -126]].forEach(([label, z], i) => {
    const s = sign(label as string, 2.4 + i * 0.7, 1.2 + i * 0.35, '#efe8da', '#1b1a18', 1.2 + i * 0.5);
    s.position.set((i % 2 ? 1 : -1) * (width / 2 + 9 + i * 5), 0, z as number);
    group.add(s);
  });

  // Telephone poles down the county road.
  const pole = mat(0x4b3a2c);
  for (let i = 0; i < 9; i++) {
    const z = teeZ - 10 - i * 26;
    const x = width / 2 + 22 + i * 2.5;
    group.add(box(0.3, 9, 0.3, pole, x, 4.5, z, false), box(2.6, 0.2, 0.2, pole, x, 8.2, z, false));
  }

  // Scrub: mesquite and creosote, low and grey-green.
  const scrubMat = mat(0x7d8456);
  const scrub = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), scrubMat, 90);
  for (let i = 0; i < 90; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    const z = teeZ + 6 - rnd() * 210;
    const x = side * (width / 2 + 13 + rnd() * 90) + (rnd() - 0.5) * 6;
    const s = 0.5 + rnd() * 1.3;
    d.position.set(x, s * 0.45, z);
    d.scale.set(s * (1 + rnd() * 0.6), s * 0.6, s);
    d.rotation.set(0, rnd() * 6, 0);
    d.updateMatrix();
    scrub.setMatrixAt(i, d.matrix);
  }
  scrub.castShadow = true;
  group.add(scrub);
  d.scale.set(1, 1, 1);
  d.rotation.set(0, 0, 0);

  // Mesas on the horizon, hazed out.
  const far = new THREE.MeshBasicMaterial({ color: 0xb98f78, fog: true });
  const farther = new THREE.MeshBasicMaterial({ color: 0xc7a590, fog: true });
  for (const [x, w, h, z, m] of [[-210, 150, 30, -300, far], [-60, 90, 22, -340, farther], [120, 190, 36, -320, far], [300, 120, 26, -350, farther], [-360, 130, 24, -330, farther]] as [number, number, number, number, THREE.Material][]) {
    group.add(box(w, h, 40, m, x, h / 2, z, false), box(w * 1.25, h * 0.45, 46, m, x, h * 0.22, z + 2, false));
  }

  const jack = pumpJack();
  jack.group.position.set(-width / 2 - 60, 0, -120);
  jack.group.rotation.y = 0.5;
  jack.group.scale.setScalar(1.6);
  group.add(jack.group);
  const mill = windmill();
  mill.group.position.set(width / 2 + 34, 0, -62);
  group.add(mill.group, box(3.2, 1.1, 3.2, mat(0x8d8f8c, 0.5), width / 2 + 38, 0.55, -60));

  // Tumbleweeds on the wind, and an armadillo with nowhere to be.
  const weedMat = new THREE.MeshStandardMaterial({ color: 0x9a7b4f, roughness: 1, wireframe: true });
  const weeds: { mesh: THREE.Mesh; speed: number; z: number; phase: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 + i * 0.12, 1), weedMat);
    group.add(mesh);
    weeds.push({ mesh, speed: 2.2 + i * 0.9, z: teeZ - 8 - i * 17, phase: i * 31 });
  }
  const dillo = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), mat(0x8a7a68, 0.8));
  shell.scale.set(1.5, 0.8, 0.9);
  shell.position.y = 0.26;
  shell.castShadow = true;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 8), mat(0x9a8a78, 0.8));
  head.rotation.z = -Math.PI / 2;
  head.position.set(0.52, 0.2, 0);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 6), mat(0x9a8a78, 0.8));
  tail.rotation.z = Math.PI / 2;
  tail.position.set(-0.6, 0.18, 0);
  dillo.add(shell, head, tail);
  group.add(dillo);

  const span = width + 70;
  return {
    group,
    update(_dt: number, t: number): void {
      jack.beam.rotation.z = Math.sin(t * 0.9) * 0.22;
      mill.wheel.rotation.z = t * 1.7;
      for (const w of weeds) {
        const u = ((t * w.speed + w.phase) % span) / span;
        w.mesh.position.set(-span / 2 + u * span, 0.5 + Math.abs(Math.sin(t * 2.4 + w.phase)) * 0.35, w.z);
        w.mesh.rotation.z = -t * w.speed * 1.4;
      }
      // The armadillo crosses in front of the tee, slowly, and comes back the other way.
      const lap = (t * 0.32) % (span * 2);
      const out = lap < span;
      dillo.position.set(out ? -span / 2 + lap : span / 2 - (lap - span), Math.abs(Math.sin(t * 9)) * 0.03, teeZ - 3.2);
      dillo.rotation.y = out ? 0 : Math.PI;
    },
  };
}
