// 3D deprem globu: Turkiye'yi merkeze alan, yavasca donen tel-kafes bir kure
// uzerinde son depremlerin "titreyerek" beliren noktalar halinde gosterimi.
window.QuakeGlobe = (function () {
  function magColor(mag) {
    if (mag >= 5) return 0xd03b3b;
    if (mag >= 3.5) return 0xeb6834;
    if (mag >= 2) return 0xf5a35c;
    return 0xffd08a;
  }

  function latLonToVec3(lat, lon, radius, THREE) {
    const phi = ((90 - lat) * Math.PI) / 180;
    const theta = ((lon + 180) * Math.PI) / 180;
    const x = -radius * Math.sin(phi) * Math.cos(theta);
    const z = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);
    return new THREE.Vector3(x, y, z);
  }

  function create(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof THREE === "undefined") return null;

    const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    const RADIUS = 4.6;
    // Turkiye yaklasik 39K / 35D -> kamerayi bu yone bakacak sekilde konumlandir
    const focus = latLonToVec3(33, 20, RADIUS * 2.6, THREE);
    camera.position.set(focus.x, focus.y + 0.4, focus.z);
    camera.lookAt(0, 0, 0);

    const group = new THREE.Group();
    scene.add(group);

    // ana kure: hafif dolgulu + tel kafes
    const solidGeo = new THREE.SphereGeometry(RADIUS - 0.02, 48, 32);
    const solidMat = new THREE.MeshBasicMaterial({ color: 0x0c1119, transparent: true, opacity: 0.9 });
    group.add(new THREE.Mesh(solidGeo, solidMat));

    const wireGeo = new THREE.SphereGeometry(RADIUS, 28, 20);
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x2a4a6e, wireframe: true, transparent: true, opacity: 0.35 });
    group.add(new THREE.Mesh(wireGeo, wireMat));

    // ince disk halka (atmosfer hissi)
    const glowGeo = new THREE.SphereGeometry(RADIUS + 0.12, 32, 24);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x2a78d6, transparent: true, opacity: 0.06 });
    group.add(new THREE.Mesh(glowGeo, glowMat));

    let mouseX = 0, mouseY = 0;
    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      mouseY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    });

    function resize() {
      const w = canvas.parentElement ? canvas.parentElement.clientWidth : canvas.clientWidth;
      const h = canvas.parentElement ? canvas.parentElement.clientHeight : canvas.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / (h || 1);
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener("resize", resize);

    // ---- deprem noktalari ----
    const points = []; // { mesh, ring, spawn, mag }
    const plotted = new Set();

    function addQuake(q, opts = {}) {
      if (!q || plotted.has(q.id)) return;
      plotted.add(q.id);
      const pos = latLonToVec3(q.lat, q.lon, RADIUS + 0.03, THREE);
      const color = magColor(q.mag);
      const size = Math.max(0.035, Math.min(0.16, 0.035 + q.mag * 0.018));

      const geo = new THREE.SphereGeometry(size, 10, 8);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.scale.setScalar(0.001);
      group.add(mesh);

      const ringGeo = new THREE.RingGeometry(size * 1.1, size * 1.4, 20);
      const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(pos);
      ring.lookAt(pos.clone().multiplyScalar(2));
      group.add(ring);

      points.push({ mesh, ring, spawn: performance.now(), mag: q.mag, baseSize: size });

      if (!opts.silent && points.length > 1) {
        // fazla birikmesin diye eski nokta sayisi sinirlandirilabilir (istege bagli)
      }
    }

    function clearAll() {
      points.forEach((p) => {
        group.remove(p.mesh);
        group.remove(p.ring);
      });
      points.length = 0;
      plotted.clear();
    }

    function setQuakes(list) {
      clearAll();
      list.forEach((q, i) => {
        setTimeout(() => addQuake(q), Math.min(i * 18, 1400));
      });
    }

    let running = true;
    document.addEventListener("visibilitychange", () => { running = !document.hidden; });

    let t = 0;
    function animate() {
      requestAnimationFrame(animate);
      if (!running) return;
      t += reducedMotion ? 0.0006 : 0.0016;

      group.rotation.y = t * 0.6 + mouseX * 0.3;
      group.rotation.x = mouseY * 0.15;

      const now = performance.now();
      points.forEach((p) => {
        const age = now - p.spawn;
        // giris: 0-500ms elastik buyume
        const growT = Math.min(age / 500, 1);
        const eased = growT < 1 ? 1 - Math.pow(1 - growT, 3) : 1;
        const pulse = 1 + Math.sin(now / (280 - p.mag * 12)) * 0.12;
        p.mesh.scale.setScalar(eased * pulse);

        // sok halkasi: genislesin ve sonup gitsin (2.2 sn'de bir tekrar)
        const ringT = (age % 2200) / 2200;
        p.ring.scale.setScalar(1 + ringT * 2.6);
        p.ring.material.opacity = Math.max(0, 0.55 * (1 - ringT));
      });

      renderer.render(scene, camera);
    }
    animate();

    return { setQuakes, addQuake, clearAll, resize };
  }

  return { create };
})();
