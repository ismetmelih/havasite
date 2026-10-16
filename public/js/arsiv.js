// Afet arsivi yazisi: olayin yeri ve "Canlandir".
// Depremde: merkezden yayilan sarsinti dalgalari, ardindan artcilarin zaman sirasiyla belirmesi
// (USGS ANSS ComCat, kamu mali). Sel ve yanginda: etkilenen illerin sirayla belirmesi.
(function () {
  "use strict";
  const COLOR = { deprem: "#f5a524", sel: "#38bdf8", yangin: "#ef4444" };
  const $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ease = (x) => 1 - Math.pow(1 - x, 3);
  const nf = new Intl.NumberFormat("tr-TR");

  let pm, main, type, color, slug, ilNames;
  let layer = null; // canlandirma katmani (her oynatista temizlenir)
  let raf = 0;

  function setup() {
    main = $("arMain");
    if (!main || !window.L || !window.HavaProvMap) return;
    const lat = Number(main.dataset.lat), lon = Number(main.dataset.lon);
    type = main.dataset.type; slug = main.dataset.slug; ilNames = (main.dataset.il || "").split("|").filter(Boolean);
    color = COLOR[type] || "#22d3ee";
    pm = window.HavaProvMap.create({ el: "arMap", kind: "quake", faults: type === "deprem", noFill: true, maxZoom: 12 });
    pm.map.setView([lat, lon], 7);
    drawStatic(lat, lon);
    if (type === "deprem") loadQuakeData();
    else setupRegionPlayer();
  }

  function drawStatic(lat, lon) {
    L.circleMarker([lat, lon], { pane: "points", radius: 26, color, weight: 2, opacity: 0.55, fill: false, interactive: false }).addTo(pm.points);
    L.circleMarker([lat, lon], { pane: "points", radius: 10, color: "#ffffff", weight: 2.5, fillColor: color, fillOpacity: 1, interactive: false }).addTo(pm.points);
  }

  function resetLayer() {
    cancelAnimationFrame(raf);
    if (layer) pm.map.removeLayer(layer);
    layer = L.layerGroup().addTo(pm.map);
  }

  // genisleyen halka: merkezden disa, giderek solarak (metre cinsinden yaricap)
  function wave(lat, lon, maxM, ms, c) {
    const circ = L.circle([lat, lon], { pane: "points", radius: 1, color: c, weight: 2.5, opacity: 0.9, fill: true, fillColor: c, fillOpacity: 0.08, interactive: false }).addTo(layer);
    const t0 = performance.now();
    (function step(now) {
      const k = Math.min(1, (now - t0) / ms);
      circ.setRadius(1 + ease(k) * maxM);
      circ.setStyle({ opacity: 0.9 * (1 - k), fillOpacity: 0.08 * (1 - k) });
      if (k < 1) requestAnimationFrame(step); else layer.removeLayer(circ);
    })(t0);
  }

  function popDot(lat, lon, mag) {
    const r = Math.max(3, 1.5 + mag * 1.3);
    const tone = window.magTone(mag);
    const dot = L.circleMarker([lat, lon], { pane: "points", radius: 0.1, color: "#0b0d11", weight: 1, fillColor: tone, fillOpacity: 0.85, interactive: false }).addTo(layer);
    if (reduce) { dot.setRadius(r); return; }
    const t0 = performance.now();
    (function step(now) {
      const k = Math.min(1, (now - t0) / 320);
      dot.setRadius(r * (k < 0.7 ? (k / 0.7) * 1.35 : 1.35 - ((k - 0.7) / 0.3) * 0.35));
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }

  function relLabel(sec, days) {
    if (sec < 3600) return `Ana depremden ${Math.max(1, Math.round(sec / 60))} dk sonra`;
    if (sec < 86400) return `Ana depremden ${Math.round(sec / 3600)} sa sonra`;
    return `${Math.min(days, Math.floor(sec / 86400) + 1)}. gün`;
  }

  /* ---------------- deprem: dalga + artcilar ---------------- */
  async function loadQuakeData() {
    let d;
    try { d = await fetch(`/data/arsiv/${slug}.json`).then((r) => (r.ok ? r.json() : null)); } catch { d = null; }
    if (!d || !d.events || !d.events.length) return;
    d.events = d.events.filter((e) => e[0] <= d.days * 86400); // pencere disindakiler sayilmaz
    const after = d.events.length - 1;
    $("arDataNote").textContent = `Canlandırma: USGS deprem kataloğu (kamu malı) · ilk ${d.days} gün · ${d.radiusKm} km içinde M${d.minmag}+ · ${nf.format(after)} artçı. Büyüklükler USGS ölçümüdür; resmî değerler için AFAD esas alınır.`;
    $("arDataNote").hidden = false;
    const player = $("arPlayer");
    player.hidden = false;
    $("arCount").textContent = `${nf.format(after)} artçı`;
    $("arPlay").addEventListener("click", () => playQuake(d));
  }

  function playQuake(d) {
    resetLayer();
    const evs = d.events; // [sn, enlem, boylam, buyukluk]
    const span = Math.max(1, d.days * 86400);
    const bounds = L.latLngBounds(evs.map((e) => [e[1], e[2]]));
    pm.map.fitBounds(bounds.pad(0.25), { maxZoom: 9, animate: !reduce });
    const [, mlat, mlon, mmag] = evs[0];
    $("arPlayLabel").textContent = "Tekrar oynat";
    if (reduce) {
      evs.forEach((e) => popDot(e[1], e[2], e[3]));
      finish(d, evs.length - 1, Math.max(...evs.slice(1).map((e) => e[3]), 0));
      return;
    }
    // 1) sarsinti dalgalari
    for (let i = 0; i < 3; i++) setTimeout(() => wave(mlat, mlon, 90000 + mmag * 20000, 2200, "#ffffff"), i * 420);
    popDot(mlat, mlon, mmag);
    // 2) artcilar: 30 gunluk pencere ~14 sn'de, ilk saatler daha yavas (karekok zaman olcegi)
    const DUR = 14000, DELAY = 1600;
    const pos = (sec) => Math.sqrt(sec / span); // 0..1
    let shown = 1, maxAfter = 0;
    const t0 = performance.now() + DELAY;
    $("arClock").textContent = "Ana deprem";
    (function step(now) {
      const k = Math.max(0, Math.min(1, (now - t0) / DUR));
      while (shown < evs.length && pos(evs[shown][0]) <= k) {
        const e = evs[shown];
        popDot(e[1], e[2], e[3]);
        if (e[3] >= 6.5) for (let i = 0; i < 2; i++) setTimeout(() => wave(e[1], e[2], 80000 + e[3] * 18000, 2000, "#ffffff"), i * 400);
        maxAfter = Math.max(maxAfter, e[3]);
        shown++;
      }
      const sec = k * k * span;
      if (now >= t0) $("arClock").textContent = relLabel(sec, d.days);
      $("arCount").textContent = `${nf.format(shown - 1)} artçı${maxAfter ? ` · en büyüğü M${maxAfter.toFixed(1)}` : ""}`;
      $("arProg").style.width = `${k * 100}%`;
      if (k < 1) raf = requestAnimationFrame(step); else finish(d, shown - 1, maxAfter);
    })(performance.now());
  }

  function finish(d, n, maxAfter) {
    $("arClock").textContent = `İlk ${d.days} gün`;
    $("arCount").textContent = `${nf.format(n)} artçı${maxAfter ? ` · en büyüğü M${maxAfter.toFixed(1)}` : ""}`;
    $("arProg").style.width = "100%";
  }

  /* ---------------- sel / yangin: etkilenen iller sirayla ---------------- */
  async function setupRegionPlayer() {
    if (!ilNames.length) return;
    let geo;
    try { geo = await fetch("/data/tr-iller.geojson").then((r) => r.json()); } catch { return; }
    const feats = ilNames.map((n) => geo.features.find((f) => f.properties.n === n)).filter(Boolean);
    if (!feats.length) return;
    $("arPlayer").hidden = false;
    $("arCount").textContent = `${feats.length} il`;
    $("arDataNote").textContent = `Etkilenen iller: ${ilNames.join(", ")}.`;
    $("arDataNote").hidden = false;
    $("arPlay").addEventListener("click", () => playRegion(feats));
  }

  function playRegion(feats) {
    resetLayer();
    const lat = Number(main.dataset.lat), lon = Number(main.dataset.lon);
    const all = L.geoJSON({ type: "FeatureCollection", features: feats });
    pm.map.fitBounds(all.getBounds().pad(0.2), { maxZoom: 9, animate: !reduce });
    $("arPlayLabel").textContent = "Tekrar oynat";
    const shapes = feats.map((f) => L.geoJSON(f, { pane: "points", interactive: false, style: { color, weight: 2, opacity: 0, fillColor: color, fillOpacity: 0 } }).addTo(layer));
    if (reduce) {
      shapes.forEach((s) => s.setStyle({ opacity: 0.9, fillOpacity: 0.35 }));
      $("arClock").textContent = feats.map((f) => f.properties.n).join(" · ");
      $("arProg").style.width = "100%";
      return;
    }
    for (let i = 0; i < 3; i++) setTimeout(() => wave(lat, lon, 70000, 2000, color), i * 450);
    const STEP = 900, t0 = performance.now() + 700;
    (function step(now) {
      const total = shapes.length * STEP;
      const el = Math.max(0, now - t0);
      shapes.forEach((s, i) => {
        const k = Math.max(0, Math.min(1, (el - i * STEP) / 700));
        s.setStyle({ opacity: 0.9 * k, fillOpacity: 0.35 * k });
      });
      const idx = Math.min(shapes.length, Math.floor(el / STEP) + 1);
      $("arClock").textContent = feats.slice(0, idx).map((f) => f.properties.n).join(" · ");
      $("arProg").style.width = `${Math.min(1, el / total) * 100}%`;
      if (el < total + 700) raf = requestAnimationFrame(step);
    })(performance.now());
  }

  document.addEventListener("DOMContentLoaded", () => {
    const y = $("year");
    if (y) y.textContent = new Date().getFullYear();
    setup();
  });
})();
