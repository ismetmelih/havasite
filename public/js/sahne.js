// Temsili afet canlandirmalari (deprem, sel, orman yangini): duz cizimli SVG sahne + istege bagli ses.
// Belirli bir olayi degil, o tur bir afette genel olarak neler oldugunu ve nasil korunulacagini anlatir.
// Sesler dosya kullanmadan Web Audio ile uretilir (telif yok); ses kapali baslar.
// Kullanim: <div class="sahne" data-sahne="deprem|sel|yangin"></div>  ->  window.Sahne.mount(el, tur)
(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const W = 800, H = 360, GROUND = 290;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeIn = (x) => x * x * x;
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  // tekrarlanabilir rastgelelik (her oynatista ayni sahne)
  function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  /* ---------------- ses (Web Audio, dosyasiz) ---------------- */
  let actx = null, noiseBuf = null, crackleBuf = null;
  const live = new Set();
  function audio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
      const len = actx.sampleRate * 2;
      noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5 * 0.5 + w * 0.5; }
      crackleBuf = actx.createBuffer(1, len, actx.sampleRate);
      const c = crackleBuf.getChannelData(0);
      for (let i = 0; i < len; i++) c[i] = Math.random() < 0.0009 ? (Math.random() * 2 - 1) : c[i - 1] * 0.86 || 0;
    }
    if (actx.state === "suspended") actx.resume();
    return actx;
  }
  // gurultu katmani: filtre + zarf [[saniye, kazanc], ...]
  function layer(buf, filter, env, dur) {
    const a = audio();
    if (!a) return;
    const src = a.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = a.createBiquadFilter();
    f.type = filter.type; f.frequency.value = filter.freq; f.Q.value = filter.q || 0.7;
    const g = a.createGain();
    const t0 = a.currentTime;
    g.gain.setValueAtTime(0, t0);
    env.forEach(([s, v]) => g.gain.linearRampToValueAtTime(v, t0 + s));
    src.connect(f); f.connect(g); g.connect(a.destination);
    src.start(t0); src.stop(t0 + dur);
    live.add(src);
    src.onended = () => live.delete(src);
  }
  function stopSound() { live.forEach((s) => { try { s.stop(); } catch {} }); live.clear(); }

  const SOUND = {
    deprem: (D) => {
      layer(noiseBuf, { type: "lowpass", freq: 90 }, [[1.1, 0], [1.7, 0.95], [4.6, 0.85], [6.6, 0]], D);
      // iki zayif binanin cokme gurultusu
      layer(noiseBuf, { type: "lowpass", freq: 260 }, [[3.35, 0], [3.45, 0.9], [4.2, 0]], D);
      layer(noiseBuf, { type: "lowpass", freq: 230 }, [[3.8, 0], [3.9, 0.8], [4.7, 0]], D);
    },
    sel: (D) => {
      layer(noiseBuf, { type: "bandpass", freq: 3200, q: 0.4 }, [[0.2, 0.05], [1.5, 0.22], [3, 0.3], [8.5, 0.25], [D, 0]], D);
      layer(noiseBuf, { type: "lowpass", freq: 520 }, [[2, 0], [4.5, 0.55], [7, 0.6], [D, 0]], D);
    },
    yangin: (D) => {
      layer(crackleBuf, { type: "highpass", freq: 1400 }, [[0.8, 0], [2, 0.6], [6.5, 0.9], [8.5, 0.4], [D, 0]], D);
      layer(noiseBuf, { type: "bandpass", freq: 420, q: 0.6 }, [[0, 0.08], [3, 0.2], [7, 0.25], [D, 0]], D);
    },
  };

  /* ---------------- ortak cizim yardimcilari ---------------- */
  function house(g, x, base, w, h, color, roof) {
    const grp = el("g", {}, g);
    el("rect", { x, y: base - h, width: w, height: h, fill: color, rx: 2 }, grp);
    el("polygon", { points: `${x - 6},${base - h} ${x + w / 2},${base - h - h * 0.55} ${x + w + 6},${base - h}`, fill: roof }, grp);
    el("rect", { x: x + w * 0.38, y: base - h * 0.45, width: w * 0.24, height: h * 0.45, fill: "#0b1018" }, grp);
    el("rect", { x: x + w * 0.1, y: base - h * 0.8, width: w * 0.2, height: h * 0.2, fill: "#f6d77a", opacity: 0.55 }, grp);
    el("rect", { x: x + w * 0.7, y: base - h * 0.8, width: w * 0.2, height: h * 0.2, fill: "#f6d77a", opacity: 0.55 }, grp);
    return grp;
  }
  function pine(g, x, base, s) {
    const grp = el("g", { transform: `translate(${x},${base})` }, g);
    const trunk = el("rect", { x: -2.5 * s, y: -10 * s, width: 5 * s, height: 10 * s, fill: "#5b4636" }, grp);
    const crown = el("polygon", { points: `${-14 * s},${-8 * s} 0,${-46 * s} ${14 * s},${-8 * s}`, fill: "#2f6b4f" }, grp);
    return { grp, trunk, crown, x, base, s };
  }
  function caption(sc, t) {
    let txt = sc.captions[0][1];
    for (const [s, c] of sc.captions) if (t >= s) txt = c;
    return txt;
  }

  /* ---------------- DEPREM ---------------- */
  function sceneDeprem(svg) {
    const r = rng(7);
    el("rect", { x: 0, y: 0, width: W, height: H, fill: "#0f1620" }, svg);
    for (let i = 0; i < 40; i++) el("circle", { cx: r() * W, cy: r() * 150, r: r() * 1.2 + 0.3, fill: "#c9d6e8", opacity: 0.35 }, svg);
    const world = el("g", {}, svg);
    el("rect", { x: -40, y: GROUND, width: W + 80, height: H - GROUND + 40, fill: "#1b2028" }, world);
    el("line", { x1: -40, y1: GROUND, x2: W + 40, y2: GROUND, stroke: "#2c333e", "stroke-width": 2 }, world);
    for (let i = 0; i < 3; i++) el("line", { x1: -40, y1: GROUND + 18 + i * 16, x2: W + 40, y2: GROUND + 18 + i * 16, stroke: "#232934", "stroke-width": 1 }, world);
    // dalgalar yerin altindan (yer cizgisinin ustunu gostermeyecek kirpma)
    const clip = el("clipPath", { id: "sh-under" }, svg);
    el("rect", { x: 0, y: GROUND, width: W, height: H - GROUND }, clip);
    const wavesG = el("g", { "clip-path": "url(#sh-under)" }, world);
    const EPI = [400, 352];
    const waves = [0, 1, 2].map(() => el("circle", { cx: EPI[0], cy: EPI[1], r: 0, fill: "none", stroke: "#f5a524", "stroke-width": 2, opacity: 0 }, wavesG));
    const epi = el("circle", { cx: EPI[0], cy: EPI[1], r: 4, fill: "#f5a524", opacity: 0 }, world);

    const FH = 24;
    const defs = [
      { x: 70, w: 108, n: 6, strong: true },
      { x: 205, w: 88, n: 5, strong: false, fall: 3.35 },
      { x: 322, w: 120, n: 7, strong: true },
      { x: 470, w: 92, n: 4, strong: false, fall: 3.8 },
      { x: 592, w: 112, n: 5, strong: true },
      { x: 722, w: 66, n: 3, strong: true },
    ];
    const bldgs = defs.map((d, bi) => {
      const g = el("g", {}, world);
      const floors = [];
      for (let k = 0; k < d.n; k++) {
        const fg = el("g", {}, g);
        el("rect", { x: 0, y: 0, width: d.w, height: FH, fill: d.strong ? "#3a4656" : "#4a4440", stroke: "#0f1620", "stroke-width": 1 }, fg);
        const wins = Math.max(2, Math.floor(d.w / 24));
        for (let i = 0; i < wins; i++) el("rect", { x: 8 + i * ((d.w - 16) / wins), y: 6, width: (d.w - 16) / wins - 7, height: 11, fill: r() < 0.55 ? "#f6d77a" : "#1c2430", opacity: 0.8 }, fg);
        if (d.strong) { el("rect", { x: 0, y: 0, width: 4, height: FH, fill: "#56677d" }, fg); el("rect", { x: d.w - 4, y: 0, width: 4, height: FH, fill: "#56677d" }, fg); }
        floors.push({ g: fg, k, rot: (r() - 0.5) * 10, dx: (r() - 0.5) * 18 });
      }
      let crack = null;
      if (!d.strong) {
        const top = GROUND - d.n * FH;
        let p = `M ${d.x + d.w * 0.3} ${top + 6}`;
        for (let i = 1; i <= 6; i++) p += ` L ${d.x + d.w * (0.3 + (i % 2 ? 0.18 : -0.05))} ${top + 6 + (i * d.n * FH * 0.85) / 6}`;
        crack = el("path", { d: p, fill: "none", stroke: "#0b0d11", "stroke-width": 2.5, "stroke-dasharray": 400, "stroke-dashoffset": 400 }, world);
      }
      const label = el("text", { x: d.x + d.w / 2, y: GROUND - d.n * FH - 14, "text-anchor": "middle", "font-size": 13, "font-weight": 700, fill: d.strong ? "#34d399" : "#f87171", opacity: 0 }, world);
      label.textContent = d.strong ? "Dayanıklı yapı" : "Zayıf yapı";
      return { ...d, g, floors, crack, label, bi };
    });
    // toz ve moloz
    const dust = [], debris = [];
    bldgs.filter((b) => !b.strong).forEach((b) => {
      for (let i = 0; i < 14; i++) dust.push({ b, el: el("circle", { cx: b.x + r() * b.w, cy: GROUND - 6, r: 4, fill: "#8c8478", opacity: 0 }, world), vx: (r() - 0.5) * 50, vy: -10 - r() * 30, r0: 6 + r() * 10 });
      for (let i = 0; i < 10; i++) debris.push({ b, el: el("rect", { x: 0, y: 0, width: 4 + r() * 6, height: 3 + r() * 4, fill: "#5d5650", opacity: 0 }, world), vx: (r() - 0.5) * 160, vy: -60 - r() * 90 });
    });

    return {
      dur: 9.5,
      captions: [
        [0, "Sıradan bir gün. Dışarıdan bakınca binaların çoğu birbirine benzer."],
        [1.2, "Yerin kilometrelerce altında fay kırılır; sarsıntı dalgaları yüzeye ulaşır."],
        [3.3, "Kurallara uygun yapılmamış binalar ağır hasar görebilir ya da çökebilir."],
        [6.2, "Depreme dayanıklı yapılmış binalar ayakta kalabilir. Deprem anında: Çök, kapan, tutun."],
      ],
      draw(t) {
        // sarsinti genligi
        const A = prog(t, 1.2, 1.9) * (1 - prog(t, 4.6, 6.6));
        const dx = A * Math.sin(t * 2 * Math.PI * 7) * 7, dy = A * Math.sin(t * 2 * Math.PI * 11) * 2.5;
        world.setAttribute("transform", `translate(${dx.toFixed(2)},${dy.toFixed(2)})`);
        epi.setAttribute("opacity", t > 1.0 && t < 6.5 ? 0.9 : 0);
        waves.forEach((w, i) => {
          const k = ((t - 1.0 - i * 0.45) % 1.6) / 1.6;
          const on = t > 1.0 + i * 0.45 && t < 5.5;
          w.setAttribute("r", on ? (k * 420).toFixed(1) : 0);
          w.setAttribute("opacity", on ? (0.8 * (1 - k)).toFixed(2) : 0);
        });
        bldgs.forEach((b) => {
          const sway = A * Math.sin(t * 2 * Math.PI * (b.strong ? 2.2 : 2.6) + b.bi) * (b.strong ? 2.2 : 4.5);
          b.floors.forEach((f) => {
            const baseTop = GROUND - (f.k + 1) * FH;
            let top = baseTop, sy = 1, rot = 0, x = b.x + sway * (f.k + 1) * 0.35, ox = 0;
            if (!b.strong) {
              const p = easeIn(prog(t, b.fall + (b.n - f.k) * 0.05, b.fall + 0.75 + (b.n - f.k) * 0.05));
              const pileTop = GROUND - (f.k + 1) * 8;
              top = lerp(baseTop, pileTop, p); sy = lerp(1, 8 / FH, p); rot = f.rot * p; ox = f.dx * p;
            }
            f.g.setAttribute("transform", `translate(${(x + ox).toFixed(1)},${top.toFixed(1)}) rotate(${rot.toFixed(1)} ${b.w / 2} 0) scale(1,${sy.toFixed(3)})`);
          });
          if (b.crack) b.crack.setAttribute("stroke-dashoffset", (400 * (1 - prog(t, 2.2, 3.2))).toFixed(0));
          if (b.crack) b.crack.setAttribute("opacity", t > b.fall + 0.2 ? 0 : 1);
          b.label.setAttribute("opacity", prog(t, 6.2, 6.8).toFixed(2));
          if (!b.strong) b.label.setAttribute("y", GROUND - b.n * 8 - 16);
        });
        dust.forEach((d) => {
          const k = prog(t, d.b.fall + 0.3, d.b.fall + 3.4);
          d.el.setAttribute("opacity", k > 0 && k < 1 ? (0.55 * (1 - k)).toFixed(2) : 0);
          d.el.setAttribute("r", (d.r0 + k * 34).toFixed(1));
          d.el.setAttribute("transform", `translate(${(d.vx * k).toFixed(1)},${(d.vy * k).toFixed(1)})`);
        });
        debris.forEach((d) => {
          const s = t - d.b.fall - 0.25;
          if (s < 0 || s > 1.4) { d.el.setAttribute("opacity", 0); return; }
          const x = d.b.x + d.b.w / 2 + d.vx * s, y = Math.min(GROUND - 3, GROUND - 30 + d.vy * s + 260 * s * s);
          d.el.setAttribute("opacity", 1);
          d.el.setAttribute("transform", `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${(s * 400).toFixed(0)})`);
        });
      },
    };
  }

  /* ---------------- SEL ---------------- */
  function sceneSel(svg) {
    const r = rng(11);
    const sky = el("rect", { x: 0, y: 0, width: W, height: H, fill: "#121b27" }, svg);
    const clouds = el("g", {}, svg);
    [[120, 40, 90], [260, 30, 110], [430, 45, 120], [610, 32, 100], [740, 48, 80]].forEach(([x, y, w]) => el("ellipse", { cx: x, cy: y, rx: w, ry: 30, fill: "#2a3443" }, clouds));
    // vadi tabani (suyun arkasi)
    el("rect", { x: 0, y: 284, width: W, height: H - 284, fill: "#252a22" }, svg);
    const behind = el("g", {}, svg);
    const trees = [];
    [[255, 284, 0.8], [340, 284, 0.75], [520, 284, 0.85], [585, 284, 0.7]].forEach(([x, b, s]) => trees.push(pine(behind, x, b, s)));
    const h1 = house(behind, 285, 284, 46, 34, "#8a7a68", "#7a3f32");
    const h2 = house(behind, 455, 284, 50, 36, "#8d8478", "#6b3a30");
    const car = el("g", {}, behind);
    el("rect", { x: 0, y: -12, width: 34, height: 12, rx: 3, fill: "#c0392b" }, car);
    el("rect", { x: 7, y: -20, width: 18, height: 9, rx: 2, fill: "#a5312a" }, car);
    // su
    const waterG = el("g", {}, svg);
    const water = el("path", { d: "", fill: "#2f7fbf", opacity: 0.88 }, waterG);
    const flow = [];
    for (let i = 0; i < 16; i++) flow.push({ el: el("line", { x1: 0, y1: 0, x2: 0, y2: 0, stroke: "#9fd2f5", "stroke-width": 1.5, opacity: 0.5 }, waterG), x: r() * W, y: r(), len: 14 + r() * 18 });
    // tepeler (onde; suyu yanlardan saklar)
    el("polygon", { points: `0,150 90,140 170,175 215,230 245,284 245,${H} 0,${H}`, fill: "#2f3a2b" }, svg);
    el("polygon", { points: `560,284 590,240 640,205 720,180 ${W},170 ${W},${H} 560,${H}`, fill: "#2f3a2b" }, svg);
    const hill = el("g", {}, svg);
    pine(hill, 40, 150, 0.9); pine(hill, 120, 150, 0.8); pine(hill, 770, 176, 0.8);
    const h3 = house(hill, 660, 200, 54, 38, "#9a8f80", "#7a3f32");
    const safe = el("text", { x: 687, y: 140, "text-anchor": "middle", "font-size": 13, "font-weight": 700, fill: "#34d399", opacity: 0 }, svg);
    safe.textContent = "Yüksekteki ev güvende";
    const risk = el("text", { x: 400, y: 200, "text-anchor": "middle", "font-size": 13, "font-weight": 700, fill: "#f87171", opacity: 0 }, svg);
    risk.textContent = "Dere yatağındaki yapılar";
    const rain = [];
    for (let i = 0; i < 90; i++) rain.push({ el: el("line", { x1: 0, y1: 0, x2: 0, y2: 0, stroke: "#9fb6cc", "stroke-width": 1, opacity: 0 }, svg), x: r() * (W + 100), y: r() * H, sp: 380 + r() * 200 });

    const level = (t) => lerp(300, 214, easeOut(prog(t, 2, 6.2))) + lerp(0, 34, prog(t, 8.2, 10.5));
    return {
      dur: 10.5,
      captions: [
        [0, "Kısa sürede çok yoğun yağış başlar."],
        [2.2, "Dere dakikalar içinde yükselir ve yatağından taşar."],
        [4.6, "Dere yatağına yapılan evler, araçlar ve ağaçlar sürüklenebilir."],
        [7.6, "Yağışta dere kenarından, alt geçitten ve bodrumdan uzak dur; yüksek bir yere çık."],
      ],
      draw(t) {
        const rainK = prog(t, 0, 1.4) * (1 - prog(t, 8.5, 10.5) * 0.7);
        sky.setAttribute("fill", t < 1 ? "#121b27" : "#0e141d");
        rain.forEach((d) => {
          const y = (d.y + t * d.sp) % (H + 40) - 20, x = (d.x - t * 60 - y * 0.12) % (W + 100);
          d.el.setAttribute("x1", x.toFixed(1)); d.el.setAttribute("y1", y.toFixed(1));
          d.el.setAttribute("x2", (x - 4).toFixed(1)); d.el.setAttribute("y2", (y + 14).toFixed(1));
          d.el.setAttribute("opacity", (0.55 * rainK).toFixed(2));
        });
        const L = level(t);
        let p = `M -10 ${H} L -10 ${L}`;
        for (let x = 0; x <= W + 10; x += 20) p += ` L ${x} ${(L + Math.sin(x / 38 + t * 5) * 3).toFixed(1)}`;
        water.setAttribute("d", p + ` L ${W + 10} ${H} Z`);
        flow.forEach((f) => {
          const x = (f.x + t * 140) % (W + 40) - 20, y = L + 8 + f.y * (H - L - 14);
          const on = L < 290;
          f.el.setAttribute("x1", x.toFixed(1)); f.el.setAttribute("x2", (x + f.len).toFixed(1));
          f.el.setAttribute("y1", y.toFixed(1)); f.el.setAttribute("y2", y.toFixed(1));
          f.el.setAttribute("opacity", on ? 0.45 : 0);
        });
        // surukleme: ev 1, araba, agac
        const s1 = easeIn(prog(t, 4.6, 8.4));
        h1.setAttribute("transform", `translate(${(s1 * 330).toFixed(1)},${(s1 * 30).toFixed(1)}) rotate(${(s1 * 38).toFixed(1)} 308 268)`);
        h1.setAttribute("opacity", (1 - prog(t, 7.4, 8.4)).toFixed(2));
        const s2 = prog(t, 4.9, 6.2);
        h2.setAttribute("transform", `rotate(${(s2 * 6).toFixed(1)} 480 284)`);
        const sc = easeIn(prog(t, 3.8, 7.2));
        car.setAttribute("transform", `translate(${(360 + sc * 420).toFixed(1)},${(284 - sc * 20 + Math.sin(t * 6) * 2 * sc).toFixed(1)}) rotate(${(sc * 25).toFixed(1)})`);
        trees.forEach((tr, i) => {
          if (i !== 1 && i !== 2) return;
          const k = easeIn(prog(t, 5.2 + i * 0.4, 8.6 + i * 0.3));
          tr.grp.setAttribute("transform", `translate(${(tr.x + k * 300).toFixed(1)},${(tr.base - k * 18).toFixed(1)}) rotate(${(k * 88).toFixed(1)}) scale(${tr.s * 0 + 1})`);
          tr.grp.setAttribute("opacity", (1 - prog(t, 8, 9.2)).toFixed(2));
        });
        risk.setAttribute("opacity", (prog(t, 4.6, 5.2) * (1 - prog(t, 7.4, 8))).toFixed(2));
        safe.setAttribute("opacity", prog(t, 7.6, 8.2).toFixed(2));
        h3.setAttribute("opacity", 1);
      },
    };
  }

  /* ---------------- ORMAN YANGINI ---------------- */
  function sceneYangin(svg) {
    const r = rng(23);
    const sky = el("rect", { x: 0, y: 0, width: W, height: H, fill: "#121a24" }, svg);
    const glow = el("rect", { x: 0, y: 0, width: W, height: H, fill: "#ff6a2a", opacity: 0 }, svg);
    el("text", { x: 24, y: 40, "font-size": 13, "font-weight": 700, fill: "#9fb6cc" }, svg).textContent = "Rüzgâr";
    const wind = el("path", { d: "M 24 52 L 110 52 M 100 46 L 110 52 L 100 58", stroke: "#9fb6cc", "stroke-width": 2, fill: "none" }, svg);
    el("polygon", { points: `0,${GROUND - 10} 300,${GROUND - 24} 560,${GROUND - 6} ${W},${GROUND} ${W},${H} 0,${H}`, fill: "#2b2f24" }, svg);
    // yangin emniyet seridi (agacsiz bant) ve evler
    el("rect", { x: 660, y: GROUND - 6, width: 40, height: 10, fill: "#4a4532", opacity: 0.8 }, svg);
    const fbLabel = el("text", { x: 680, y: GROUND + 24, "text-anchor": "middle", "font-size": 11, "font-weight": 700, fill: "#34d399", opacity: 0 }, svg);
    fbLabel.textContent = "boş şerit";
    const h1 = house(svg, 600, GROUND - 4, 46, 32, "#8a7a68", "#7a3f32");
    const h2 = house(svg, 718, GROUND - 2, 52, 36, "#9a8f80", "#6b3a30");
    const smokeG = el("g", {}, svg);
    const forest = el("g", {}, svg);
    const trees = [];
    for (let i = 0; i < 26; i++) {
      const x = 30 + i * 21 + (r() - 0.5) * 8;
      const base = GROUND - 10 - Math.sin((x / 560) * Math.PI) * 14 + (r() - 0.5) * 4;
      const tr = pine(forest, x, base, 0.85 + r() * 0.35);
      const flame = el("path", { d: "M -10 -8 Q -12 -30 0 -52 Q 12 -30 10 -8 Z", fill: "#ff8a2a", opacity: 0 }, tr.grp);
      const core = el("path", { d: "M -5 -8 Q -6 -22 0 -36 Q 6 -22 5 -8 Z", fill: "#ffd166", opacity: 0 }, tr.grp);
      trees.push({ ...tr, flame, core, ph: r() * 6 });
    }
    const roofFire = el("path", { d: "M 606 252 Q 610 232 623 222 Q 636 232 640 252 Z", fill: "#ff8a2a", opacity: 0 }, svg);
    const smoke = [];
    for (let i = 0; i < 70; i++) smoke.push({ el: el("circle", { cx: 0, cy: 0, r: 0, fill: "#59606b", opacity: 0 }, smokeG), off: r() * 6, tree: Math.floor(r() * 26), vx: 30 + r() * 30 });
    const embers = [];
    for (let i = 0; i < 26; i++) embers.push({ el: el("circle", { cx: 0, cy: 0, r: 1.6, fill: "#ffb347", opacity: 0 }, svg), off: r() * 3, tree: Math.floor(r() * 26), vx: 70 + r() * 60, vy: -30 - r() * 30 });
    const plane = el("g", { opacity: 0 }, svg);
    el("path", { d: "M 0 0 L 54 -4 L 60 0 L 54 4 Z", fill: "#e5e7eb" }, plane);
    el("path", { d: "M 22 -2 L 30 -18 L 36 -18 L 32 -2 Z M 22 2 L 30 16 L 36 16 L 32 2 Z", fill: "#cbd5e1" }, plane);
    el("rect", { x: 46, y: -10, width: 4, height: 8, fill: "#ef4444" }, plane);
    const drops = [];
    for (let i = 0; i < 40; i++) drops.push({ el: el("circle", { cx: 0, cy: 0, r: 2, fill: "#7cc4f5", opacity: 0 }, svg), dx: r() * 60, dt: r() * 0.6 });
    const call = el("text", { x: W / 2, y: 92, "text-anchor": "middle", "font-size": 22, "font-weight": 800, fill: "#ffffff", opacity: 0 }, svg);
    call.textContent = "177 — Orman yangını ihbar";

    // atesin onu: zamanla saga ilerler (ruzgarla hizlanir), ucak gelince durur
    const front = (t) => (t < 0.8 ? -1 : Math.min(30 + (t - 0.8) * 70 + Math.pow(Math.max(0, t - 0.8), 2) * 6, lerp(560, 600, prog(t, 6.4, 7.2))));
    return {
      dur: 10.5,
      captions: [
        [0, "Ormanda yakılan bir ateş, atılan bir sigara ya da cam şişe…"],
        [1.6, "Sıcak, kuru ve rüzgârlı havada alevler ağaçtan ağaca hızla geçer."],
        [4.6, "Rüzgârın taşıdığı kıvılcımlar yeni yangınlar başlatır; alevler evlere yaklaşır."],
        [7.6, "Duman ya da alev görürsen hemen 177'yi ara. Ormanda ateş yakma."],
      ],
      draw(t) {
        const F = front(t);
        let burning = 0;
        trees.forEach((tr) => {
          const lit = F >= tr.x && (t < 7.4 || tr.x < 560);
          const age = lit ? Math.max(0, t - (0.8 + (tr.x - 30) / 90)) : 0;
          const on = lit && age < 2.4;
          const charred = lit && age >= 1.6;
          if (on) burning++;
          const fl = on ? 0.85 + Math.sin(t * 18 + tr.ph) * 0.15 : 0;
          tr.flame.setAttribute("opacity", fl.toFixed(2));
          tr.core.setAttribute("opacity", (fl * 0.9).toFixed(2));
          tr.flame.setAttribute("transform", `scale(1,${(0.9 + Math.sin(t * 13 + tr.ph) * 0.12).toFixed(2)})`);
          tr.crown.setAttribute("fill", charred ? "#1f1d1b" : lit ? "#7a4a20" : "#2f6b4f");
          tr.trunk.setAttribute("fill", charred ? "#151311" : "#5b4636");
        });
        glow.setAttribute("opacity", (Math.min(0.16, burning * 0.012) * (1 - prog(t, 8, 10))).toFixed(3));
        smoke.forEach((p) => {
          const tr = trees[p.tree];
          const lit = F >= tr.x;
          const k = ((t + p.off) % 3) / 3;
          if (!lit || t < 1) { p.el.setAttribute("opacity", 0); return; }
          p.el.setAttribute("cx", (tr.x + k * p.vx * 3).toFixed(1));
          p.el.setAttribute("cy", (tr.base - 50 - k * 160).toFixed(1));
          p.el.setAttribute("r", (6 + k * 26).toFixed(1));
          p.el.setAttribute("opacity", (0.35 * (1 - k) * (1 - prog(t, 8.5, 10.5) * 0.6)).toFixed(2));
        });
        embers.forEach((e) => {
          const tr = trees[e.tree];
          const k = ((t + e.off) % 1.6) / 1.6;
          const on = F >= tr.x && t > 3 && t < 7.4;
          e.el.setAttribute("cx", (tr.x + k * e.vx).toFixed(1));
          e.el.setAttribute("cy", (tr.base - 40 + e.vy * k + 60 * k * k).toFixed(1));
          e.el.setAttribute("opacity", on ? (1 - k).toFixed(2) : 0);
        });
        roofFire.setAttribute("opacity", t > 6 && t < 8.6 ? (0.8 + Math.sin(t * 20) * 0.2).toFixed(2) : 0);
        roofFire.setAttribute("transform", `translate(0,${(t > 8 ? (t - 8) * 10 : 0).toFixed(1)})`);
        h1.setAttribute("opacity", 1);
        // ucak saga'dan sola gecip su birakir
        const pk = prog(t, 6.6, 8.6);
        const px = lerp(W + 60, -120, pk);
        plane.setAttribute("opacity", pk > 0 && pk < 1 ? 1 : 0);
        plane.setAttribute("transform", `translate(${px.toFixed(1)},110) scale(-1,1)`);
        drops.forEach((d) => {
          const s = t - 6.9 - d.dt;
          if (s < 0 || s > 1.2 || pk >= 1) { d.el.setAttribute("opacity", 0); return; }
          const x0 = lerp(W + 60, -120, prog(6.9 + d.dt, 6.6, 8.6)) - 30 + d.dx;
          d.el.setAttribute("cx", x0.toFixed(1));
          d.el.setAttribute("cy", (115 + 200 * s * s + 40 * s).toFixed(1));
          d.el.setAttribute("opacity", 0.85);
        });
        fbLabel.setAttribute("opacity", prog(t, 7.6, 8.2).toFixed(2));
        call.setAttribute("opacity", prog(t, 7.8, 8.4).toFixed(2));
        h2.setAttribute("opacity", 1);
        wind.setAttribute("transform", `translate(${(Math.sin(t * 3) * 4).toFixed(1)},0)`);
      },
    };
  }

  const SCENES = { deprem: sceneDeprem, sel: sceneSel, yangin: sceneYangin };

  /* ---------------- oynatici ---------------- */
  function mount(host, type) {
    if (!SCENES[type]) return;
    host.innerHTML = "";
    host.classList.add("sahne-host");
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Temsilî afet canlandırması" });
    host.appendChild(svg);
    const ui = document.createElement("div");
    ui.className = "sahne-ui";
    ui.innerHTML = `<span class="sahne-tag">Temsilî canlandırma</span>
      <p class="sahne-cap" aria-live="polite"></p>
      <div class="sahne-ctrl">
        <button type="button" class="btn btn-primary btn-sm sahne-play">${window.HavaIcon ? window.HavaIcon("play", { size: 14 }) : ""} <span>Oynat</span></button>
        <button type="button" class="btn btn-ghost btn-sm sahne-sound" aria-pressed="false">Ses: kapalı</button>
      </div>`;
    host.appendChild(ui);
    const cap = ui.querySelector(".sahne-cap");
    const playBtn = ui.querySelector(".sahne-play");
    const soundBtn = ui.querySelector(".sahne-sound");
    let sound = false, raf = 0, scene = null;
    try { sound = localStorage.getItem("sahne_ses") === "1"; } catch {}
    const setSoundLabel = () => { soundBtn.textContent = sound ? "Ses: açık" : "Ses: kapalı"; soundBtn.setAttribute("aria-pressed", String(sound)); };
    setSoundLabel();

    function build() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      scene = SCENES[type](svg);
    }
    function frame(t) { scene.draw(t); cap.textContent = caption(scene, t); }
    function play() {
      cancelAnimationFrame(raf);
      stopSound();
      build();
      playBtn.querySelector("span").textContent = "Tekrar oynat";
      if (reduce) { frame(scene.dur); return; }
      if (sound) SOUND[type](scene.dur);
      const t0 = performance.now();
      (function step(now) {
        const t = (now - t0) / 1000;
        frame(Math.min(t, scene.dur));
        if (t < scene.dur) raf = requestAnimationFrame(step);
      })(t0);
    }
    playBtn.addEventListener("click", play);
    soundBtn.addEventListener("click", () => {
      sound = !sound;
      try { localStorage.setItem("sahne_ses", sound ? "1" : "0"); } catch {}
      setSoundLabel();
      if (!sound) stopSound();
      else audio();
    });
    build();
    frame(0);
    cap.textContent = "Oynat'a bas: bu tür bir afette neler olur, nasıl korunulur?";
    return { destroy() { cancelAnimationFrame(raf); stopSound(); } };
  }

  window.Sahne = { mount };
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-sahne]").forEach((h) => { h._sahne = mount(h, h.dataset.sahne); });
    // arsiv sayfasindaki sekmeler
    document.querySelectorAll("[data-sahne-tab]").forEach((b) => b.addEventListener("click", () => {
      const host = document.getElementById(b.dataset.target);
      if (!host) return;
      if (host._sahne) host._sahne.destroy();
      host.dataset.sahne = b.dataset.sahneTab;
      host._sahne = mount(host, b.dataset.sahneTab);
      document.querySelectorAll(`[data-sahne-tab][data-target="${b.dataset.target}"]`).forEach((x) => x.classList.toggle("on", x === b));
    }));
  });
})();
