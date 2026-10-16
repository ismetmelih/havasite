// 3B temsili afet canlandirmalari (Three.js, MIT). Belirli bir olayi degil, o tur bir afette
// genel olarak neler oldugunu gosterir. Her sahne: kurulum + zaman cizelgesine gore guncelleme.
import * as THREE from "./vendor/three/three.module.min.js";
import { OrbitControls } from "./vendor/three/OrbitControls.js";
import { EffectComposer } from "./vendor/three/EffectComposer.js";
import { RenderPass } from "./vendor/three/RenderPass.js";
import { UnrealBloomPass } from "./vendor/three/UnrealBloomPass.js";
import { OutputPass } from "./vendor/three/OutputPass.js";

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const smooth = (x) => x * x * (3 - 2 * x);
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const SMALL = window.innerWidth < 700;

/* ---------------- dokular (kanvasta uretilir) ---------------- */
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// cephe: 4 pencere x 4 kat; ayni duzende isikli pencereler icin ayrica "yanan" doku
function facadeTextures(seed, wall, frame) {
  const r = rng(seed);
  const lit = [];
  for (let i = 0; i < 16; i++) lit.push(r() < 0.55);
  const map = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = wall; g.fillRect(0, 0, w, h);
    for (let row = 0; row < 4; row++) {
      g.fillStyle = frame; g.fillRect(0, row * 64 + 58, w, 6); // kat kirisi
      for (let col = 0; col < 4; col++) {
        const x = col * 64 + 12, y = row * 64 + 14;
        g.fillStyle = lit[row * 4 + col] ? "#5a4a33" : "#1f2a37";
        g.fillRect(x, y, 40, 34);
        g.fillStyle = frame; g.fillRect(x + 19, y, 2, 34);
      }
    }
  });
  const emis = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
      if (!lit[row * 4 + col]) continue;
      g.fillStyle = "#ffcf86"; g.fillRect(col * 64 + 12, row * 64 + 14, 40, 34);
    }
  });
  [map, emis].forEach((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
  return { map, emis };
}
const softSprite = () => canvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.4, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
}, false);

