// Hafif 3D arka plan animasyonu (Three.js). Ana sayfa ve giris sayfasinda kullanilir.
// Parcaciklardan olusan bir kure + yavasca donen tel-kafes cokgen, fare ile hafif paralaks.
window.initHeroBG = function initHeroBG(canvasId, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof THREE === "undefined") return;

  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const colors = (opts.colors || ["#2a78d6", "#eb6834", "#e34948"]).map((c) => new THREE.Color(c));

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.set(0, 0, 13);

  // ---- parcacik kuresi ----
  const COUNT = opts.count || 700;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(COUNT * 3);
  const colorArr = new Float32Array(COUNT * 3);
  const radius = opts.radius || 7.2;

  for (let i = 0; i < COUNT; i++) {
    // kure yuzeyine yakin, hafif kalinlikli dagilim
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = radius * (0.82 + Math.random() * 0.22);
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    const c = colors[i % colors.length];
    colorArr[i * 3] = c.r;
    colorArr[i * 3 + 1] = c.g;
    colorArr[i * 3 + 2] = c.b;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colorArr, 3));

  const material = new THREE.PointsMaterial({
    size: opts.pointSize || 0.075,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  scene.add(points);

  // ---- tel kafes cokgen (merkez) ----
  const icoGeo = new THREE.IcosahedronGeometry(4.1, 1);
  const icoMat = new THREE.MeshBasicMaterial({
    color: 0x6da7ec,
    wireframe: true,
    transparent: true,
    opacity: 0.16,
  });
  const ico = new THREE.Mesh(icoGeo, icoMat);
  scene.add(ico);

  // ---- disk halka ----
  const ringGeo = new THREE.TorusGeometry(6.2, 0.01, 8, 120);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xeb6834, transparent: true, opacity: 0.22 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2.3;
  scene.add(ring);

  let mouseX = 0,
    mouseY = 0;
  window.addEventListener(
    "mousemove",
    (e) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    },
    { passive: true }
  );

  function resize() {
    const w = canvas.parentElement ? canvas.parentElement.clientWidth : window.innerWidth;
    const h = canvas.parentElement ? canvas.parentElement.clientHeight : window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  let running = true;
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
  });

  let t = 0;
  function animate() {
    requestAnimationFrame(animate);
    if (!running) return;
    t += reducedMotion ? 0.0009 : 0.0028;

    points.rotation.y = t * 0.9;
    points.rotation.x = Math.sin(t * 0.4) * 0.15;
    ico.rotation.y = -t * 0.6;
    ico.rotation.x = t * 0.35;
    ring.rotation.z = t * 0.5;

    camera.position.x += (mouseX * 1.4 - camera.position.x) * 0.04;
    camera.position.y += (-mouseY * 1.0 - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }
  animate();
};
