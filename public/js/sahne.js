// Temsili afet canlandirmalari: arayuz, altyazi ve ses. 3B sahne (sahne3d.js, Three.js) yalnizca
// bolum ekrana yaklasinca yuklenir. Belirli bir olayi degil, o tur bir afette genel olarak neler
// oldugunu ve nasil korunulacagini anlatir. Sesler dosyasiz uretilir (Web Audio); ses kapali baslar.
// Kullanim: <div class="sahne" data-sahne="deprem|sel|yangin"></div>
(function () {
  "use strict";

  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let engineMod = null;
  const loadEngine = () => (engineMod = engineMod || import("/js/sahne3d.js"));

  /* ---------------- ses ---------------- */
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
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 1.75 + w * 0.5; }
      crackleBuf = actx.createBuffer(1, len, actx.sampleRate);
      const c = crackleBuf.getChannelData(0);
      for (let i = 1; i < len; i++) c[i] = Math.random() < 0.0009 ? Math.random() * 2 - 1 : c[i - 1] * 0.86;
    }
    if (actx.state === "suspended") actx.resume();
    return actx;
  }
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
      layer(noiseBuf, { type: "lowpass", freq: 85 }, [[1.3, 0], [2.2, 1], [6.2, 0.9], [8.6, 0]], D);
      layer(noiseBuf, { type: "lowpass", freq: 240 }, [[3.5, 0], [3.7, 0.9], [5.6, 0.5], [7.5, 0]], D);
      layer(noiseBuf, { type: "highpass", freq: 2500 }, [[3.6, 0], [3.8, 0.15], [6, 0.08], [7.5, 0]], D);
    },
    sel: (D) => {
      layer(noiseBuf, { type: "bandpass", freq: 3200, q: 0.4 }, [[0.2, 0.05], [1.2, 0.25], [4, 0.32], [11, 0.28], [D, 0]], D);
      layer(noiseBuf, { type: "lowpass", freq: 480 }, [[2.5, 0], [6, 0.65], [10, 0.7], [D, 0]], D);
      [2.6, 6.2, 9.8].forEach((ft) => layer(noiseBuf, { type: "lowpass", freq: 120 }, [[ft + 0.2, 0], [ft + 0.35, 0.9], [ft + 2.2, 0]], D));
    },
    yangin: (D) => {
      layer(crackleBuf, { type: "highpass", freq: 1400 }, [[1, 0], [2.5, 0.6], [7.5, 0.95], [10.5, 0.35], [D, 0]], D);
      layer(noiseBuf, { type: "lowpass", freq: 300 }, [[1.5, 0], [5, 0.35], [9, 0.4], [D, 0]], D);
      layer(noiseBuf, { type: "bandpass", freq: 900, q: 1.2 }, [[8.4, 0], [9.6, 0.4], [11.2, 0]], D);
    },
  };

  /* ---------------- oynatici ---------------- */
  function mount(host, type) {
    host.innerHTML = "";
    host.classList.add("sahne-host");
    const stage = document.createElement("div");
    stage.className = "sahne-stage";
    stage.innerHTML = `<div class="sahne-poster"><span class="spinner"></span><span>3B sahne hazırlanıyor…</span></div><span class="sahne-tag">Temsilî canlandırma</span>`;
    host.appendChild(stage);
    const ui = document.createElement("div");
    ui.className = "sahne-ui";
    ui.innerHTML = `<p class="sahne-cap" aria-live="polite">Oynat'a bas: bu tür bir afette neler olur, nasıl korunulur? Sahneyi parmağınla ya da fareyle döndürebilirsin.</p>
      <div class="sahne-ctrl">
        <button type="button" class="btn btn-primary btn-sm sahne-play">${window.HavaIcon ? window.HavaIcon("play", { size: 14 }) : ""} <span>Oynat</span></button>
        <button type="button" class="btn btn-ghost btn-sm sahne-sound" aria-pressed="false">Ses: kapalı</button>
      </div>`;
    host.appendChild(ui);
    const cap = ui.querySelector(".sahne-cap");
    const playBtn = ui.querySelector(".sahne-play");
    const soundBtn = ui.querySelector(".sahne-sound");
    let sound = false, engine = null, loading = null, dead = false;
    try { sound = localStorage.getItem("sahne_ses") === "1"; } catch {}
    const setSoundLabel = () => { soundBtn.textContent = sound ? "Ses: açık" : "Ses: kapalı"; soundBtn.setAttribute("aria-pressed", String(sound)); };
    setSoundLabel();

    function ensure() {
      if (engine || loading) return loading || Promise.resolve(engine);
      loading = loadEngine().then((m) => {
        if (dead) return null;
        engine = m.create(stage, type);
        const poster = stage.querySelector(".sahne-poster");
        if (!engine) { poster.innerHTML = "<span>Tarayıcın 3B görüntülemeyi desteklemiyor.</span>"; return null; }
        poster.remove();
        stage.addEventListener("sahne:t", (e) => {
          const t = e.detail;
          let txt = engine.captions[0][1];
          for (const [s, c] of engine.captions) if (t >= s) txt = c;
          if (cap.textContent !== txt) cap.textContent = txt;
        });
        return engine;
      }).catch(() => { stage.querySelector(".sahne-poster").innerHTML = "<span>Sahne yüklenemedi.</span>"; return null; });
      return loading;
    }
    // bolum ekrana yaklasinca on yukleme (ilk kare hazir gorunsun)
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { ensure(); io.disconnect(); } }, { rootMargin: "300px" });
    io.observe(host);

    playBtn.addEventListener("click", async () => {
      const eng = await ensure();
      if (!eng) return;
      stopSound();
      playBtn.querySelector("span").textContent = "Tekrar oynat";
      if (reduce) { eng.showEnd(); cap.textContent = eng.captions[eng.captions.length - 1][1]; return; }
      if (sound) SOUND[type](eng.dur);
      eng.play();
    });
    soundBtn.addEventListener("click", () => {
      sound = !sound;
      try { localStorage.setItem("sahne_ses", sound ? "1" : "0"); } catch {}
      setSoundLabel();
      if (!sound) stopSound(); else audio();
    });
    return { destroy() { dead = true; io.disconnect(); stopSound(); if (engine) engine.destroy(); } };
  }

  window.Sahne = { mount };
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-sahne]").forEach((h) => { h._sahne = mount(h, h.dataset.sahne); });
    document.querySelectorAll("[data-sahne-tab]").forEach((b) => b.addEventListener("click", () => {
      const host = document.getElementById(b.dataset.target);
      if (!host || host.dataset.sahne === b.dataset.sahneTab) return;
      if (host._sahne) host._sahne.destroy();
      host.dataset.sahne = b.dataset.sahneTab;
      host._sahne = mount(host, b.dataset.sahneTab);
      document.querySelectorAll(`[data-sahne-tab][data-target="${b.dataset.target}"]`).forEach((x) => x.classList.toggle("on", x === b));
    }));
  });
})();