/* ---------------- parcacik sistemi (ates, duman, toz, su) ---------------- */
class Particles {
  constructor(max, tex, additive) {
    this.max = max; this.list = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("pcolor", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("psize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("palpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: 600 } },
      vertexShader: `attribute vec3 pcolor; attribute float psize; attribute float palpha; uniform float scale;
        varying vec3 vC; varying float vA;
        void main(){ vC = pcolor; vA = palpha; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = psize * scale / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ float a = texture2D(map, gl_PointCoord).a * vA; if (a < 0.003) discard; gl_FragColor = vec4(vC, a); }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.geo = g;
  }
  spawn(p) { if (this.list.length < this.max) { p.age = 0; this.list.push(p); } }
  clear() { this.list.length = 0; }
  update(dt, wind) {
    const L = this.list;
    let n = 0;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) { L[i] = L[L.length - 1]; L.pop(); continue; }
      p.vy += (p.g || 0) * dt;
      if (p.drag) { p.vx *= 1 - p.drag * dt; p.vz *= 1 - p.drag * dt; }
      p.x += (p.vx + (wind ? wind.x * (p.w || 0) : 0)) * dt; p.y += p.vy * dt; p.z += (p.vz + (wind ? wind.z * (p.w || 0) : 0)) * dt;
      if (p.floor !== undefined && p.y < p.floor) { p.y = p.floor; p.vy = 0; }
    }
    for (const p of L) {
      const k = p.age / p.life;
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      const c0 = p.c0, c1 = p.c1 || p.c0;
      this.col[n * 3] = lerp(c0[0], c1[0], k); this.col[n * 3 + 1] = lerp(c0[1], c1[1], k); this.col[n * 3 + 2] = lerp(c0[2], c1[2], k);
      this.size[n] = lerp(p.s0, p.s1, k);
      this.alpha[n] = p.a * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
      n++;
    }
    this.geo.setDrawRange(0, n);
    ["position", "pcolor", "psize", "palpha"].forEach((a) => (this.geo.attributes[a].needsUpdate = true));
  }
}

/* ---------------- ortak: gokyuzu, ev, agac ---------------- */
function skyDome(top, bottom) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(top) }, bottom: { value: new THREE.Color(bottom) } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*1.4+0.15,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, h),1.0); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  m.userData.mat = mat;
  return m;
}
function makeHouse(color, roofColor, w = 8, d = 7, h = 4.5) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
  body.position.y = h / 2; body.castShadow = body.receiveShadow = true; g.add(body);
  const roofShape = new THREE.Shape(); roofShape.moveTo(-w / 2 - 0.5, 0); roofShape.lineTo(0, h * 0.55); roofShape.lineTo(w / 2 + 0.5, 0); roofShape.lineTo(-w / 2 - 0.5, 0);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: d + 1, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.7 }));
  roof.position.set(0, h, -d / 2 - 0.5); roof.castShadow = true; g.add(roof);
  const winMat = new THREE.MeshStandardMaterial({ color: 0xf3c97a, emissive: 0xffc36b, emissiveIntensity: 1.2 });
  [-w * 0.25, w * 0.25].forEach((x) => { const wnd = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.2), winMat); wnd.position.set(x, h * 0.6, d / 2 + 0.02); g.add(wnd); });
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.2), new THREE.MeshStandardMaterial({ color: 0x3b2a20 })); door.position.set(0, 1.1, d / 2 + 0.02); g.add(door);
  g.userData.winMat = winMat;
  return g;
}
function makeCar(color) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.1, 1.9), new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.4 }));
  b.position.y = 0.85; b.castShadow = true; g.add(b);
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 1.7), new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: 0.2, metalness: 0.6 }));
  top.position.set(-0.2, 1.75, 0); g.add(top);
  return g;
}

/* ================= DEPREM ================= */
function buildDeprem(ctx) {
  const { scene, r } = ctx;
  scene.add(skyDome(0x27477a, 0xe8a06a));
  scene.fog = new THREE.FogExp2(0x6a5a62, 0.0038);
  const hemi = new THREE.HemisphereLight(0xb7cbea, 0x2a2520, 1.15); scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xffc08a, 2.3); moon.position.set(-210, 85, 130); moon.castShadow = true;
  Object.assign(moon.shadow.camera, { left: -170, right: 170, top: 170, bottom: -170, near: 10, far: 500 });
  moon.shadow.mapSize.set(SMALL ? 1024 : 2048, SMALL ? 1024 : 2048); moon.shadow.bias = -0.0005; scene.add(moon);

  // zemin, yollar
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x16191e, roughness: 0.9 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x8a8f96 });
  const BLOCK = 44, NX = 7, NZ = 6;
  for (let i = 0; i <= NX; i++) {
    const x = (i - NX / 2) * BLOCK;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(10, NZ * BLOCK + 60), roadMat); road.rotation.x = -Math.PI / 2; road.position.set(x, 0.02, 0); road.receiveShadow = true; scene.add(road);
    for (let z = -NZ * BLOCK / 2; z < NZ * BLOCK / 2; z += 8) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 3), lineMat); l.rotation.x = -Math.PI / 2; l.position.set(x, 0.04, z); scene.add(l); }
  }
  for (let j = 0; j <= NZ; j++) {
    const z = (j - NZ / 2) * BLOCK;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(NX * BLOCK + 60, 10), roadMat); road.rotation.x = -Math.PI / 2; road.position.set(0, 0.03, z); road.receiveShadow = true; scene.add(road);
  }

  // cephe varyasyonlari
  const strongFac = [facadeTextures(3, "#a9b2bc", "#7d8792"), facadeTextures(9, "#c4c9cf", "#8c949c"), facadeTextures(17, "#8f9ca8", "#66727e")];
  const weakFac = [facadeTextures(5, "#c6ae8c", "#9a8467"), facadeTextures(13, "#b59d84", "#8a7560")];
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.9 });
  const FH = 3.2;
  const buildings = [];
  const EPI = new THREE.Vector3(-20, 0, 10);
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    const cx = (i - NX / 2 + 0.5) * BLOCK, cz = (j - NZ / 2 + 0.5) * BLOCK;
    const slots = [[-8.5, -8.5], [8.5, -8.5], [-8.5, 8.5], [8.5, 8.5]];
    slots.forEach(([ox, oz]) => {
      if (r() < 0.18) return;
      const w = 11 + r() * 4, x = cx + ox, z = cz + oz;
      const centre = Math.hypot(x - EPI.x, z - EPI.z) < 120;
      const weak = centre && r() < 0.3;
      const n = weak ? 4 + Math.floor(r() * 4) : 3 + Math.floor(r() * (Math.hypot(x, z) < 90 ? 11 : 6));
      const fac = (weak ? weakFac : strongFac)[Math.floor(r() * (weak ? 2 : 3))];
      const b = { x, z, w, n, weak, floors: [], group: new THREE.Group(), phase: r() * 6, emis: [] };
      b.group.position.set(x, 0, z);
      if (weak) {
        for (let k = 0; k < n; k++) {
          const m = fac.map.clone(), e = fac.emis.clone();
          [m, e].forEach((t) => { t.repeat.set(w / 14, 0.25); t.offset.set(0, (k % 4) / 4); t.needsUpdate = true; });
          const mat = new THREE.MeshStandardMaterial({ map: m, emissiveMap: e, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.85 });
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, FH, w), [mat, mat, roofMat, roofMat, mat, mat]);
          mesh.position.y = FH * k + FH / 2; mesh.castShadow = mesh.receiveShadow = true;
          b.group.add(mesh);
          b.floors.push({ mesh, k, y0: mesh.position.y, vy: 0, done: false, tilt: (r() - 0.5) * 0.35, tiltZ: (r() - 0.5) * 0.35, dx: (r() - 0.5) * 2.5 });
          b.emis.push(mat);
        }
      } else {
        const m = fac.map.clone(), e = fac.emis.clone();
        [m, e].forEach((t) => { t.repeat.set(w / 14, n / 4); t.needsUpdate = true; });
        const mat = new THREE.MeshStandardMaterial({ map: m, emissiveMap: e, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.8 });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, FH * n, w), [mat, mat, roofMat, roofMat, mat, mat]);
        mesh.position.y = (FH * n) / 2; mesh.castShadow = mesh.receiveShadow = true;
        b.group.add(mesh); b.emis.push(mat);
      }
      b.dist = Math.hypot(x - EPI.x, z - EPI.z);
      scene.add(b.group); buildings.push(b);
    });
  }
  // agaclar ve park etmis arabalar
  const tCrown = new THREE.InstancedMesh(new THREE.SphereGeometry(2.2, 8, 6), new THREE.MeshStandardMaterial({ color: 0x35603a, roughness: 0.9 }), 260);
  const tTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 3, 5), new THREE.MeshStandardMaterial({ color: 0x4a3a2a }), 260);
  const carsI = new THREE.InstancedMesh(new THREE.BoxGeometry(4.2, 1.5, 1.9), new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.35 }), 140);
  tCrown.castShadow = tTrunk.castShadow = carsI.castShadow = true;
  const to = new THREE.Object3D();
  const CARC = [0xc0392b, 0x2c6db0, 0xd9d9d9, 0x1f2328, 0x7a8590, 0xe0b23a];
  for (let i = 0; i < 260; i++) {
    const bx = Math.floor(r() * NX), bz = Math.floor(r() * NZ);
    const edge = r() < 0.5;
    const x = (bx - NX / 2) * BLOCK + (edge ? 7 : 7 + r() * (BLOCK - 14)), z = (bz - NZ / 2) * BLOCK + (edge ? 7 + r() * (BLOCK - 14) : 7);
    to.position.set(x, 1.5, z); to.scale.setScalar(0.8 + r() * 0.5); to.rotation.set(0, 0, 0); to.updateMatrix(); tTrunk.setMatrixAt(i, to.matrix);
    to.position.y = 4.2; to.updateMatrix(); tCrown.setMatrixAt(i, to.matrix);
  }
  for (let i = 0; i < 140; i++) {
    const alongX = r() < 0.5;
    const line = Math.floor(r() * (alongX ? NZ + 1 : NX + 1));
    const pos = (r() - 0.5) * (alongX ? NX : NZ) * BLOCK;
    const fixed = (line - (alongX ? NZ : NX) / 2) * BLOCK + (r() < 0.5 ? -3.6 : 3.6);
    to.position.set(alongX ? pos : fixed, 0.9, alongX ? fixed : pos); to.rotation.set(0, alongX ? 0 : Math.PI / 2, 0); to.scale.setScalar(1); to.updateMatrix();
    carsI.setMatrixAt(i, to.matrix); carsI.setColorAt(i, new THREE.Color(CARC[Math.floor(r() * CARC.length)]));
  }
  scene.add(tCrown, tTrunk, carsI);

  // sokak lambalari
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe3a3, emissive: 0xffd27a, emissiveIntensity: 2.2 });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46 });
  for (let i = 0; i <= NX; i++) for (let j = 0; j < NZ; j++) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 6), poleMat); pole.position.y = 3; g.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), lampMat); bulb.position.y = 6.2; g.add(bulb);
    g.position.set((i - NX / 2) * BLOCK + 6, 0, (j - NZ / 2 + 0.5) * BLOCK); scene.add(g);
  }
  // sarsinti halkalari (yerde)
  const rings = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 96), new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(EPI.x, 0.3, EPI.z); scene.add(m); return m;
  });
  // moloz ve toz
  const chunkGeo = new THREE.BoxGeometry(1, 1, 1);
  const MAXC = SMALL ? 260 : 520;
  const chunks = new THREE.InstancedMesh(chunkGeo, new THREE.MeshStandardMaterial({ color: 0x8a7d6c, roughness: 0.95 }), MAXC);
  chunks.castShadow = true; chunks.count = 0; scene.add(chunks);
  const chunkList = [];
  const dust = new Particles(SMALL ? 700 : 1400, ctx.sprite, false); scene.add(dust.points);
  const tmp = new THREE.Object3D();

  const weakOnes = buildings.filter((b) => b.weak).sort((a, b) => a.dist - b.dist);
  weakOnes.forEach((b, i) => { b.tc = 3.6 + i * 0.28 + r() * 0.3; b.lean = (r() < 0.5 ? -1 : 1) * (0.1 + r() * 0.08); });
  const H = new THREE.Vector3();
  weakOnes.slice(0, 3).forEach((b) => H.add(new THREE.Vector3(b.x, 0, b.z)));
  H.multiplyScalar(1 / Math.max(1, Math.min(3, weakOnes.length)));
  let outage = false;

  return {
    dur: 13,
    cam: (t) => {
      const a = 0.7 + t * 0.03;
      const k = smooth(prog(t, 1.5, 5.5));
      const rad = lerp(240, 92, k);
      const c = new THREE.Vector3(lerp(0, H.x, k), 0, lerp(0, H.z, k));
      return { pos: new THREE.Vector3(c.x + Math.cos(a) * rad, lerp(105, 34, k), c.z + Math.sin(a) * rad), look: new THREE.Vector3(c.x, lerp(14, 9, k), c.z) };
    },
    shake: (t) => 1.6 * prog(t, 1.4, 2.2) * (1 - prog(t, 6.2, 8.4)),
    captions: [
      [0, "Akşam saatleri. Dışarıdan bakınca binaların çoğu birbirine benzer."],
      [1.4, "Fay kırılır; sarsıntı dalgaları şehre ulaşır, elektrikler gider."],
      [3.6, "Kurallara uygun yapılmamış binalar ağır hasar görür, bazıları çöker."],
      [8.6, "Depreme dayanıklı yapılmış binalar ayakta kalır. Deprem anında: Çök, kapan, tutun."],
    ],
    reset() {
      chunkList.length = 0; chunks.count = 0; dust.clear(); outage = false;
      buildings.forEach((b) => {
        b.collapsed = false;
        b.group.rotation.set(0, 0, 0); b.group.position.set(b.x, 0, b.z);
        b.emis.forEach((m) => (m.emissiveIntensity = 1.1));
        b.floors.forEach((f) => { f.mesh.position.set(0, f.y0, 0); f.mesh.rotation.set(0, 0, 0); f.vy = 0; f.done = false; });
      });
      lampMat.emissiveIntensity = 2.2;
      rings.forEach((m) => (m.material.opacity = 0));
    },
    update(t, dt) {
      const A = 1.6 * prog(t, 1.4, 2.2) * (1 - prog(t, 6.2, 8.4));
      // halkalar
      rings.forEach((m, i) => {
        const k = ((t - 1.3 - i * 0.55) % 1.8) / 1.8;
        const on = t > 1.3 + i * 0.55 && t < 6;
        const s = 5 + k * 260; m.scale.set(s, s, s);
        m.material.opacity = on ? 0.75 * (1 - k) : 0;
      });
      // elektrik kesintisi (titreyerek)
      if (t > 2.4 && t < 3.2) { const f = Math.random() < 0.5 ? 0.15 : 1.1; buildings.forEach((b) => !b.collapsed && b.emis.forEach((m) => (m.emissiveIntensity = f))); lampMat.emissiveIntensity = f * 2; }
      if (t >= 3.2 && !outage) { outage = true; buildings.forEach((b) => b.emis.forEach((m) => (m.emissiveIntensity = b.weak ? 0 : 0.12))); lampMat.emissiveIntensity = 0; }
      // sallanma
      buildings.forEach((b) => {
        if (b.collapsed) return;
        const h = b.n * FH;
        const amp = A * (b.weak ? 0.018 : 0.008) * (h / 20);
        b.group.rotation.z = Math.sin(t * 9 + b.phase) * amp;
        b.group.rotation.x = Math.cos(t * 7.3 + b.phase) * amp * 0.6;
        b.group.position.x = b.x + Math.sin(t * 23 + b.phase) * A * 0.12;
      });
      // cokme: katlar yercekimiyle duser, ust uste yigilir; moloz ve toz
      weakOnes.forEach((b) => {
        if (t < b.tc) return;
        if (!b.collapsed) {
          b.collapsed = true;
          const MAXK = Math.min(60, MAXC - chunkList.length);
          for (let i = 0; i < MAXK; i++) {
            const side = Math.floor(r() * 4), along = (r() - 0.5) * b.w, hh = r() * b.n * FH;
            const off = [[b.w / 2, along], [-b.w / 2, along], [along, b.w / 2], [along, -b.w / 2]][side];
            const dir = [[1, 0], [-1, 0], [0, 1], [0, -1]][side];
            chunkList.push({ x: b.x + off[0], y: hh, z: b.z + off[1], vx: dir[0] * (2 + r() * 6) + (r() - 0.5) * 3, vy: 1 + r() * 4, vz: dir[1] * (2 + r() * 6) + (r() - 0.5) * 3, s: 0.8 + r() * 1.9, rx: r() * 6, ry: r() * 6, wr: (r() - 0.5) * 8, rest: false, delay: 0.3 + r() * 0.9 });
          }
        }
        const te = t - b.tc;
        b.group.rotation.z = b.lean * smooth(clamp(te / 0.9));
        b.group.rotation.x = b.lean * 0.4 * smooth(clamp(te / 0.9));
        b.floors.forEach((f) => {
          if (f.done || te < 0.35) return;
          const target = f.k * FH * 0.3 + FH * 0.15;
          f.vy -= 17 * dt;
          f.mesh.position.y += f.vy * dt;
          f.mesh.position.x = f.dx * smooth(clamp(te / 1.2));
          f.mesh.rotation.x = f.tilt * smooth(clamp(te / 1.2));
          f.mesh.rotation.z = f.tiltZ * smooth(clamp(te / 1.2));
          f.mesh.scale.y = lerp(1, 0.32, smooth(clamp(te / 1.0)));
          if (f.mesh.position.y <= target) { f.mesh.position.y = target; f.done = true; }
        });
        // toz bulutu: ilk 2 saniye boyunca tabandan yayilir
        if (te > 0.5 && te < 2.6) {
          const nSpawn = SMALL ? 4 : 8;
          for (let i = 0; i < nSpawn; i++) {
            const a = r() * Math.PI * 2, sp = 4 + r() * 10;
            dust.spawn({ x: b.x + Math.cos(a) * b.w * 0.4, y: 1 + r() * b.n * 1.5, z: b.z + Math.sin(a) * b.w * 0.4, vx: Math.cos(a) * sp, vy: 1 + r() * 3, vz: Math.sin(a) * sp, drag: 0.9, life: 4 + r() * 3, s0: 5, s1: 22 + r() * 14, a: 0.24, c0: [0.62, 0.58, 0.52], c1: [0.45, 0.43, 0.4] });
          }
        }
      });
      // moloz fizigi (yere carpip durur)
      let n = 0;
      for (const c of chunkList) {
        if (c.delay > 0) { c.delay -= dt; continue; }
        if (!c.rest) {
          c.vy -= 24 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt; c.rx += c.wr * dt; c.ry += c.wr * 0.7 * dt;
          if (c.y < c.s / 2) { c.y = c.s / 2; c.vy *= -0.25; c.vx *= 0.6; c.vz *= 0.6; c.wr *= 0.5; if (Math.abs(c.vy) < 0.8) c.rest = true; }
        }
        tmp.position.set(c.x, c.y, c.z); tmp.rotation.set(c.rx, c.ry, 0); tmp.scale.setScalar(c.s); tmp.updateMatrix();
        chunks.setMatrixAt(n++, tmp.matrix);
      }
      chunks.count = n; chunks.instanceMatrix.needsUpdate = true;
      dust.update(dt);
    },
  };
}

/* ================= SEL ================= */
function buildSel(ctx) {
  const { scene, r } = ctx;
  const sky = skyDome(0x6b7d92, 0x3c4752); scene.add(sky);
  scene.fog = new THREE.FogExp2(0x56636f, 0.0042);
  const hemi = new THREE.HemisphereLight(0xc4d3e3, 0x3b3626, 1.35); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xdfe7f0, 1.5); sun.position.set(-80, 140, 90); sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -140, right: 140, top: 110, bottom: -110, near: 10, far: 400 });
  sun.shadow.mapSize.set(SMALL ? 1024 : 2048, SMALL ? 1024 : 2048); sun.shadow.bias = -0.0006; scene.add(sun);

  // vadi araziye gomulu: x boyunca akan dere, z=0 dere yatagi, |z|>26 tepeler
  const noise = (x, z) => Math.sin(x * 0.045) * 1.6 + Math.sin(z * 0.07 + x * 0.02) * 1.2 + Math.sin(x * 0.13 + z * 0.11) * 0.5;
  const height = (x, z) => {
    const a = Math.abs(z);
    // dere yatagi (|z|<5), genis taskin ovasi (5-30), yumusak yukselen tepeler (en fazla ~24 m)
    if (a < 5) return -2.2 + (a / 5) * 1.6;
    if (a < 30) return -0.6 + (a - 5) * 0.04 + noise(x, z) * 0.12;
    return 0.4 + Math.min(24, Math.pow(a - 30, 1.25) * 0.42) + noise(x, z) * 1.2 * clamp((a - 30) / 10);
  };
  const tg = new THREE.PlaneGeometry(320, 200, SMALL ? 110 : 160, SMALL ? 70 : 100); tg.rotateX(-Math.PI / 2);
  const cols = [];
  const P = tg.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i), h = height(x, z);
    P.setY(i, h);
    const c = h < -1.2 ? new THREE.Color(0x5a4a38) : h < 1 ? new THREE.Color(0x4f6a3a).lerp(new THREE.Color(0x5d7444), r() * 0.4) : new THREE.Color(0x3e5a32).lerp(new THREE.Color(0x6a6a5a), clamp((h - 8) / 20));
    cols.push(c.r, c.g, c.b);
  }
  tg.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3)); tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  terrain.receiveShadow = true; scene.add(terrain);

  // su: camurlu, akan cizgili doku; seviye zamanla yukselir
  const streak = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#8d7b58"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(236,226,200,${0.12 + Math.random() * 0.25})`; g.lineWidth = 1 + Math.random() * 2; const y = Math.random() * h, x = Math.random() * w; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30 + Math.random() * 60, y + (Math.random() - 0.5) * 4); g.stroke(); }
  });
  streak.wrapS = streak.wrapT = THREE.RepeatWrapping; streak.repeat.set(12, 7);
  const wg = new THREE.PlaneGeometry(320, 200, 80, 50); wg.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ map: streak, color: 0xffffff, roughness: 0.15, metalness: 0.12, transparent: true, opacity: 0.94 }));
  scene.add(water);
  const WP = wg.attributes.position;
  const level = (t) => lerp(-1.5, 0.3, smooth(prog(t, 0.5, 3.2))) + lerp(0, 2.4, smooth(prog(t, 3.2, 7.6)));

  // nesneler: dere kenari (suruklenir) ve tepeler (guvende)
  const floaters = [];
  const placeAt = (o, x, z) => { o.position.set(x, height(x, z), z); scene.add(o); return o; };
  [[-95, 13], [-70, -15], [-40, 16], [-12, -13], [18, 14], [48, -16]].forEach(([x, z], i) => {
    const h = makeHouse([0xb7a58c, 0xc0b4a0, 0xa89377][i % 3], [0x8a3f2e, 0x6e3a2c][i % 2]);
    h.rotation.y = (r() - 0.5) * 0.4; placeAt(h, x, z); h.traverse((m) => m.isMesh && (m.castShadow = m.receiveShadow = true));
    floaters.push({ o: h, base: h.position.y, draft: 2.2, vx: 0, spin: (r() - 0.5) * 0.25, tilt: (r() - 0.5) * 0.4, kind: "ev" });
  });
  [[-82, 8, 0xc0392b], [-55, -9, 0x2c6db0], [-25, 9, 0xd4d4d4], [5, -8, 0xe0b23a]].forEach(([x, z, c]) => {
    const car = makeCar(c); car.rotation.y = r() * Math.PI; placeAt(car, x, z);
    floaters.push({ o: car, base: car.position.y, draft: 0.6, vx: 0, spin: (r() - 0.5) * 0.8, tilt: (r() - 0.5) * 0.8, kind: "araba" });
  });
  // agaclar (tepelerde sabit, kiyida suruklenebilir)
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 3, 6), crownGeo = new THREE.ConeGeometry(2.4, 7, 8);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4b3a2c }), crownMat = new THREE.MeshStandardMaterial({ color: 0x2f5a35, roughness: 0.9 });
  const makeTree = (s) => { const g = new THREE.Group(); const t = new THREE.Mesh(trunkGeo, trunkMat); t.position.y = 1.5; const c = new THREE.Mesh(crownGeo, crownMat); c.position.y = 6; c.castShadow = true; g.add(t, c); g.scale.setScalar(s); return g; };
  for (let i = 0; i < 16; i++) {
    const x = -110 + r() * 200, z = (r() < 0.5 ? -1 : 1) * (7 + r() * 18);
    const tr = makeTree(0.7 + r() * 0.5); placeAt(tr, x, z);
    floaters.push({ o: tr, base: tr.position.y, draft: 0.5, vx: 0, spin: (r() - 0.5) * 0.4, tilt: 0, kind: "agac", fall: (r() < 0.5 ? 1 : -1) });
  }
  const hillTrees = new THREE.InstancedMesh(crownGeo, crownMat, SMALL ? 140 : 280);
  const tmp = new THREE.Object3D();
  for (let i = 0; i < hillTrees.count; i++) {
    const x = -150 + r() * 300, z = (r() < 0.5 ? -1 : 1) * (36 + r() * 58);
    tmp.position.set(x, height(x, z) + 3.5, z); tmp.scale.setScalar(0.6 + r() * 0.6); tmp.updateMatrix(); hillTrees.setMatrixAt(i, tmp.matrix);
  }
  hillTrees.castShadow = true; scene.add(hillTrees);
  [[-20, 40], [24, -42], [60, 44]].forEach(([x, z]) => { const h = makeHouse(0xc7bba6, 0x7a3f32); h.rotation.y = Math.PI; placeAt(h, x, z); h.traverse((m) => m.isMesh && (m.castShadow = true)); });
  // kopru
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(6, 0.8, 16), new THREE.MeshStandardMaterial({ color: 0x8a8a84, roughness: 0.8 }));
  bridge.position.set(-90, 0.6, 0); bridge.castShadow = true; scene.add(bridge);

  // yagmur
  const RAIN = SMALL ? 1800 : 3600;
  const rpos = new Float32Array(RAIN * 6);
  const rg = new THREE.BufferGeometry(); rg.setAttribute("position", new THREE.BufferAttribute(rpos, 3).setUsage(THREE.DynamicDrawUsage));
  const rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0 }));
  rain.frustumCulled = false; scene.add(rain);
  const drops = []; for (let i = 0; i < RAIN; i++) drops.push([-160 + r() * 320, r() * 90, -100 + r() * 200, 38 + r() * 14]);
  let flash = 0;
  const flashes = [2.6, 6.2, 9.8];

  return {
    dur: 13,
    // vadi boyunca, dere ustunden asagi bakan kamera
    cam: (t) => ({ pos: new THREE.Vector3(lerp(-175, -120, smooth(prog(t, 0, 13))), lerp(30, 22, smooth(prog(t, 1, 11))), lerp(26, 14, smooth(prog(t, 0, 13)))), look: new THREE.Vector3(lerp(10, 60, smooth(prog(t, 1, 12))), lerp(-2, 0, smooth(prog(t, 1, 12))), 0) }),
    shake: () => 0,
    captions: [
      [0, "Kısa sürede çok yoğun yağış başlar."],
      [2.8, "Dere dakikalar içinde yükselir ve yatağından taşar."],
      [5.4, "Dere yatağına yapılan evler, araçlar ve ağaçlar akıntıyla sürüklenir."],
      [9.4, "Yağışta dere kenarından, alt geçitten ve bodrumdan uzak dur; yüksek bir yere çık. Tepedeki evler güvende."],
    ],
    reset() {
      floaters.forEach((f) => { f.o.position.y = f.base; f.o.rotation.x = f.o.rotation.z = 0; f.vx = 0; f.floating = false; f.x0 = f.x0 ?? f.o.position.x; f.o.position.x = f.x0; f.o.visible = true; });
      flash = 0;
    },
    update(t, dt) {
      const L = level(t);
      for (let i = 0; i < WP.count; i++) { const x = WP.getX(i), z = WP.getZ(i); WP.setY(i, L + Math.sin(x * 0.25 - t * 4 + z * 0.1) * 0.12 + Math.sin(z * 0.4 + t * 3) * 0.08); }
      WP.needsUpdate = true; wg.computeVertexNormals();
      streak.offset.x -= dt * lerp(0.05, 0.32, prog(t, 2, 6));
      // nesneler: su tabandan yuksege gecince suruklenir
      floaters.forEach((f) => {
        if (!f.floating && L > f.base + f.draft * 0.35) f.floating = true;
        if (!f.floating) return;
        f.vx = Math.min(f.vx + dt * (f.kind === "ev" ? 2.2 : 4), f.kind === "ev" ? 7 : 11);
        f.o.position.x += f.vx * dt;
        const bob = Math.sin(t * 2.4 + f.base) * 0.25;
        f.o.position.y = Math.max(f.base, L - f.draft) + bob;
        if (f.kind === "agac") { f.o.rotation.z = lerp(f.o.rotation.z, f.fall * 1.45, dt * 1.2); f.o.position.y = L - 0.6 + bob; }
        else { f.o.rotation.z = lerp(f.o.rotation.z, f.tilt, dt * 0.8); f.o.rotation.y += f.spin * dt; }
        if (f.o.position.x > 175) f.o.visible = false;
      });
      // yagmur
      const ri = prog(t, 0, 1.2);
      rain.material.opacity = 0.42 * ri;
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        d[1] -= d[3] * dt; if (d[1] < -2) d[1] += 92;
        rpos.set([d[0], d[1], d[2], d[0] - 0.35, d[1] - 1.6, d[2]], i * 6);
      }
      rg.attributes.position.needsUpdate = true;
      // simsek
      flashes.forEach((ft) => { if (t >= ft && t - dt < ft) flash = 1; });
      flash = Math.max(0, flash - dt * 6);
      hemi.intensity = 1.0 + flash * 3;
      sky.userData.mat.uniforms.top.value.setRGB(0.29 + flash * 0.5, 0.35 + flash * 0.5, 0.41 + flash * 0.5);
    },
  };
}

