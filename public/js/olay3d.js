// Gercek veriyle afet canlandirmalari (Three.js, MIT): uydu goruntusu kaplanmis 3B arazide
//  - yangin: 2021 Manavgat; uydu isi noktalarina gore saat saat yayilma, once/sonra Sentinel-2
//  - deprem: 6 Subat 2023; fay kirilmasi, P/S dalgalari, EMSC kayitlariyla artcilar
//  - sel:    2021 Bozkurt; sel sonrasi uydu izinden cikarilan taskin alaninda yukselen su
// Veri: public/data/olay/<ad>/ (dem.bin: Uint16 yukseklik 0,1 m, satirlar kuzeyden guneye).
// Three.js yalnizca bolum ekrana yaklasinca yuklenir.
// Kullanim: <div class="olay3d" data-olay="manavgat-2021"></div>
//           sekme: <button data-olay-tab="kahramanmaras-2023" data-target="<hostId>">

const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const SMALL = window.innerWidth < 700;
const BG = 0x0c1118;
const nf = new Intl.NumberFormat("tr-TR");
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const tsi = (ms, o) => new Date(ms).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", ...o });

/* ---------------- olaylar ---------------- */
const MANAVGAT_T0 = Date.UTC(2021, 6, 27, 21); // saat 0 = 28 Temmuz 2021 00:00 (TSI)
const DEPREM_T0 = Date.parse("2023-02-06T01:17:36Z"); // sn 0 = 04.17.36 (TSI)
const shortMonth = (s) => s.replace(" Temmuz", " Tem").replace(" Ağustos", " Ağu");

