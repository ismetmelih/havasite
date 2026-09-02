/* =========================================================================
   TürkiyeCanlı — Yangınlar
   Bölümler: Genel · Harita · Liste · Risk · İstatistik
   Kaynak: /api/fires (NASA FIRMS) + Open-Meteo (yangın riski)
   ========================================================================= */
(function () {
  "use strict";

  const REFRESH_MS = 5 * 60 * 1000;
  const D = window.Dash;
  const round = Math.round;
  const $ = (id) => document.getElementById(id);

  const RISK_CITIES = [
    { name: "Muğla", lat: 37.2153, lon: 28.3636 },
    { name: "Antalya", lat: 36.8969, lon: 30.7133 },
    { name: "İzmir", lat: 38.4237, lon: 27.1428 },
    { name: "Aydın", lat: 37.848, lon: 27.845 },
    { name: "Çanakkale", lat: 40.1553, lon: 26.4142 },
    { name: "Balıkesir", lat: 39.6484, lon: 27.8826 },
    { name: "Denizli", lat: 37.7765, lon: 29.0864 },
    { name: "Manisa", lat: 38.6191, lon: 27.4289 },
    { name: "Mersin", lat: 36.8, lon: 34.6333 },
    { name: "Adana", lat: 37.0, lon: 35.3213 },
  ];

  const state = {
    raw: [], demo: false, lastOk: false,
    view: "genel", mapReady: false, map: null, layer: null,
    risk: null,
  };
  let tabs;

  document.addEventListener("DOMContentLoaded", () => {
    $("year") && ($("year").textContent = new Date().getFullYear());

    tabs = D.setupTabs("#fTabs", onSwitch);
    state.view = tabs.initial();

    setupFilters();
    $("demoBtn").addEventListener("click", () => {
      state.demo = true;
      state.raw = buildDemo();
      $("setupPanel").hidden = true;
      $("demoBanner").hidden = false;
      $("lastUpdated").textContent = "Örnek veri gösteriliyor";
      render();
    });

    fetchFires();
    setInterval(fetchFires, REFRESH_MS);
    loadRisk();
    setInterval(loadRisk, 20 * 60000);

    onSwitch(state.view);
  });

  function onSwitch(v) {
    state.view = v;
    $("fFilterBar").style.display = ["genel", "harita", "liste", "istat"].includes(v) ? "" : "none";
    if (v === "harita") initMap();
    if (v === "risk" && state.risk) renderRiskView();
    render();
    window.hydrateIcons && window.hydrateIcons();
  }

  /* ---- filtreler ---- */
  function setupFilters() {
    $("daySelect").addEventListener("change", () => { if (!state.demo) fetchFires(); });
    $("sourceSelect").addEventListener("change", () => { if (!state.demo) fetchFires(); });
    $("confSelect").addEventListener("change", render);
    const fr = $("frpRange"), fv = $("frpRangeVal");
    window.bindRangeFill && window.bindRangeFill(fr);
    fr.addEventListener("input", () => { fv.textContent = `${fr.value}+ MW`; window.flashUpdate && window.flashUpdate(fv); render(); });
  }

  /* ---- renk / boyut / güven ---- */
  const FRP_STOPS = [[0, [224, 193, 132]], [5, [213, 154, 92]], [15, [192, 79, 69]], [45, [138, 47, 39]]];
  const frpColor = (f) => D.scale(FRP_STOPS, f || 0);
  const fireSize = (f) => Math.max(10, Math.min(42, 10 + Math.sqrt(Math.max(f, 0)) * 4));
  function confLevel(raw) {
    if (raw == null || raw === "") return 1;
    const n = Number(raw);
    if (!Number.isNaN(n)) return n >= 80 ? 2 : n >= 40 ? 1 : 0;
    const s = String(raw).toLowerCase();
    return s.startsWith("h") ? 2 : s.startsWith("n") ? 1 : 0;
  }
  const confLabel = (r) => ["Düşük", "Orta", "Yüksek"][confLevel(r)];
  function cityOf(f) { const n = window.nearestCity ? window.nearestCity(f.lat, f.lon) : null; return n ? n.city.name : null; }

  /* ---- veri ---- */
  async function fetchFires() {
    const days = $("daySelect").value, source = $("sourceSelect").value;
    try {
      const data = await fetch(`/api/fires?days=${days}&source=${source}`).then((r) => r.json());
      if (data.ok) {
        if (state.demo) { state.demo = false; $("demoBanner").hidden = true; window.showToast("Gerçek FIRMS verisi bulundu.", { accent: "var(--c-fire)" }); }
        state.lastOk = true;
        state.raw = data.data;
        $("setupPanel").hidden = true;
        $("lastUpdated").textContent = `Son güncelleme: ${window.formatClock(new Date())} · ${data.source || source}`;
        render();
        return;
      }
      if (data.reason === "no_key" && !state.demo) {
        $("setupPanel").hidden = false;
        $("lastUpdated").textContent = "API anahtarı bekleniyor";
        state.raw = []; render();
        return;
      }
      if (!state.demo) $("lastUpdated").textContent = state.lastOk ? "Veri alınamadı, önceki veriler gösteriliyor." : "Veri alınamadı, tekrar denenecek…";
    } catch {
      if (!state.demo) $("lastUpdated").textContent = "Bağlantı hatası, tekrar denenecek…";
    }
  }

  function filtered() {
    const cf = $("confSelect").value;
    const minFrp = parseFloat($("frpRange").value) || 0;
    return state.raw
      .filter((f) => cf === "all" || (cf === "high" ? confLevel(f.confidence) === 2 : confLevel(f.confidence) >= 1))
      .filter((f) => (f.frp || 0) >= minFrp)
      .sort((a, b) => (b.frp || 0) - (a.frp || 0));
  }

  function render() {
    const list = filtered();
    renderFreshness();
    renderStats(list);
    if (state.view === "genel") { renderDaily(list); renderMiniList(list); renderProvince(list); }
    if (state.view === "harita") renderMap(list);
    if (state.view === "liste") renderList(list);
    if (state.view === "istat") renderStatView(list);
    window.hydrateIcons && window.hydrateIcons();
  }

  function setStat(id, v) {
    const el = $(id); if (!el) return;
    const t = String(v);
    if (el.textContent !== t) { el.textContent = t; window.flashUpdate && window.flashUpdate(el); }
  }

  function renderFreshness() {
    const el = $("fireFreshness");
    if (!el) return;
    if (!state.raw.length) { el.textContent = "—"; return; }
    let newest = 0;
    state.raw.forEach((f) => {
      if (!f.date) return;
      const hhmm = String(f.time || "0000").padStart(4, "0");
      const t = new Date(`${f.date}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`).getTime();
      if (t > newest) newest = t;
    });
    el.textContent = state.demo ? "örnek veri" : (newest ? window.timeAgoTR(new Date(newest)) : "—");
  }

  function renderStats(list) {
    $("statCountSub").textContent = state.demo ? "örnek veri" : "seçili aralık";
    if (!list.length) {
      setStat("statCount", "0"); setStat("statMaxFrp", "—"); setStat("statRegion", "—");
      $("statRegionSub").textContent = "—"; setStat("statDayNight", "—");
      return;
    }
    setStat("statCount", list.length);
    const mx = list.reduce((a, b) => ((b.frp || 0) > (a.frp || 0) ? b : a), list[0]);
    setStat("statMaxFrp", mx.frp ? mx.frp.toFixed(1) : "—");
    const cc = new Map();
    list.forEach((f) => { const c = cityOf(f); if (c) cc.set(c, (cc.get(c) || 0) + 1); });
    let top = "—", n = 0;
    cc.forEach((v, k) => { if (v > n) { n = v; top = k; } });
    setStat("statRegion", top);
    $("statRegionSub").textContent = n ? `${n} tespit` : "—";
    const day = list.filter((f) => (f.daynight || "").toUpperCase().startsWith("D")).length;
    const pct = round((day / list.length) * 100);
    setStat("statDayNight", `%${pct} / %${100 - pct}`);
  }

  function renderDaily(list) {
    const days = parseInt($("daySelect").value, 10);
    const AY = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
    if (days <= 1) {
      // tek gün: saatlik dağılım (acq_time UTC → Türkiye saati +3)
      $("fDailyHint").textContent = "Son 24 saatteki tespitlerin saatlik dağılımı (yerel saat)";
      const hrs = new Array(24).fill(0);
      list.forEach((f) => {
        const hhmm = String(f.time || "").padStart(4, "0");
        let h = parseInt(hhmm.slice(0, 2), 10);
        if (!Number.isNaN(h)) hrs[(h + 3) % 24]++;
      });
      D.histogram($("fDailyChart"), hrs.map((v, i) => ({ v, label: i % 3 === 0 ? `${String(i).padStart(2, "0")}` : "" })), { height: 200 });
      return;
    }
    $("fDailyHint").textContent = "Seçili gün aralığındaki günlük tespit sayısı";
    const byDay = new Map();
    list.forEach((f) => { if (f.date) byDay.set(f.date, (byDay.get(f.date) || 0) + 1); });
    const arr = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      arr.push({ v: byDay.get(key) || 0, label: `${d.getDate()} ${AY[d.getMonth()]}` });
    }
    D.histogram($("fDailyChart"), arr, { height: 200 });
  }

  function rowHtml(f, i) {
    const color = frpColor(f.frp);
    const c = cityOf(f);
    return `<div class="side-row" style="--i:${Math.min(i, 14)}" data-lat="${f.lat}" data-lon="${f.lon}">
      <span class="mag-chip" style="background:${color}">${f.frp && f.frp.toFixed ? round(f.frp) : "-"}</span>
      <div class="row-main">
        <div class="row-title">${c ? window.escapeHtml(c) + " yakını" : `${f.lat.toFixed(2)}, ${f.lon.toFixed(2)}`}</div>
        <div class="row-sub">FRP ${f.frp && f.frp.toFixed ? f.frp.toFixed(1) : "—"} MW · Güven: ${confLabel(f.confidence)} · ${window.escapeHtml(f.date || "")} ${window.escapeHtml(f.time || "")} · ${(f.daynight || "").toUpperCase().startsWith("D") ? "gündüz" : "gece"}</div>
      </div>
    </div>`;
  }
  function renderMiniList(list) {
    $("sideCount").innerHTML = `<span class="live-blip"></span> ${list.length}`;
    $("fireListMini").innerHTML = list.length
      ? list.slice(0, 40).map((f, i) => rowHtml(f, i)).join("")
      : `<div class="sr-empty" style="padding:20px;color:var(--text-muted);text-align:center">${state.demo || state.lastOk ? "Seçili filtrede tespit yok." : "Henüz veri yok."}</div>`;
    bindRows("fireListMini");
  }
  function renderList(list) {
    $("listCount").innerHTML = `<span class="live-blip"></span> ${list.length}`;
    $("fireList").innerHTML = list.length
      ? list.slice(0, 300).map((f, i) => rowHtml(f, i)).join("")
      : `<div class="sr-empty" style="padding:24px;color:var(--text-muted);text-align:center">${state.demo || state.lastOk ? "Seçili filtrede tespit bulunamadı." : "Henüz veri yok."}</div>`;
    bindRows("fireList");
  }
  function bindRows(id) {
    $(id).querySelectorAll(".side-row").forEach((row) => row.addEventListener("click", () => {
      tabs.go("harita");
      setTimeout(() => state.map && state.map.flyTo([+row.dataset.lat, +row.dataset.lon], 9, { duration: 0.8 }), 200);
    }));
  }

  function renderProvince(list) {
    const cc = new Map();
    list.forEach((f) => { const c = cityOf(f); if (c) cc.set(c, (cc.get(c) || 0) + 1); });
    const rows = [...cc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, v]) => ({ label, v }));
    $("psCount").innerHTML = `<span class="live-blip"></span> ${cc.size} il`;
    if (!rows.length) { $("provinceBars").innerHTML = `<div class="sr-empty" style="padding:16px;color:var(--text-muted)">İl eşleşmesi yok.</div>`; return; }
    D.bars($("provinceBars"), rows, { fire: true });
  }

  /* ---- HARİTA ---- */
  function initMap() {
    if (state.mapReady) { setTimeout(() => state.map.invalidateSize(), 60); return; }
    state.mapReady = true;
    state.map = L.map("fireMap", { scrollWheelZoom: true }).setView([39.0, 35.2], 5.8);
    window.HavaMap.addBaseLayer(state.map);
    state.layer = L.layerGroup().addTo(state.map);
    renderMap(filtered());
  }
  function renderMap(list) {
    if (!state.layer) return;
    state.layer.clearLayers();
    $("mapCount").innerHTML = `<span class="live-blip"></span> ${list.length}`;
    list.forEach((f) => {
      const size = fireSize(f.frp), color = frpColor(f.frp);
      const html = `<div class="fire-mark">
        <div class="fmk-ring" style="width:${size * 1.6}px;height:${size * 1.6}px;background:${color}22;border:1.5px solid ${color}"></div>
        <svg class="fmk-flame" viewBox="0 0 64 64" style="width:${size}px;height:${size}px;color:${color}" aria-hidden="true"><path d="M32 6c4 8-3 11-3 18 0 5 4 7 7 7 5 0 9-4 9-10 6 6 9 14 9 20 0 12-10 21-22 21S10 53 10 41c0-9 5-15 9-20 1 6 5 9 9 9 3 0-3-4 4-24Z" fill="currentColor"/></svg>
        <span class="fmk-ember e1"></span><span class="fmk-ember e2"></span></div>`;
      const c = cityOf(f);
      const m = L.marker([f.lat, f.lon], { icon: L.divIcon({ className: "", html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }) }).addTo(state.layer);
      m.bindPopup(`<div class="map-pop"><strong>${c ? window.escapeHtml(c) + " yakını" : "Tespit"}</strong><br/>FRP: ${f.frp && f.frp.toFixed ? f.frp.toFixed(1) : f.frp} MW · Güven: ${confLabel(f.confidence)}<br/>${window.escapeHtml(f.date || "")} ${window.escapeHtml(f.time || "")} UTC</div>`);
    });
  }

  /* ---- RİSK ---- */
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  function cityScore(t, h, w) {
    return clamp01((t - 15) / 25) * 0.4 + clamp01((60 - h) / 60) * 0.4 + clamp01(w / 40) * 0.2;
  }
  async function loadRisk() {
    const lats = RISK_CITIES.map((c) => c.lat).join(",");
    const lons = RISK_CITIES.map((c) => c.lon).join(",");
    try {
      const data = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=Europe%2FIstanbul`).then((r) => r.json());
      const arr = Array.isArray(data) ? data : [data];
      const cities = arr.map((d, i) => {
        const c = d.current;
        return { name: RISK_CITIES[i].name, t: c.temperature_2m, h: c.relative_humidity_2m, w: c.wind_speed_10m, score: cityScore(c.temperature_2m, c.relative_humidity_2m, c.wind_speed_10m) };
      });
      const avg = cities.reduce((s, c) => s + c.score, 0) / cities.length;
      state.risk = { cities, avg };
      renderRiskBanner();
      if (state.view === "risk") renderRiskView();
    } catch {
      $("riskLevel").textContent = "veri alınamadı";
    }
  }
  function riskLabel(s) {
    return s < 0.35 ? { l: "Düşük", cls: "risk-good" } : s < 0.55 ? { l: "Orta", cls: "risk-warning" } : s < 0.75 ? { l: "Yüksek", cls: "risk-serious" } : { l: "Çok Yüksek", cls: "risk-critical" };
  }
  function renderRiskBanner() {
    const { avg } = state.risk;
    const r = riskLabel(avg);
    const el = $("riskLevel");
    el.innerHTML = `<span class="risk-dot"></span>${r.l}`;
    el.className = `risk-level ${r.cls}`;
    window.flashUpdate && window.flashUpdate(el);
    $("riskDesc").textContent = `Ege ve Akdeniz'deki ${state.risk.cities.length} il için sıcaklık, nem ve rüzgâr ortalamasına göre tahmini risk seviyesi: ${r.l.toLowerCase()}.`;
  }
  function renderRiskView() {
    if (!state.risk) return;
    const { cities, avg } = state.risk;
    const r = riskLabel(avg);
    $("fRiskGauge").innerHTML = D.arcGauge(avg * 100, 0, 100, [[0, "#3f9d6d"], [35, "#d9a441"], [55, "#cf8352"], [75, "#cf4f4f"], [90, "#8f5bb0"]]);
    $("fRiskLevelBig").textContent = `${r.l} · ${round(avg * 100)}/100`;
    $("fRiskExplain").textContent = `${cities.filter((c) => c.score >= 0.55).length} il "yüksek" ve üzeri risk taşıyor. En riskli il: ${[...cities].sort((a, b) => b.score - a.score)[0].name}.`;
    $("fRiskCities").innerHTML = [...cities].sort((a, b) => b.score - a.score).map((c) => {
      const cr = riskLabel(c.score);
      return `<div class="dash-dcard" style="min-height:auto">
        <div class="dash-dcard-head">${window.escapeHtml(c.name)}</div>
        <div class="dash-dcard-vis" style="min-height:70px">${D.arcGauge(c.score * 100, 0, 100, [[0, "#3f9d6d"], [35, "#d9a441"], [55, "#cf8352"], [75, "#cf4f4f"]])}</div>
        <div class="dash-dcard-val">${round(c.score * 100)}<small>/100 · ${cr.l}</small></div>
        <div class="dash-dcard-note">${round(c.t)}°C · %${round(c.h)} nem · ${round(c.w)} km/s rüzgâr</div>
      </div>`;
    }).join("");
  }

  /* ---- İSTATİSTİK ---- */
  function renderStatView(list) {
    list = list || filtered();
    if (!list.length) {
      $("fFrpHist").innerHTML = `<div class="sr-empty" style="padding:24px;color:var(--text-muted)">Gösterilecek veri yok.</div>`;
      return;
    }
    D.histogram($("fFrpHist"), [
      { label: "0–5", v: list.filter((f) => (f.frp || 0) < 5).length },
      { label: "5–15", v: list.filter((f) => (f.frp || 0) >= 5 && (f.frp || 0) < 15).length },
      { label: "15–30", v: list.filter((f) => (f.frp || 0) >= 15 && (f.frp || 0) < 30).length },
      { label: "30–60", v: list.filter((f) => (f.frp || 0) >= 30 && (f.frp || 0) < 60).length },
      { label: "60+ MW", v: list.filter((f) => (f.frp || 0) >= 60).length },
    ]);
    D.donut($("fConfDonut"), [
      { label: "Yüksek", v: list.filter((f) => confLevel(f.confidence) === 2).length, color: "#8a2f27" },
      { label: "Orta", v: list.filter((f) => confLevel(f.confidence) === 1).length, color: "#c04f45" },
      { label: "Düşük", v: list.filter((f) => confLevel(f.confidence) === 0).length, color: "#d59a5c" },
    ], list.length, "tespit");
    const dcount = list.filter((f) => (f.daynight || "").toUpperCase().startsWith("D")).length;
    D.donut($("fDayNightDonut"), [
      { label: "Gündüz", v: dcount, color: "#d7a066" },
      { label: "Gece", v: list.length - dcount, color: "#3b5a80" },
    ], list.length, "tespit");
    const cc = new Map();
    list.forEach((f) => { const c = cityOf(f); if (c) cc.set(c, (cc.get(c) || 0) + 1); });
    D.bars($("fProvFull"), [...cc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([label, v]) => ({ label, v })), { fire: true });
    const big = [...list].sort((a, b) => (b.frp || 0) - (a.frp || 0)).slice(0, 12);
    $("fBigTable").innerHTML = `<thead><tr><th>Konum</th><th>FRP</th><th>Güven</th><th>Zaman (UTC)</th></tr></thead>
      <tbody>${big.map((f) => `<tr><td>${window.escapeHtml(cityOf(f) ? cityOf(f) + " yakını" : f.lat.toFixed(2) + ", " + f.lon.toFixed(2))}</td><td>${f.frp && f.frp.toFixed ? f.frp.toFixed(1) : "—"}</td><td>${confLabel(f.confidence)}</td><td>${window.escapeHtml((f.date || "") + " " + (f.time || ""))}</td></tr>`).join("")}</tbody>`;
  }

  /* ---- demo ---- */
  function buildDemo() {
    const hot = [[37.05, 28.38], [36.86, 31.44], [40.15, 26.41], [37.6, 27.0], [37.3, 36.3]];
    const rows = [];
    hot.forEach(([lat, lon]) => {
      const n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) rows.push({
        lat: lat + (Math.random() - 0.5) * 0.6, lon: lon + (Math.random() - 0.5) * 0.6,
        frp: Math.round((Math.random() * 55 + 2) * 10) / 10,
        confidence: ["l", "n", "n", "h"][Math.floor(Math.random() * 4)],
        date: new Date().toISOString().slice(0, 10),
        time: `${String(Math.floor(Math.random() * 24)).padStart(2, "0")}${String(Math.floor(Math.random() * 60)).padStart(2, "0")}`,
        daynight: Math.random() > 0.5 ? "D" : "N",
      });
    });
    return rows;
  }
})();