/* ================= ORMAN YANGINI ================= */
function buildYangin(ctx) {
  const { scene, r } = ctx;
  const sky = skyDome(0x24365a, 0xd27a48); scene.add(sky);
  scene.fog = new THREE.FogExp2(0x4a3a32, 0.0028);
  const hemi = new THREE.HemisphereLight(0xa9bede, 0x2c2418, 0.95); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb27a, 2.2); sun.position.set(-170, 75, -70); sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -200, right: 200, top: 140, bottom: -140, near: 10, far: 600 });
  sun.shadow.mapSize.set(SMALL ? 1024 : 2048, SMALL ? 1024 : 2048); sun.shadow.bias = -0.0006; scene.add(sun);

  const height = (x, z) => (x > 82 ? 0.4 : Math.sin(x * 0.03) * 4 + Math.cos(z * 0.035) * 3 + Math.sin((x + z) * 0.07) * 1.2) * (x > 70 ? 1 - clamp((x - 70) / 12) : 1) + 0.4;
  const tg = new THREE.PlaneGeometry(1100, 800, SMALL ? 160 : 230, SMALL ? 110 : 160); tg.rotateX(-Math.PI / 2);
  const P = tg.attributes.position, cols = [];
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i); P.setY(i, height(x, z));
    const c = x > 72 && x < 84 && Math.abs(z) < 120 ? new THREE.Color(0x7a6444) : new THREE.Color(0x4d6233).lerp(new THREE.Color(0x6a6a3c), r() * 0.5);
    cols.push(c.r, c.g, c.b);
  }
  tg.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3)); tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  terrain.receiveShadow = true; scene.add(terrain);

  // orman: orneklenmis cam agaclari; renk tutusma/kararma durumunu gosterir
  const N = SMALL ? 520 : 1000;
  const crownGeo = new THREE.ConeGeometry(2.6, 8.5, 7), trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3.2, 6);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), N);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x4a3828 }), N);
  crowns.castShadow = true; trunks.castShadow = true;
  const trees = [], tmp = new THREE.Object3D();
  const START = new THREE.Vector3(-150, 0, 6);
  for (let i = 0; i < N; i++) {
    const x = -175 + r() * 240, z = -110 + r() * 220, s = 0.75 + r() * 0.55, y = height(x, z);
    tmp.position.set(x, y + 1.6 * s, z); tmp.scale.setScalar(s); tmp.rotation.y = r() * 6; tmp.updateMatrix(); trunks.setMatrixAt(i, tmp.matrix);
    tmp.position.set(x, y + 7 * s, z); tmp.updateMatrix(); crowns.setMatrixAt(i, tmp.matrix);
    const g = new THREE.Color(0x2f5f36).lerp(new THREE.Color(0x46703a), r());
    crowns.setColorAt(i, g);
    // tutusma zamani: ruzgar yonunde (+x) hizlanan cephe, yanlara daha yavas yayilma
    const dx = x - START.x, dz = Math.abs(z - START.z);
    const ign = x > 58 ? Infinity : 1.0 + Math.pow(Math.max(0, dx), 0.82) / 9.5 + dz / 26 + r() * 0.7;
    trees.push({ x, y, z, s, base: g, ign, top: y + 10 * s });
  }
  crowns.instanceColor.needsUpdate = true;
  scene.add(crowns, trunks);

  // koy (bos seridin ardinda) ve ormana yakin tek ev
  const village = [];
  [[96, -30], [104, 10], [122, -12], [118, 34], [140, 6], [134, -40]].forEach(([x, z], i) => {
    const h = makeHouse([0xd8c9ad, 0xc9b896, 0xe0d4bd][i % 3], [0x9a3d2a, 0x7e3527][i % 2]); h.position.set(x, height(x, z), z); h.rotation.y = -Math.PI / 2 + (r() - 0.5) * 0.3;
    h.traverse((m) => m.isMesh && (m.castShadow = m.receiveShadow = true)); scene.add(h); village.push(h);
  });
  const nearHouse = makeHouse(0xcbb999, 0x8a3d2c); nearHouse.position.set(64, height(64, -50), -50); nearHouse.rotation.y = -Math.PI / 2; nearHouse.traverse((m) => m.isMesh && (m.castShadow = true)); scene.add(nearHouse);

  // ates, duman, kivilcim, su
  const fire = new Particles(SMALL ? 1600 : 3200, ctx.sprite, true); scene.add(fire.points);
  const smoke = new Particles(SMALL ? 500 : 1000, ctx.sprite, false); scene.add(smoke.points);
  const embers = new Particles(SMALL ? 300 : 600, ctx.sprite, true); scene.add(embers.points);
  const waterP = new Particles(SMALL ? 500 : 900, ctx.sprite, false); scene.add(waterP.points);
  const glows = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight(0xff7a2a, 0, 120, 1.6); scene.add(l); return l; });
  // ucak
  const plane = new THREE.Group();
  const pm = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.5 }), pr = new THREE.MeshStandardMaterial({ color: 0xc0392b });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.8, 16, 10), pm); body.rotation.z = Math.PI / 2; plane.add(body);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 22), pm); wing.position.set(0.5, 1, 0); plane.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3.2, 0.3), pr); tail.position.set(-7, 1.8, 0); plane.add(tail);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.25, 7), pm); stab.position.set(-7, 0.6, 0); plane.add(stab);
  plane.visible = false; scene.add(plane);
  const WIND = new THREE.Vector3(5, 0, 0);
  const PLANE_T = [8.4, 11.2];

  return {
    dur: 14,
    cam: (t) => {
      const k = smooth(prog(t, 0, 13.5));
      return { pos: new THREE.Vector3(lerp(-215, 55, k), lerp(42, 48, k), lerp(95, 135, k)), look: new THREE.Vector3(lerp(-140, 85, smooth(prog(t, 0.5, 12.5))), 6, lerp(0, -12, k)) };
    },
    shake: () => 0,
    captions: [
      [0, "Ormanda yakılan bir ateş, atılan bir sigara ya da cam şişe…"],
      [2.2, "Sıcak, kuru ve rüzgârlı havada alevler ağaçtan ağaca hızla geçer."],
      [5.6, "Rüzgârın taşıdığı kıvılcımlar ileride yeni yangınlar başlatır; duman köye ulaşır."],
      [10.2, "Duman ya da alev görürsen hemen 177'yi ara. Ormanda ateş yakma; köyle orman arasında boş şerit bırak."],
    ],
    reset() {
      fire.clear(); smoke.clear(); embers.clear(); waterP.clear();
      trees.forEach((tr, i) => crowns.setColorAt(i, tr.base)); crowns.instanceColor.needsUpdate = true;
      plane.visible = false; glows.forEach((l) => (l.intensity = 0));
      scene.fog.color.set(0x3a3236);
    },
    update(t, dt) {
      const tmpC = new THREE.Color();
      let burning = 0, sx = 0, sz = 0;
      const suppressed = (tr) => t > 9.4 && tr.x > 30;
      const fireBudget = SMALL ? 3 : 6;
      trees.forEach((tr, i) => {
        if (t < tr.ign) return;
        const age = t - tr.ign;
        const stop = suppressed(tr) && age > 0.4;
        // renk: yesil -> kizil -> kom
        const k = clamp(age / 2.6);
        if (k < 1 || stop) {
          tmpC.copy(tr.base).lerp(new THREE.Color(0x6e2f12), clamp(k * 2)).lerp(new THREE.Color(0x141210), clamp((k - 0.45) / 0.55));
          crowns.setColorAt(i, tmpC);
        }
        if (age < 3.2 && !stop) {
          burning++; sx += tr.x; sz += tr.z;
          const inten = Math.sin(clamp(age / 3.2) * Math.PI); // tutusur, buyur, soner
          if (Math.random() < (fireBudget / 8) * (0.4 + inten)) {
            fire.spawn({ x: tr.x + (Math.random() - 0.5) * 3.5 * tr.s, y: tr.y + (1 + Math.random() * 6) * tr.s, z: tr.z + (Math.random() - 0.5) * 3.5 * tr.s, vx: (Math.random() - 0.5) * 1.2, vy: 7 + Math.random() * 6, vz: (Math.random() - 0.5) * 1.2, w: 0.5, life: 0.9 + Math.random() * 0.7, s0: 15 * tr.s, s1: 5 * tr.s, a: 0.42, c0: [1.0, 0.55, 0.14], c1: [0.75, 0.1, 0.02] });
            fire.spawn({ x: tr.x + (Math.random() - 0.5) * 2 * tr.s, y: tr.y + (1 + Math.random() * 4) * tr.s, z: tr.z + (Math.random() - 0.5) * 2 * tr.s, vx: 0, vy: 5 + Math.random() * 4, vz: 0, w: 0.3, life: 0.5 + Math.random() * 0.4, s0: 7 * tr.s, s1: 2.5 * tr.s, a: 0.8, c0: [1.0, 0.88, 0.5], c1: [1.0, 0.5, 0.1] });
          }
          if (Math.random() < 0.1) smoke.spawn({ x: tr.x, y: tr.top + 4, z: tr.z, vx: 0, vy: 7 + Math.random() * 4, vz: (Math.random() - 0.5) * 2, w: 2.4, drag: 0.1, life: 5 + Math.random() * 3, s0: 10, s1: 42 + Math.random() * 20, a: 0.26, c0: [0.24, 0.21, 0.2], c1: [0.42, 0.39, 0.38] });
          if (t > 4 && t < 9.4 && Math.random() < 0.05) embers.spawn({ x: tr.x, y: tr.top, z: tr.z, vx: 10 + Math.random() * 16, vy: 6 + Math.random() * 8, vz: (Math.random() - 0.5) * 6, g: -6, life: 1.6 + Math.random() * 1.4, s0: 1.6, s1: 0.8, a: 1, c0: [1, 0.7, 0.25], c1: [1, 0.3, 0.05] });
        }
      });
      crowns.instanceColor.needsUpdate = true;
      // isik: yanan bolgenin ortasinda titreyen turuncu isiklar
      if (burning) { sx /= burning; sz /= burning; }
      glows.forEach((l, i) => {
        l.intensity = burning ? Math.min(900, burning * 22) * (0.75 + Math.random() * 0.25) : Math.max(0, l.intensity - dt * 400);
        l.position.set(sx + (i - 1.5) * 18, 14, sz + ((i % 2) - 0.5) * 50);
      });
      scene.fog.color.setRGB(0.23 + Math.min(0.12, burning * 0.0009), 0.2, 0.21);
      // ucak: z boyunca gecer, su birakir
      const pk = prog(t, PLANE_T[0], PLANE_T[1]);
      plane.visible = pk > 0 && pk < 1;
      if (plane.visible) {
        plane.position.set(lerp(-40, 70, pk), 42 + Math.sin(pk * Math.PI) * 4, lerp(140, -140, pk));
        plane.lookAt(plane.position.x + 110, plane.position.y, plane.position.z - 280);
        plane.rotateY(-Math.PI / 2);
        if (pk > 0.15 && pk < 0.85) for (let j = 0; j < 14; j++) waterP.spawn({ x: plane.position.x + (Math.random() - 0.5) * 4, y: plane.position.y - 2, z: plane.position.z + (Math.random() - 0.5) * 4, vx: 6 + (Math.random() - 0.5) * 4, vy: -4 - Math.random() * 4, vz: -12 + (Math.random() - 0.5) * 4, g: -18, drag: 0.3, life: 2.6, s0: 4, s1: 14, a: 0.55, c0: [0.75, 0.86, 0.95], c1: [0.9, 0.95, 1], floor: 0.5 });
      }
      fire.update(dt, WIND); smoke.update(dt, WIND); embers.update(dt, WIND); waterP.update(dt);
      village.forEach((h) => h.userData.winMat && (h.userData.winMat.emissiveIntensity = 1.2));
    },
  };
}