const OLAYLAR = {
  "manavgat-2021": {
    kind: "yangin",
    dem: [512, 459], km: [56.97, 51.05], exag: 1.9,
    keys: [[0, 12], [1, 234]], play: 36,
    clock: (h) => tsi(MANAVGAT_T0 + h * 3600e3, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    ticks: Array.from({ length: 9 }, (_, i) => [(i + 1) * 24, shortMonth(tsi(MANAVGAT_T0 + (i + 1) * 864e5, { day: "numeric", month: "long" })), i % 2 === 0]),
    places: [["Manavgat", 36.787, 31.441], ["Side", 36.766, 31.389], ["Oymapınar Baraj Gölü", 36.871, 31.546], ["İbradı", 37.097, 31.597], ["Akseki", 37.046, 31.79], ["Taşağıl", 36.92, 31.236]],
    notes: [
      [0, "28 Temmuz öğle saatlerinde Manavgat'ta başlayan yangın, aşırı sıcak ve kuvvetli rüzgârla kısa sürede büyüdü."],
      [30, "Uydu tespitlerine göre yangın ikinci gün doğuya, Oymapınar Baraj Gölü çevresine doğru genişledi."],
      [96, "Sonraki günlerde ısı noktaları giderek kuzeydeki dağlık ve ormanlık alana kaydı."],
      [200, "Duman ya da alev görürsen hemen 177'yi ara; rüzgârın estiği yönden uzaklaş, tahliye talimatlarına uy."],
      [222, "Manavgat yangını 10. gününde kontrol altına alındı. Koyu alan, 24 Ağustos 2021 uydu görüntüsündeki yanık izidir."],
    ],
    legend: [["lg-front", "Yangın cephesi"], ["lg-hot", "Uydunun tespit ettiği ısı noktası"], ["lg-burn", "Yanmış alan"]],
    credit: "Uydu görüntüsü: Copernicus Sentinel-2 (20 Temmuz ve 24 Ağustos 2021) · Isı noktaları: NASA FIRMS, VIIRS · Yükseklik: AWS Terrain Tiles",
  },
  "kahramanmaras-2023": {
    kind: "deprem",
    dem: [512, 533], km: [287.79, 299.62], exag: 6,
    // kaydirma cubugu: ilk 150 sn ve ikinci depremin cevresi yavas, aradaki saatler/gunler logaritmik
    keys: [[0, 0], [0.24, 150], [0.42, 32790, "log"], [0.62, 32990], [1, 14 * 86400, "log"]], play: 48,
    clock: (s) => tsi(DEPREM_T0 + s * 1000, s < 86400 ? { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" } : { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    ticks: [[0, "04.17"], [60, "+1 dk"], [32834, "13.24"], [86400, "2. gün"], [5 * 86400, "6. gün", true], [14 * 86400 - 1, "14. gün"]],
    places: [["Kahramanmaraş", 37.575, 36.923], ["Gaziantep", 37.066, 37.383], ["Hatay", 36.203, 36.16], ["Adıyaman", 37.765, 38.279], ["Malatya", 38.355, 38.31], ["Osmaniye", 37.074, 36.248], ["Kilis", 36.718, 37.121], ["İskenderun", 36.59, 36.171], ["Elbistan", 38.202, 37.19], ["Nurdağı", 37.178, 36.741]],
    notes: [
      [0, "6 Şubat 2023, 04.17: Pazarcık merkezli 7,7 büyüklüğünde deprem. Fay kırılmaya başladı."],
      [12, "Kırılma Doğu Anadolu Fay Zonu boyunca yüzlerce kilometre ilerledi; sarsıntı dalgaları saniyeler içinde bölgedeki illere ulaştı."],
      [150, "Sarsıntı anında: Çök, kapan, tutun. Sarsıntı bitince sakin şekilde, merdivenle çık; asansör kullanma."],
      [32834, "Aynı gün 13.24'te Elbistan merkezli 7,6 büyüklüğünde ikinci deprem geldi."],
      [33200, "Büyük bir depremden saatler sonra yeni bir büyük deprem gelebilir: hasarlı binalara girme."],
      [2 * 86400, "Sonraki iki haftada M3 ve üzeri 1.400'ü aşkın deprem kaydedildi. Toplanma alanında bekle, yetkililerin uyarılarına uy; acil durumda 112."],
    ],
    legend: [["lg-rupture", "Kırılan fay (yaklaşık)"], ["lg-fault", "Diğer aktif faylar"], ["lg-quake", "Deprem (M3+)"], ["lg-wave", "Sarsıntı dalgası"]],
    credit: "Uydu görüntüsü: EOxCloudless 2016, EOX IT Services (değiştirilmiş Copernicus Sentinel verisi, CC BY 4.0) · Depremler: EMSC, ana deprem büyüklükleri AFAD · Fay hatları: GEM Küresel Aktif Faylar (CC BY-SA 4.0) · Yükseklik: AWS Terrain Tiles. Dalgalar yaklaşık P ve S dalgası hızlarıyla çizildi; kırılan faylar ilk günlerin artçılarına göre yaklaşık belirlendi",
  },
  "bozkurt-2021": {
    kind: "sel",
    dem: [512, 572], km: [14.91, 16.65], exag: 1.5, bbox: [33.92, 41.84, 34.1, 41.99],
    keys: [[0, 0], [1, 100]], play: 32,
    clock: (t) => (t < 78 ? `11 Ağustos 2021 · ${t < 24 ? "Şiddetli yağış" : t < 46 ? "Dere yükseliyor" : "Taşkın"}` : "8 Eylül 2021 · Sel sonrası uydu görüntüsü"),
    ticks: [[0, "Yağış"], [24, "Dere yükseliyor"], [46, "Taşkın"], [80, "Sonrası"]],
    places: [["Bozkurt", 41.9588, 34.0126], ["Abana", 41.9785, 34.0077], ["Ezine Çayı", 41.9117, 34.0507], ["Karadeniz", 41.988, 33.955]],
    notes: [
      [0, "11 Ağustos 2021. Batı Karadeniz'de kısa sürede çok yoğun yağış başladı."],
      [24, "Ezine Çayı hızla yükselerek yatağından taştı."],
      [46, "Su, dere yatağına yakın binaları yıktı; köprüler ve yollar kullanılamaz hale geldi. En ağır yıkım Bozkurt'ta yaşandı."],
      [78, "8 Eylül 2021 uydu görüntüsü: selin Ezine Çayı vadisinde bıraktığı iz ve denize taşınan çamur görülüyor."],
      [88, "Sel uyarısında dere yatağından, alt geçitten ve bodrum kattan uzak dur; akan suya girme, yüksek bir yere çık. Acil durumda 112."],
    ],
    legend: [["lg-flood", "Taşkın suyu"], ["lg-rain", "Yağış"]],
    credit: "Uydu görüntüsü: Copernicus Sentinel-2 (30 Temmuz ve 8 Eylül 2021) · Yükseklik: AWS Terrain Tiles. Taşkın alanı sel sonrası uydu görüntüsündeki izden çıkarıldı; suyun yükseliş hızı ve yağış temsilîdir",
  },
};

/* --- kaydirma konumu (0..1) <-> olay zamani; parca parca dogrusal ya da logaritmik --- */
function timeline(keys) {
  const seg = (x, i) => keys[i][2] === "log";
  return {
    t0: keys[0][1], t1: keys[keys.length - 1][1],
    timeAt(p) {
      for (let i = 1; i < keys.length; i++) {
        const [pa, ta] = keys[i - 1], [pb, tb] = keys[i];
        if (p <= pb || i === keys.length - 1) {
          const k = clamp((p - pa) / (pb - pa));
          return seg(p, i) ? ta * Math.pow(tb / ta, k) : ta + (tb - ta) * k;
        }
      }
      return keys[keys.length - 1][1];
    },
    posAt(t) {
      for (let i = 1; i < keys.length; i++) {
        const [pa, ta] = keys[i - 1], [pb, tb] = keys[i];
        if (t <= tb || i === keys.length - 1) {
          const k = seg(t, i) ? Math.log(Math.max(t, ta) / ta) / Math.log(tb / ta) : (t - ta) / (tb - ta);
          return pa + (pb - pa) * clamp(k);
        }
      }
      return 1;
    },
  };
}

/* ---------------- arayuz ---------------- */
function mount(host) {
  const name = host.dataset.olay;
  const cfg = OLAYLAR[name];
  if (!cfg) return null;
  const tl = timeline(cfg.keys);
  host.innerHTML = `
    <div class="olay-stage olay-${cfg.kind}">
      <div class="olay-poster"><span class="spinner"></span><span>Uydu verisi yükleniyor…</span></div>
      <div class="olay-hud">
        <b class="olay-clock">${cfg.clock(tl.t0)}</b>
        <span class="olay-count">&nbsp;</span>
      </div>
      <div class="olay-labels"></div>
    </div>
    <div class="olay-ui">
      <button type="button" class="btn btn-primary btn-sm olay-play" disabled>${window.HavaIcon ? window.HavaIcon("play", { size: 14 }) : ""} <span>Oynat</span></button>
      <div class="olay-track">
        <canvas class="olay-hist" aria-hidden="true"></canvas>
        <input type="range" class="olay-range" min="0" max="1" step="any" value="0" aria-label="Zaman" disabled />
        <div class="olay-ticks" aria-hidden="true"></div>
      </div>
    </div>
    <p class="olay-cap" aria-live="polite">${cfg.notes[0][1]}</p>
    <div class="olay-legend">${cfg.legend.map(([c, t]) => `<span><i class="${c}"></i>${t}</span>`).join("")}</div>
    <p class="field-hint olay-credit">${cfg.credit}. Sahneyi sürükleyerek döndürebilir, iki parmakla ya da tekerlekle yakınlaştırabilirsin.</p>`;

  const $ = (s) => host.querySelector(s);
  const stage = $(".olay-stage"), range = $(".olay-range"), playBtn = $(".olay-play");
  const clock = $(".olay-clock"), count = $(".olay-count"), cap = $(".olay-cap");

  const ticks = $(".olay-ticks");
  for (const [t, label, odd] of cfg.ticks) {
    const el = document.createElement("span");
    el.style.left = `${tl.posAt(t) * 100}%`;
    if (odd) el.className = "odd";
    el.textContent = label;
    ticks.appendChild(el);
  }

  let eng = null, playing = false, last = 0, cur = 0, dead = false;
  const setPos = (p) => {
    cur = p;
    const t = tl.timeAt(p);
    range.value = p;
    const label = cfg.clock(t);
    range.setAttribute("aria-valuetext", label);
    clock.textContent = label;
    if (!eng) return;
    eng.setTime(t, p);
    count.textContent = eng.stats(t);
    let note = cfg.notes[0][1];
    for (const [s, n] of cfg.notes) if (t >= s) note = n;
    if (cap.textContent !== note) cap.textContent = note;
    drawHist(p);
  };
  const setPlaying = (on) => {
    playing = on;
    const icon = window.HavaIcon ? window.HavaIcon(on ? "pause" : "play", { size: 14 }) : "";
    playBtn.innerHTML = `${icon} <span>${on ? "Duraklat" : cur >= 1 ? "Tekrar oynat" : "Oynat"}</span>`;
    if (on) { last = performance.now(); requestAnimationFrame(tick); }
  };
  function tick(now) {
    if (!playing || dead) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const p = Math.min(1, cur + dt / cfg.play);
    setPos(p);
    if (p >= 1) setPlaying(false);
    else requestAnimationFrame(tick);
  }
  playBtn.addEventListener("click", () => {
    if (!playing && cur >= 1) setPos(0);
    setPlaying(!playing);
  });
  range.addEventListener("input", () => { setPlaying(false); setPos(+range.value); });

  // zaman cizelgesi ustunde olay yogunlugu (kaydirma konumuna gore 60 dilim)
  const hist = $(".olay-hist");
  let bins = null;
  function drawHist(p) {
    if (!bins) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = hist.clientWidth, ht = hist.clientHeight;
    if (!w) return;
    if (hist.width !== Math.round(w * dpr)) { hist.width = Math.round(w * dpr); hist.height = Math.round(ht * dpr); }
    const g = hist.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, ht);
    const max = Math.max(...bins) || 1;
    const css = getComputedStyle(host);
    const on = css.getPropertyValue(cfg.kind === "sel" ? "--c-weather" : cfg.kind === "deprem" ? "--c-quake" : "--c-fire").trim() || "#ef4444";
    const off = css.getPropertyValue("--border-strong").trim() || "#555";
    const bw = w / bins.length;
    bins.forEach((n, i) => {
      if (!n) return;
      const bh = Math.max(2, Math.sqrt(n / max) * (ht - 2));
      g.fillStyle = (i + 0.5) / bins.length <= p ? on : off;
      g.fillRect(i * bw + 1, ht - bh, Math.max(1, bw - 2), bh);
    });
  }
  const onResize = () => drawHist(cur);
  window.addEventListener("resize", onResize);

  const io = new IntersectionObserver((e) => {
    if (!e[0].isIntersecting) return;
    io.disconnect();
    create(stage, cfg, name, tl).then((engine) => {
      if (dead) { engine.destroy(); return; }
      eng = engine;
      $(".olay-poster").remove();
      bins = new Array(60).fill(0);
      if (engine.times) for (const t of engine.times) bins[Math.min(59, Math.floor(tl.posAt(t) * 60))]++;
      else if (engine.curve) for (let i = 0; i < 60; i++) bins[i] = engine.curve(tl.timeAt((i + 0.5) / 60));
      playBtn.disabled = false;
      range.disabled = false;
      setPos(0);
    }).catch((err) => {
      console.error(err);
      const poster = $(".olay-poster");
      if (poster) poster.innerHTML = "<span>Sahne yüklenemedi. Tarayıcın 3B görüntülemeyi desteklemiyor olabilir.</span>";
    });
  }, { rootMargin: "300px" });
  io.observe(host);

  return {
    destroy() {
      dead = true; playing = false;
      io.disconnect();
      window.removeEventListener("resize", onResize);
      if (eng) eng.destroy();
      host.innerHTML = "";
    },
  };
}

/* ---------------- 3B sahne: ortak altyapi ---------------- */
const GLSL_COMMON = `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

async function create(stage, cfg, name, tl) {
  const [THREE, { OrbitControls }, { EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
    import("./vendor/three/three.module.min.js"),
    import("./vendor/three/OrbitControls.js"),
    import("./vendor/three/EffectComposer.js"),
    import("./vendor/three/RenderPass.js"),
    import("./vendor/three/UnrealBloomPass.js"),
    import("./vendor/three/OutputPass.js"),
  ]);
  const dir = `/data/olay/${name}/`;
  const texLoader = new THREE.TextureLoader();
  const disposables = [];
  const loadTex = (f) => new Promise((ok, no) => texLoader.load(dir + f, (t) => { disposables.push(t); ok(t); }, undefined, no));
  const loadBin = (f) => fetch(dir + f).then((r) => { if (!r.ok) throw new Error(f); return r.arrayBuffer(); });
  const loadJson = (f) => fetch(dir + f).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });

  const [DW, DH] = cfg.dem, [WKM, HKM] = cfg.km;
  const SIZE = Math.max(WKM, HKM);
  const dem = new Uint16Array(await loadBin("dem.bin"));
  const heightAt = (u, v) => {
    const fx = clamp(u) * (DW - 1), fy = clamp(v) * (DH - 1);
    const x = Math.min(DW - 2, Math.floor(fx)), y = Math.min(DH - 2, Math.floor(fy));
    const ax = fx - x, ay = fy - y;
    const p = (xx, yy) => dem[yy * DW + xx];
    const m = (p(x, y) * (1 - ax) + p(x + 1, y) * ax) * (1 - ay) + (p(x, y + 1) * (1 - ax) + p(x + 1, y + 1) * ax) * ay;
    return (m / 10000) * cfg.exag;
  };
  const toWorld = (u, v, lift = 0) => new THREE.Vector3((u - 0.5) * WKM, heightAt(u, v) + lift, (v - 0.5) * HKM);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(SMALL ? 1.5 : 1.75, window.devicePixelRatio || 1));
  renderer.setClearColor(BG, 1);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, SIZE * 0.005, SIZE * 8);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const pxScale = { value: 1 };
  const common = {
    uTime: { value: tl.t0 }, uP: { value: 0 }, uClock: { value: 0 },
    uSun: { value: new THREE.Vector3(-0.35, 0.8, 0.45).normalize() },
    uBg: { value: new THREE.Color(BG) },
    uFog: { value: new THREE.Vector2(SIZE * 1.0, SIZE * 2.2) },
    uScale: pxScale,
  };
  const ctx = { THREE, scene, cfg, heightAt, toWorld, common, aniso, WKM, HKM, SIZE, loadTex, loadBin, loadJson, disposables, posAt: tl.posAt };
  const layer = await KINDS[cfg.kind](ctx);

  /* --- arazi --- */
  const sx = SMALL ? 200 : 300, sy = Math.round((sx * HKM) / WKM);
  const geo = new THREE.PlaneGeometry(WKM, HKM, sx, sy);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let iy = 0; iy <= sy; iy++) for (let ix = 0; ix <= sx; ix++) pos.setY(iy * (sx + 1) + ix, heightAt(ix / sx, iy / sy));
  geo.computeVertexNormals();
  const terrainMat = new THREE.ShaderMaterial({
    uniforms: { ...common, ...layer.uniforms },
    vertexShader: `
      uniform float uTime, uP, uClock;
      ${layer.vertDecl || ""}
      varying vec2 vUv; varying vec3 vN, vPos; varying float vDist;
      void main() {
        vUv = uv; vN = normal;
        vec3 p = position;
        ${layer.vert || ""}
        vPos = p;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime, uP, uClock; uniform vec3 uSun, uBg; uniform vec2 uFog;
      ${layer.fragDecl || ""}
      varying vec2 vUv; varying vec3 vN, vPos; varying float vDist;
      ${GLSL_COMMON}
      ${layer.fragFns || ""}
      void main() {
        float shade = 0.6 + 0.5 * max(dot(normalize(vN), uSun), 0.0);
        vec3 col;
        ${layer.frag}
        // kenarlarda ve uzakta arka plana karis
        float edge = smoothstep(0.0, 0.035, vUv.x) * smoothstep(0.0, 0.035, 1.0 - vUv.x) * smoothstep(0.0, 0.035, vUv.y) * smoothstep(0.0, 0.035, 1.0 - vUv.y);
        float fog = smoothstep(uFog.x, uFog.y, vDist);
        gl_FragColor = vec4(mix(uBg, col, edge * (1.0 - fog)), 1.0);
      }`,
  });
  // dokular sRGB: ornekleme dogrusal renk verir; cikis OutputPass'te sRGB'ye cevrilir
  scene.add(new THREE.Mesh(geo, terrainMat));
  disposables.push(geo, terrainMat);

  /* --- yer adlari (HTML) --- */
  const labelBox = stage.querySelector(".olay-labels");
  const B = layer.bbox;
  const labels = [...cfg.places.map(([txt, lat, lon]) => ({ txt, lat, lon })), ...(layer.labels || [])].map((l) => {
    const el = document.createElement("span");
    el.className = `olay-label${l.cls ? " " + l.cls : ""}`;
    el.textContent = l.txt;
    labelBox.appendChild(el);
    return { ...l, el, p: toWorld((l.lon - B[0]) / (B[2] - B[0]), (B[3] - l.lat) / (B[3] - B[1]), SIZE * 0.003) };
  });
  const tmp = new THREE.Vector3();
  function placeLabels(w, h) {
    for (const l of labels) {
      tmp.copy(l.p).project(camera);
      const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05 && (l.from === undefined || common.uTime.value >= l.from);
      l.el.style.display = vis ? "" : "none";
      if (vis) l.el.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px)`;
    }
  }

  /* --- kamera ve kontroller --- */
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = SIZE * 0.18;
  controls.maxDistance = SIZE * 1.6;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = 1.28;
  controls.screenSpacePanning = false;
  const tgt = layer.target || [0, 0, 0];
  controls.target.set(tgt[0] * SIZE, SIZE * 0.007, tgt[1] * SIZE);
  const onChange = () => {
    controls.target.x = clamp(controls.target.x, -WKM / 2, WKM / 2);
    controls.target.z = clamp(controls.target.z, -HKM / 2, HKM / 2);
  };
  controls.addEventListener("change", onChange);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.9, 0.45, 0.97);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  stage.prepend(renderer.domElement);

  let cw = 0, ch = 0;
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h || (w === cw && h === ch)) return;
    const firstFit = !cw;
    cw = w; ch = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    pxScale.value = (h * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    if (firstFit) {
      const d = SIZE * (camera.aspect < 1.4 ? 1.16 : 0.95) * (layer.zoom || 1);
      camera.position.set(controls.target.x - d * 0.07, d * 0.62, controls.target.z + d * 0.78);
      controls.update();
    }
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();

  /* --- dongu: yalnizca gorunurken cizer --- */
  let visible = true, raf = 0, dead = false;
  const t0 = performance.now();
  const shakeOff = new THREE.Vector3();
  function frame(now) {
    raf = 0;
    if (dead || !visible || document.hidden) return;
    const clockS = reduce ? 0 : (now - t0) / 1000;
    common.uClock.value = clockS;
    controls.update();
    if (layer.frame) layer.frame(clockS);
    // sarsinti: kamerayi gecici olarak titret, cizimden sonra geri al
    const amp = layer.shake ? layer.shake(controls.target) : 0;
    if (amp > 0 && !reduce) {
      shakeOff.set((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp * 0.6, (Math.random() - 0.5) * amp);
      camera.position.add(shakeOff);
    }
    composer.render();
    if (amp > 0 && !reduce) camera.position.sub(shakeOff);
    placeLabels(cw, ch);
    raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf && !dead) raf = requestAnimationFrame(frame); };
  const vio = new IntersectionObserver((e) => { visible = e[0].isIntersecting; kick(); });
  vio.observe(stage);
  document.addEventListener("visibilitychange", kick);
  kick();

  return {
    times: layer.times || null,
    curve: layer.curve || null,
    setTime(t, p) { common.uTime.value = t; common.uP.value = p; if (layer.setTime) layer.setTime(t, p); kick(); },
    stats: (t) => layer.stats(t),
    destroy() {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect(); vio.disconnect();
      document.removeEventListener("visibilitychange", kick);
      controls.removeEventListener("change", onChange);
      controls.dispose();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      disposables.forEach((d) => d.dispose && d.dispose());
      composer.dispose && composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      labelBox.innerHTML = "";
    },
  };
}

/* ---------------- katmanlar ---------------- */
const KINDS = {
  /* ===== yangin: once/sonra goruntu + yanma zamani + alev/duman ===== */
  async yangin(ctx) {
    const { THREE, scene, common, toWorld, aniso, WKM, HKM, cfg, loadTex, loadJson, disposables } = ctx;
    const [DW, DH] = cfg.dem;
    const [ates, before, after] = await Promise.all([loadJson("ates.json"), loadTex("once.jpg"), loadTex("sonra.jpg")]);
    for (const t of [before, after]) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; }
    const pts = ates.p; // [u, v, saat, frp], saate gore sirali

    // yanma zamani dokusu: her hucre icin en erken isi noktasi tespiti (saat)
    const NONE = 255;
    const burn = new Float32Array(DW * DH).fill(NONE);
    const R = 0.45; // km, VIIRS piksel ~375 m
    const cx = DW / WKM, cy = DH / HKM;
    const rx = Math.ceil(R * cx), ry = Math.ceil(R * cy);
    for (const [u, v, t] of pts) {
      const i0 = Math.round(u * (DW - 1)), j0 = Math.round(v * (DH - 1));
      for (let dj = -ry; dj <= ry; dj++) for (let di = -rx; di <= rx; di++) {
        if ((di / cx) ** 2 + (dj / cy) ** 2 > R * R) continue;
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= DW || j >= DH) continue;
        const k = j * DW + i;
        if (t < burn[k]) burn[k] = t;
      }
    }
    // gecisler arasi (~12 saat) atlamayi yumusat: gecerli komsularla ortala
    for (let pass = 0; pass < 2; pass++) {
      const src = burn.slice();
      for (let j = 1; j < DH - 1; j++) for (let i = 1; i < DW - 1; i++) {
        const k = j * DW + i;
        if (src[k] === NONE) continue;
        let s = 0, n = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const v = src[k + dj * DW + di]; if (v !== NONE) { s += v; n++; } }
        burn[k] = s / n;
      }
    }
    const burnBytes = new Uint8Array(DW * DH);
    for (let j = 0; j < DH; j++) for (let i = 0; i < DW; i++) burnBytes[(DH - 1 - j) * DW + i] = Math.min(255, Math.round(burn[j * DW + i])); // uv: v=0 guneyde
    const burnTex = new THREE.DataTexture(burnBytes, DW, DH, THREE.RedFormat, THREE.UnsignedByteType);
    burnTex.magFilter = burnTex.minFilter = THREE.LinearFilter;
    burnTex.needsUpdate = true;
    disposables.push(burnTex);

    // isi noktalari: VIIRS pikselleri (~375 m) duzenli izgara olusturur; piksel icinde dagit
    const jit = 0.36 / WKM, jitV = 0.36 / HKM;
    const hp = new Float32Array(pts.length * 3), ht = new Float32Array(pts.length), hf = new Float32Array(pts.length), hs = new Float32Array(pts.length);
    pts.forEach(([u, v, t, frp], i) => {
      const w = toWorld(u + (Math.random() - 0.5) * jit, v + (Math.random() - 0.5) * jitV, 0.06);
      hp.set([w.x, w.y, w.z], i * 3);
      ht[i] = t; hf[i] = frp; hs[i] = Math.random();
    });
    const hotGeo = new THREE.BufferGeometry();
    hotGeo.setAttribute("position", new THREE.BufferAttribute(hp, 3));
    hotGeo.setAttribute("aT", new THREE.BufferAttribute(ht, 1));
    hotGeo.setAttribute("aF", new THREE.BufferAttribute(hf, 1));
    hotGeo.setAttribute("aS", new THREE.BufferAttribute(hs, 1));
    scene.add(new THREE.Points(hotGeo, new THREE.ShaderMaterial({
      uniforms: { uTime: common.uTime, uScale: common.uScale },
      vertexShader: `
        attribute float aT, aF; uniform float uTime, uScale; varying float vA;
        void main() {
          float age = uTime - aT;
          vA = smoothstep(-0.4, 0.0, age) * (1.0 - smoothstep(2.0, 11.0, age));
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = vA <= 0.001 ? 0.0 : (0.13 + 0.025 * sqrt(aF)) * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float core = 1.0 - smoothstep(0.0, 0.45, d), halo = 1.0 - smoothstep(0.3, 1.0, d);
          vec3 c = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.92, 0.6), core);
          gl_FragColor = vec4(c * 1.9, (core + halo * 0.35) * vA);
        }`,
      transparent: true, depthWrite: false,
    })));
    // alevler: etkin isi noktalarinda titreyen, yukari uzanan isik lekeleri
    scene.add(new THREE.Points(hotGeo, new THREE.ShaderMaterial({
      uniforms: { uTime: common.uTime, uClock: common.uClock, uScale: common.uScale },
      vertexShader: `
        attribute float aT, aF, aS; uniform float uTime, uClock, uScale; varying float vA, vS;
        void main() {
          float age = uTime - aT;
          float flick = 0.75 + 0.25 * sin(uClock * (7.0 + aS * 5.0) + aS * 40.0);
          vA = smoothstep(-0.3, 0.2, age) * (1.0 - smoothstep(3.0, 9.0, age)) * flick;
          vS = aS;
          vec4 mv = modelViewMatrix * vec4(position + vec3(0.0, 0.2, 0.0), 1.0);
          gl_PointSize = vA <= 0.001 ? 0.0 : (0.32 + 0.045 * sqrt(aF)) * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uClock; varying float vA, vS;
        void main() {
          vec2 q = gl_PointCoord - 0.5;
          float up = 0.5 - q.y; // 0: taban, 1: tepe
          // tabanda genis, yukari sivrilen ve salinan alev bicimi
          float w = 0.3 * pow(1.0 - up, 0.8) + 0.015;
          float sway = 0.07 * up * sin(uClock * 8.0 + vS * 30.0 + up * 6.0);
          float body = (1.0 - smoothstep(w * 0.35, w, abs(q.x + sway))) * smoothstep(0.0, 0.15, up) * (1.0 - smoothstep(0.7, 1.0, up));
          vec3 c = mix(vec3(1.0, 0.2, 0.01), vec3(1.0, 0.62, 0.2), body * body);
          gl_FragColor = vec4(c * body * vA * 0.5, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })));
    // duman: etkin isi noktalarindan yukselen, tabani alevle aydinlanan lekeler
    const SMOKE = SMALL ? 450 : 900;
    const sp = new Float32Array(SMOKE * 3), st = new Float32Array(SMOKE), ss = new Float32Array(SMOKE);
    for (let i = 0; i < SMOKE; i++) {
      const p = pts[Math.floor(Math.random() * pts.length)];
      const w = toWorld(p[0], p[1], 0.05);
      sp.set([w.x, w.y, w.z], i * 3);
      st[i] = p[2]; ss[i] = Math.random();
    }
    const smokeGeo = new THREE.BufferGeometry();
    smokeGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    smokeGeo.setAttribute("aT", new THREE.BufferAttribute(st, 1));
    smokeGeo.setAttribute("aS", new THREE.BufferAttribute(ss, 1));
    scene.add(new THREE.Points(smokeGeo, new THREE.ShaderMaterial({
      uniforms: { uTime: common.uTime, uClock: common.uClock, uScale: common.uScale },
      vertexShader: `
        attribute float aT, aS; uniform float uTime, uClock, uScale; varying float vA, vLit;
        void main() {
          float act = smoothstep(-0.5, 1.0, uTime - aT) * (1.0 - smoothstep(6.0, 13.0, uTime - aT));
          float ph = fract(uClock * 0.05 + aS);
          vec3 p = position + vec3(ph * 1.6 * (aS - 0.3), ph * 4.2, -ph * 0.9 * aS);
          vA = act * smoothstep(0.0, 0.12, ph) * (1.0 - ph) * 0.55;
          vLit = 1.0 - smoothstep(0.0, 0.3, ph);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = act <= 0.001 ? 0.0 : (0.8 + ph * 3.6) * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA, vLit;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = (1.0 - smoothstep(0.1, 1.0, d)) * vA;
          gl_FragColor = vec4(mix(vec3(0.28, 0.26, 0.25), vec3(1.0, 0.42, 0.12), vLit * 0.8), a);
        }`,
      transparent: true, depthWrite: false,
    })));

    const countUpTo = (h) => { let lo = 0, hi = pts.length; while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m][2] <= h) lo = m + 1; else hi = m; } return lo; };
    return {
      bbox: ates.bbox, target: [0.03, -0.02],
      times: pts.map((p) => p[2]),
      stats: (h) => `Isı noktası: ${nf.format(countUpTo(h))}`,
      uniforms: { uBefore: { value: before }, uAfter: { value: after }, uBurn: { value: burnTex } },
      fragDecl: "uniform sampler2D uBefore, uAfter, uBurn;",
      frag: `
        vec3 b = texture2D(uBefore, vUv).rgb;
        vec3 a = texture2D(uAfter, vUv).rgb;
        float bt = texture2D(uBurn, vUv).r * 255.0;
        float zone = 1.0 - step(250.0, bt);
        // yangindan sonra gercekten koyulasan (yanan) piksel
        float scorch = clamp((lum(b) - lum(a)) * 9.0, 0.0, 1.0) * zone;
        float burnt = zone * smoothstep(bt - 2.0, bt + 8.0, uTime);
        col = min(mix(b, a, burnt) * shade, vec3(0.9)); // parlama yalnizca atese (1'in ustu) uygulanir
        float age = uTime - bt;
        // uydu gunde iki kez gecer (~12 saat arayla); cephe bir sonraki gecise kadar gorunur kalir.
        // alev: tespitten sonraki ilk saatler parlak; kor: sonraki gecise kadar sonuk kirmizi
        float flame = zone * smoothstep(-1.5, 0.5, age) * (1.0 - smoothstep(3.0, 7.0, age));
        float ember = zone * smoothstep(2.0, 5.0, age) * (1.0 - smoothstep(9.0, 16.0, age));
        float n = noise(vUv * 900.0 + vec2(uClock * 0.9, -uClock * 0.7)) * 0.6 + noise(vUv * 260.0 - uClock * 0.4) * 0.4;
        vec3 fire = mix(vec3(1.0, 0.18, 0.01), vec3(1.0, 0.55, 0.1), n);
        float heat = max(flame, ember * 0.5);
        col = mix(col, col * 0.3, heat * (0.4 + 0.6 * scorch));
        col += fire * flame * (0.4 + 2.0 * scorch) * (0.45 + 0.9 * n);
        col += vec3(0.8, 0.08, 0.0) * ember * (0.1 + 0.7 * scorch) * (0.5 + 0.7 * n);`,
    };
  },

  /* ===== deprem: fay kirilmasi, P/S dalgalari, artcilar ===== */
  async deprem(ctx) {
    const { THREE, scene, common, toWorld, aniso, WKM, HKM, SIZE, loadTex, loadJson } = ctx;
    const [d, img] = await Promise.all([loadJson("olay.json"), loadTex("uydu.jpg")]);
    img.colorSpace = THREE.SRGBColorSpace; img.anisotropy = aniso;
    const X = (u) => (u - 0.5) * WKM, Z = (v) => (v - 0.5) * HKM;

    // dalga kaynaklari: M6+ depremler (en fazla 8); w: genlik
    const big = d.ev.filter((e) => e[3] >= 6).slice(0, 8);
    const src = big.map((e) => new THREE.Vector4(X(e[1]), Z(e[2]), e[0], clamp((e[3] - 5.5) / 2.3, 0.2, 1)));
    while (src.length < 8) src.push(new THREE.Vector4(0, 0, -1e9, 0));
    const waveFns = `
      uniform vec4 uSrc[8];
      // S dalgasi ~3,5 km/sn (guclu halka), P dalgasi ~6,2 km/sn (zayif halka)
      float quake(vec2 xz, out float shaken) {
        float w = 0.0; shaken = 0.0;
        for (int i = 0; i < 8; i++) {
          vec4 s = uSrc[i];
          float dt = uTime - s.z;
          if (dt < 0.0 || dt > 240.0) continue;
          float d = length(xz - s.xy);
          float rs = 3.5 * dt, rp = 6.2 * dt;
          float fade = s.w * exp(-d / 260.0) * (1.0 - smoothstep(150.0, 240.0, dt)) * smoothstep(4.0, 30.0, rs);
          w += fade * (exp(-pow((d - rs) / 7.0, 2.0)) + 0.35 * exp(-pow((d - rp) / 4.0, 2.0)));
          shaken += fade * (1.0 - smoothstep(rs - 4.0, rs + 2.0, d)) * exp(-max(rs - d, 0.0) / 35.0);
        }
        return w;
      }`;

    // fay hatlari: arazi uzerinde serit; kirilanlar kirilma aninda parlar
    const fPos = [], fR = [], fIdx = [];
    const half = SIZE * 0.0022;
    for (const f of d.faults) {
      const pts = f.p.map(([u, v]) => toWorld(u, v, SIZE * 0.0012));
      const base = fPos.length / 3;
      pts.forEach((p, i) => {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
        const nx = (-dz / len) * half * (f.r ? 1 : 0.55), nz = (dx / len) * half * (f.r ? 1 : 0.55);
        fPos.push(p.x + nx, p.y, p.z + nz, p.x - nx, p.y, p.z - nz);
        const r = f.r ? f.r[i] : -1;
        fR.push(r, r);
        if (i > 0) { const k = base + (i - 1) * 2; fIdx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      });
    }
    const fGeo = new THREE.BufferGeometry();
    fGeo.setAttribute("position", new THREE.Float32BufferAttribute(fPos, 3));
    fGeo.setAttribute("aR", new THREE.Float32BufferAttribute(fR, 1));
    fGeo.setIndex(fIdx);
    scene.add(new THREE.Mesh(fGeo, new THREE.ShaderMaterial({
      uniforms: { uTime: common.uTime },
      vertexShader: `attribute float aR; varying float vR; void main() { vR = aR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uTime; varying float vR;
        void main() {
          if (vR < 0.0) { gl_FragColor = vec4(0.95, 0.75, 0.3, 0.45); return; }
          float dt = uTime - vR;
          float on = step(0.0, dt);
          float flash = on * exp(-max(dt, 0.0) / 10.0);
          vec3 c = mix(vec3(0.45, 0.06, 0.04), vec3(1.25, 0.06, 0.03), on) + vec3(1.4, 0.9, 0.5) * flash;
          gl_FragColor = vec4(c, mix(0.55, 0.95, on));
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2,
    })));

    // depremler: zaman sirasiyla belirir; belirirken kisa bir "patlama"
    const n = d.ev.length;
    const ep = new Float32Array(n * 3), et = new Float32Array(n), em = new Float32Array(n), eP = new Float32Array(n);
    d.ev.forEach(([t, u, v, m], i) => {
      const w = toWorld(u, v, SIZE * 0.002);
      ep.set([w.x, w.y, w.z], i * 3);
      et[i] = t; em[i] = m; eP[i] = ctx.posAt(t);
    });
    const eGeo = new THREE.BufferGeometry();
    eGeo.setAttribute("position", new THREE.BufferAttribute(ep, 3));
    eGeo.setAttribute("aT", new THREE.BufferAttribute(et, 1));
    eGeo.setAttribute("aM", new THREE.BufferAttribute(em, 1));
    eGeo.setAttribute("aPos", new THREE.BufferAttribute(eP, 1));
    scene.add(new THREE.Points(eGeo, new THREE.ShaderMaterial({
      uniforms: { uTime: common.uTime, uP: common.uP, uScale: common.uScale, uK: { value: SIZE * 0.0042 } },
      vertexShader: `
        attribute float aT, aM, aPos; uniform float uTime, uP, uScale, uK; varying float vA, vPop, vM;
        void main() {
          float on = step(aT, uTime);
          vPop = on * (1.0 - smoothstep(0.0, 0.02, uP - aPos));
          vA = on; vM = aM;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float s = uK * (1.0 + pow(max(aM - 2.8, 0.0), 1.6) * 0.9) * (1.0 + 1.6 * vPop);
          gl_PointSize = on < 0.5 ? 0.0 : s * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA, vPop, vM;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          vec3 c = vM < 4.0 ? vec3(1.0, 0.82, 0.35) : vM < 5.0 ? vec3(1.0, 0.58, 0.15) : vM < 6.0 ? vec3(1.0, 0.3, 0.15) : vec3(1.0, 0.12, 0.3);
          float core = 1.0 - smoothstep(0.3, 0.45, d);
          float edge = smoothstep(0.22, 0.32, d) * core; // koyu kenar: ust uste binince de secilsin
          float ring = (1.0 - smoothstep(0.0, 0.08, abs(d - 0.8))) * vPop;
          float a = max(core * 0.9, ring);
          if (a < 0.01) discard;
          gl_FragColor = vec4(mix(c, c * 0.35, edge) * (0.85 + vPop * 1.4), a * vA);
        }`,
      transparent: true, depthWrite: false,
    })));

    // ana depremler: buyuk, nabiz gibi atan halka
    const mp = new Float32Array(d.mains.length * 3), mt = new Float32Array(d.mains.length);
    d.mains.forEach(([t, u, v], i) => { const w = toWorld(u, v, SIZE * 0.003); mp.set([w.x, w.y, w.z], i * 3); mt[i] = t; });
    const mGeo = new THREE.BufferGeometry();
    mGeo.setAttribute("position", new THREE.BufferAttribute(mp, 3));
    mGeo.setAttribute("aT", new THREE.BufferAttribute(mt, 1));
    scene.add(new THREE.Points(mGeo, new THREE.ShaderMaterial({
      uniforms: { uTime: common.uTime, uClock: common.uClock, uScale: common.uScale, uK: { value: SIZE * 0.022 } },
      vertexShader: `
        attribute float aT; uniform float uTime, uScale, uK; varying float vOn;
        void main() {
          vOn = step(aT, uTime);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = vOn < 0.5 ? 0.0 : uK * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uClock; varying float vOn;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float ph = fract(uClock * 0.6);
          float ring = (1.0 - smoothstep(0.0, 0.06, abs(d - ph))) * (1.0 - ph);
          float star = 1.0 - smoothstep(0.08, 0.16, d);
          float a = max(ring * 0.9, star);
          if (a < 0.01) discard;
          gl_FragColor = vec4(mix(vec3(1.0, 0.2, 0.3), vec3(1.0, 0.95, 0.9), star), a * vOn);
        }`,
      transparent: true, depthWrite: false,
    })));

    const B = d.bbox;
    const lonlat = (u, v) => [B[3] - v * (B[3] - B[1]), B[0] + u * (B[2] - B[0])];
    const target = new THREE.Vector2();
    return {
      bbox: B, target: [0.0, -0.03], zoom: 0.92,
      times: d.ev.map((e) => e[0]),
      labels: d.mains.map(([t, u, v, m, ad]) => { const [lat, lon] = lonlat(u, v); return { txt: `${ad} · ${String(m).replace(".", ",")}`, lat, lon, from: t, cls: "olay-label-strong" }; }),
      stats(t) {
        let c = 0, mx = 0;
        for (const e of d.ev) { if (e[0] > t) break; c++; if (e[3] < 7.4) mx = Math.max(mx, e[3]); }
        return `Kaydedilen deprem (M3+): ${nf.format(c)}${mx ? ` · en büyük artçı M${mx.toFixed(1).replace(".", ",")}` : ""}`;
      },
      // kamera, S dalgasi bakilan noktadan gecerken titrer
      shake(tgt) {
        target.set(tgt.x, tgt.z);
        let a = 0;
        for (const s of src) {
          const dt = common.uTime.value - s.z;
          if (dt < 0 || dt > 240) continue;
          const dist = target.distanceTo(new THREE.Vector2(s.x, s.y));
          a += s.w * Math.exp(-(((dist - 3.5 * dt) / 18) ** 2)) * Math.exp(-dist / 300);
        }
        return a * SIZE * 0.006;
      },
      uniforms: { uImg: { value: img }, uSrc: { value: src } },
      vertDecl: waveFns,
      // sarsinti dalgasi araziyi gecici olarak kabartir (gorsellestirme icin abartili)
      vert: `float sh; p.y += quake(p.xz, sh) * ${(SIZE * 0.012).toFixed(3)};`,
      fragDecl: "uniform sampler2D uImg;",
      fragFns: waveFns,
      frag: `
        float shaken;
        float w = quake(vPos.xz, shaken);
        vec3 im = texture2D(uImg, vUv).rgb;
        im = mix(im, vec3(lum(im)), 0.35) * 0.9;
        col = min(im * shade, vec3(0.9));
        col = mix(col, col * vec3(1.1, 0.8, 0.75), clamp(shaken, 0.0, 0.3));
        col += vec3(1.0, 0.45, 0.16) * min(w, 0.8) * 1.5;`,
    };
  },

  /* ===== sel: yagis, yukselen su, sonrasi ===== */
  async sel(ctx) {
    const { THREE, scene, common, aniso, WKM, HKM, SIZE, cfg, loadTex, loadBin, disposables } = ctx;
    const [DW, DH] = cfg.dem;
    const [selBuf, before, after] = await Promise.all([loadBin("sel.bin"), loadTex("once.jpg"), loadTex("sonra.jpg")]);
    for (const t of [before, after]) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; }
    const sel = new Uint8Array(selBuf);
    const flip = new Uint8Array(DW * DH);
    for (let j = 0; j < DH; j++) flip.set(sel.subarray(j * DW, (j + 1) * DW), (DH - 1 - j) * DW); // uv: v=0 guneyde
    const selTex = new THREE.DataTexture(flip, DW, DH, THREE.RedFormat, THREE.UnsignedByteType);
    selTex.magFilter = selTex.minFilter = THREE.LinearFilter;
    selTex.needsUpdate = true;
    disposables.push(selTex);
    const cellKm2 = (WKM / DW) * (HKM / DH);
    const hands = Array.from(sel).filter((v) => v < 255).map((v) => v / 10).sort((a, b) => a - b);

    // zaman (0..100): yagis, su derinligi (m, dereden yukseklik esigi), sonrasi
    const storm = (t) => smooth(2, 10, t) * (1 - smooth(60, 74, t));
    const depth = (t) => 0.8 + 9.4 * smooth(20, 62, t) - 8.6 * smooth(68, 80, t);
    const afterMix = (t) => smooth(76, 84, t);
    const U = { uBefore: { value: before }, uAfter: { value: after }, uSel: { value: selTex }, uDepth: { value: 0 }, uStorm: { value: 0 }, uAfterMix: { value: 0 }, uFlash: { value: 0 }, uCloud: { value: 0 } };
    // bulutlar taskin basladiginda dagilir ki su gorunsun
    const cloud = (t) => storm(t) * (1 - smooth(26, 42, t));

    // alcak firtina bulutlari
    const CL = SMALL ? 70 : 120;
    const cp = new Float32Array(CL * 3), cs = new Float32Array(CL);
    for (let i = 0; i < CL; i++) { cp.set([(Math.random() - 0.5) * WKM * 1.2, SIZE * (0.12 + Math.random() * 0.06), (Math.random() - 0.5) * HKM * 1.2], i * 3); cs[i] = Math.random(); }
    const cGeo = new THREE.BufferGeometry();
    cGeo.setAttribute("position", new THREE.BufferAttribute(cp, 3));
    cGeo.setAttribute("aS", new THREE.BufferAttribute(cs, 1));
    scene.add(new THREE.Points(cGeo, new THREE.ShaderMaterial({
      uniforms: { uCloud: U.uCloud, uFlash: U.uFlash, uClock: common.uClock, uScale: common.uScale, uK: { value: SIZE * 0.2 }, uW: { value: WKM } },
      vertexShader: `
        attribute float aS; uniform float uCloud, uClock, uScale, uK, uW; varying float vA;
        void main() {
          vec3 p = position; p.x = mod(p.x + uClock * 0.12 * (0.6 + aS) + uW * 0.6, uW * 1.2) - uW * 0.6;
          vA = uCloud * (0.1 + 0.12 * aS);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = vA < 0.01 ? 0.0 : uK * (0.6 + aS) * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uFlash; varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = (1.0 - smoothstep(0.0, 1.0, d)) * vA;
          gl_FragColor = vec4(vec3(0.2, 0.22, 0.25) + vec3(0.7, 0.75, 0.85) * uFlash, a);
        }`,
      transparent: true, depthWrite: false,
    })));

    // yagmur: kameraya bagli tam ekran katman (egik cizgiler)
    const rain = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { uStorm: U.uStorm, uClock: common.uClock },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        uniform float uStorm, uClock; varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float layer(vec2 uv, float sc, float sp) {
          uv.x += uv.y * 0.18;
          vec2 g = vec2(uv.x * sc, uv.y * sc * 0.12 + uClock * sp);
          vec2 id = floor(g), f = fract(g);
          float h = hash(id);
          float x = abs(f.x - (0.2 + 0.6 * hash(id + 7.0)));
          return step(0.55, h) * (1.0 - smoothstep(0.0, 0.035, x)) * smoothstep(0.0, 0.5, f.y) * (1.0 - smoothstep(0.5, 1.0, f.y));
        }
        void main() {
          float r = layer(vUv, 90.0, 2.4) * 0.5 + layer(vUv + 0.31, 160.0, 3.4) * 0.35 + layer(vUv + 0.67, 260.0, 4.4) * 0.25;
          gl_FragColor = vec4(vec3(0.75, 0.8, 0.88), r * uStorm * 0.55 + uStorm * 0.08);
        }`,
      transparent: true, depthWrite: false, depthTest: false,
    }));
    rain.frustumCulled = false;
    rain.renderOrder = 10;
    scene.add(rain);

    let flash = 0, nextFlash = 3;
    return {
      bbox: cfg.bbox, target: [0.08, -0.1], zoom: 0.78,
      curve: (t) => Math.max(0, depth(t) - 0.8) + storm(t) * 2,
      stats(t) {
        const dd = depth(t);
        let lo = 0, hi = hands.length; while (lo < hi) { const m = (lo + hi) >> 1; if (hands[m] <= dd) lo = m + 1; else hi = m; }
        return t >= 76 ? "Selin bıraktığı iz: Ezine Çayı vadisi" : `Su altındaki alan (yaklaşık): ${(lo * cellKm2).toFixed(1).replace(".", ",")} km²`;
      },
      setTime(t) { U.uDepth.value = depth(t); U.uStorm.value = storm(t); U.uAfterMix.value = afterMix(t); U.uCloud.value = cloud(t); },
      frame(clockS) {
        // simsek: firtina sirasinda arada bir kisa parlama
        if (U.uStorm.value > 0.5 && clockS > nextFlash) { flash = 1; nextFlash = clockS + 2.5 + Math.random() * 5; }
        flash *= 0.86;
        U.uFlash.value = reduce ? 0 : flash * U.uStorm.value;
        common.uBg.value.setHex(BG).lerp(new THREE.Color(0x5b6573), U.uFlash.value * 0.5);
      },
      uniforms: U,
      fragDecl: "uniform sampler2D uBefore, uAfter, uSel; uniform float uDepth, uStorm, uAfterMix, uFlash;",
      frag: `
        vec3 b = texture2D(uBefore, vUv).rgb, a = texture2D(uAfter, vUv).rgb;
        col = min(mix(b, a, uAfterMix) * shade, vec3(0.9));
        // firtina: karanlik, maviye calan isik; simsekte aydinlanir
        col *= mix(vec3(1.0), vec3(0.58, 0.62, 0.7), uStorm);
        col += col * uFlash * 1.6;
        float hv = texture2D(uSel, vUv).r * 255.0;
        float zone = 1.0 - step(254.0, hv);
        float h = hv * 0.1;
        float wet = zone * smoothstep(h - 0.4, h + 0.3, uDepth) * (1.0 - uAfterMix * 0.85);
        // akan camurlu su: kuzeye (denize) dogru akan dalgacik dokusu
        float f1 = noise(vec2(vUv.x * 1800.0, vUv.y * 700.0 - uClock * 9.0));
        float f2 = noise(vec2(vUv.x * 3200.0 + 3.0, vUv.y * 1300.0 - uClock * 15.0));
        float fl = f1 * 0.6 + f2 * 0.4;
        vec3 water = mix(vec3(0.24, 0.17, 0.1), vec3(0.5, 0.39, 0.26), fl);
        water += vec3(0.5, 0.45, 0.4) * pow(fl, 6.0) * 0.8;
        water *= mix(1.0, 0.7, uStorm);
        float foam = zone * (1.0 - smoothstep(0.0, 0.6, abs(uDepth - h))) * step(1.5, uDepth) * (1.0 - uAfterMix);
        col = mix(col, water * (0.85 + 0.25 * shade), wet * 0.95) + vec3(0.55, 0.5, 0.42) * foam * 0.35;`,
    };
  },
};

/* ---------------- baslatma ve sekmeler ---------------- */
function boot(host) { host._olay = mount(host); }
document.querySelectorAll("[data-olay]").forEach(boot);
document.querySelectorAll("[data-olay-tab]").forEach((b) => b.addEventListener("click", () => {
  const host = document.getElementById(b.dataset.target);
  if (!host || host.dataset.olay === b.dataset.olayTab) return;
  if (host._olay) host._olay.destroy();
  host.dataset.olay = b.dataset.olayTab;
  boot(host);
  document.querySelectorAll(`[data-olay-tab][data-target="${b.dataset.target}"]`).forEach((x) => {
    x.classList.toggle("on", x === b);
    x.setAttribute("aria-selected", String(x === b));
  });
}));