const BUILDERS = { deprem: buildDeprem, sel: buildSel, yangin: buildYangin };

/* ================= motor ================= */
export function create(host, type) {
  const canvas = document.createElement("canvas");
  host.appendChild(canvas);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" }); } catch { canvas.remove(); return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, SMALL ? 1.5 : 1.75));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 2000);
  const ctx = { scene, r: rng(42), sprite: softSprite() };
  const S = BUILDERS[type](ctx);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 40; controls.maxDistance = 420; controls.enablePan = false;
  let userCam = false;
  controls.addEventListener("start", () => { userCam = true; });
  // telefonda dikey kaydirma sayfayi kaydirsin, yatay surukleme sahneyi dondursun
  canvas.style.touchAction = "pan-y";
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.62, 0.5, 0.84);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function resize() {
    const w = host.clientWidth, h = Math.round(w * 9 / 16);
    renderer.setSize(w, h, false); canvas.style.width = "100%"; canvas.style.height = "auto";
    composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    const scale = (h * renderer.getPixelRatio()) / 2 / Math.tan((camera.fov * Math.PI) / 360);
    scene.traverse((o) => { if (o.material && o.material.uniforms && o.material.uniforms.scale) o.material.uniforms.scale.value = scale / 2.2; });
  }
  const ro = new ResizeObserver(resize); ro.observe(host);
  resize();

  let t = 0, playing = false, last = 0, visible = true;
  function placeCam(time) {
    const c = S.cam(time);
    camera.position.copy(c.pos); controls.target.copy(c.look);
    const A = S.shake(time);
    if (A) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * A, (Math.random() - 0.5) * A * 0.6, (Math.random() - 0.5) * A));
    camera.lookAt(controls.target);
  }
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    if (playing) {
      t = Math.min(S.dur, t + dt);
      S.update(t, dt);
      if (!userCam) placeCam(t); else controls.update();
      host.dispatchEvent(new CustomEvent("sahne:t", { detail: t }));
      if (t >= S.dur) { playing = false; host.dispatchEvent(new CustomEvent("sahne:end")); }
    } else controls.update();
    composer.render();
  }
  const io = new IntersectionObserver((e) => { visible = e[0].isIntersecting; renderer.setAnimationLoop(visible ? frame : null); }, { threshold: 0.05 });
  io.observe(host);
  S.reset(); S.update(0, 0.016); placeCam(0); controls.update(); composer.render();

  return {
    dur: S.dur, captions: S.captions,
    play() { S.reset(); t = 0; userCam = false; playing = true; last = performance.now(); },
    showEnd() { S.reset(); for (let k = 0; k < S.dur; k += 0.05) S.update(k, 0.05); t = S.dur; placeCam(S.dur); composer.render(); },
    destroy() { renderer.setAnimationLoop(null); io.disconnect(); ro.disconnect(); controls.dispose(); renderer.dispose(); canvas.remove(); },
  };
}
