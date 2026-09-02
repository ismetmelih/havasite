/* =========================================================================
   TürkiyeCanlı — Depremler
   Bölümler: Genel · Harita · Liste · 3B Küre · Zaman Tüneli · İstatistik
   Kaynak: /api/quakes (AFAD canlı) + /api/quakes/history (30 gün arşiv)
   ========================================================================= */
(function () {
  "use strict";

  const REFRESH_MS = 25000;
  const D = window.Dash;
  const state = {
    raw: [], knownIds: new Set(), firstLoad: true,
    view: "genel", userPos: null,
    map: null, layer: null, mapReady: false,
    globeReady: false, tunelReady: false,
    hist: null, histLoading: false,
  };
  let lastCity = "—", lastDate = null;
  let tabs;

  const $ = (id) => document.getElementById(id);
  const round = Math.round;

  document.addEventListener("DOMContentLoaded", () => {
    $("year") && ($("year").textContent = new Date().getFullYear());

    tabs = D.setupTabs("#qTabs", onSwitch);
    state.view = tabs.initial();

    setupFilters();
    setupGeo();
    startPulseTicker();

    fetchQuakes();
    setInterval(fetchQuakes, REFRESH_MS);

    onSwitch(state.view);
  });

  function onSwitch(v) {
    state.view = v;
    const showFilter = ["genel", "harita", "liste"].includes(v);
    $("qFilterBar").style.display = showFilter ? "" : "none";
    if (v === "harita") initMap();
    if (v === "kure") initGlobe();
    if (v === "tunel") initTimeline();
    if (v === "istat") ensureHistory();
    if (state.raw.length) render();
    window.hydrateIcons && window.hydrateIcons();
  }

  /* ---------------- filtreler + konum ---------------- */
  function setupFilters() {
    const mr = $("magRange"), mv = $("magRangeVal");
    window.bindRangeFill && window.bindRangeFill(mr);
    mr.addEventListener("input", () => { mv.textContent = `${parseFloat(mr.value).toFixed(1)}+`; window.flashUpdate && window.flashUpdate(mv); render(); });
    $("timeSelect").addEventListener("change", render);
    $("onlyFelt").addEventListener("change", render);
  }
  function setupGeo() {
    const btn = $("qfLocate");
    const pin = window.HavaIcon("map-pin", { size: 15 });
    const label = (t) => { btn.innerHTML = `${pin} ${t}`; };
    try { const s = JSON.parse(localStorage.getItem("havasite_user_pos") || "null"); if (s && s.lat) { state.userPos = s; label("Konum güncel"); } } catch {}
    btn.addEventListener("click", () => {
      if (!navigator.geolocation) { window.showToast("Tarayıcın konum servisini desteklemiyor."); return; }
      btn.disabled = true; label("Konum alınıyor…");
      navigator.geolocation.getCurrentPosition((p) => {
        state.userPos = { lat: p.coords.latitude, lon: p.coords.longitude };
        try { localStorage.setItem("havasite_user_pos", JSON.stringify(state.userPos)); } catch {}
        label("Konum güncel"); btn.disabled = false; render();
      }, () => { window.showToast("Konum izni alınamadı."); label("Konumumu kullan"); btn.disabled = false; }, { timeout: 8000 });
    });
  }

  /* ---------------- renk / boyut ---------------- */
  const MAG_STOPS = [[0, [220, 192, 138]], [2, [215, 160, 102]], [3.5, [192, 127, 58]], [5, [176, 80, 63]], [6.5, [110, 32, 32]]];
  const magColor = (m) => D.scale(MAG_STOPS, m);
  const magSize = (m) => Math.max(10, Math.min(46, 10 + m * 5.4));
  function provinceOf(q) { return (q.closestCity || "").replace(/\s*yakını$/, "").trim() || null; }

  /* ---------------- canlı veri ---------------- */
  async function fetchQuakes() {
    try {
      const r = await fetch("/api/quakes?limit=300");
      const data = await r.json();
      if (!data.ok) { $("lastUpdated").textContent = "Veri alınamadı, tekrar denenecek…"; return; }
      data.data.forEach((q) => {
        if (!q.closestCity && window.nearestCity) {
          const n = window.nearestCity(q.lat, q.lon);
          if (n) q.closestCity = `${n.city.name} yakını`;
        }
      });
      const alertMag = (window.HavaPrefs && window.HavaPrefs.get().quakeAlertMag) || 3.5;
      const newOnes = state.firstLoad ? [] : data.data.filter((q) => !state.knownIds.has(q.id) && q.mag >= alertMag);
      state.raw = data.data;
      state.knownIds = new Set(state.raw.map((q) => q.id));
      state.firstLoad = false;

      $("lastUpdated").textContent = `Son güncelleme: ${window.formatClock(new Date())}`;
      const badge = $("quakeSourceBadge");
      if (badge) badge.innerHTML = `<span class="live-blip"></span> ${data.source === "emsc" ? "EMSC" : "AFAD"} · her 25 sn yenilenir`;

      render(newOnes);
      newOnes.forEach((q) => window.showToast(`Yeni deprem: M${q.mag.toFixed(1)} — ${q.closestCity || q.title}`, { accent: "var(--c-quake)" }));
    } catch { $("lastUpdated").textContent = "Bağlantı hatası, tekrar denenecek…"; }
  }

  function filtered() {
    const minMag = parseFloat($("magRange").value);
    const hours = parseInt($("timeSelect").value, 10);
    const onlyFelt = $("onlyFelt").checked;
    const cutoff = Date.now() - hours * 3600 * 1000;
    const eff = onlyFelt ? Math.max(minMag, 3.0) : minMag;
    return state.raw
      .filter((q) => q.mag >= eff && new Date(q.date.replace(" ", "T")).getTime() >= cutoff)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  function render(newOnes = []) {
    if (!state.raw.length) return;
    const list = filtered();
    renderFeatured();
    renderStats(list);
    if (state.view === "genel") { renderActivity(); renderMiniList(list); renderProvince(list); }
    if (state.view === "harita") renderMap(list, newOnes);
    if (state.view === "liste") renderList(list, newOnes);
    window.hydrateIcons && window.hydrateIcons();
  }

  function setStat(id, v) {
    const el = $(id); if (!el) return;
    const t = String(v);
    if (el.textContent !== t) { el.textContent = t; window.flashUpdate && window.flashUpdate(el); }
  }

  function renderFeatured() {
    const el = $("quakeFeatured");
    const q = [...state.raw].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    if (!q) return;
    el.hidden = false;
    const m = $("qfMag");
    m.textContent = q.mag.toFixed(1);
    m.style.background = magColor(q.mag);
    $("qfTitle").textContent = q.closestCity || q.title;
    $("qfMeta").textContent = `${q.title} · ${q.depth} km derinlik · ${window.timeAgoTR(q.date.replace(" ", "T"))}`;
    const dw = $("qfDist");
    if (state.userPos && q.lat != null) { dw.hidden = false; $("qfDistVal").textContent = `${D.haversineKm(state.userPos, { lat: q.lat, lon: q.lon })} km`; }
    else dw.hidden = true;
  }

  function renderStats(list) {
    if (!list.length) {
      ["statLast", "statMax", "statDepth"].forEach((id) => setStat(id, "—"));
      setStat("statCount", "0");
      $("statLastSub").textContent = "veri yok"; $("statMaxSub").textContent = "—";
      return;
    }
    const last = list[0];
    setStat("statLast", `M${last.mag.toFixed(1)}`);
    lastCity = last.closestCity || last.title;
    lastDate = last.date.replace(" ", "T");
    $("statLastSub").textContent = `${lastCity} · ${window.timeAgoTR(lastDate)}`;
    setStat("statCount", list.length);
    const mx = list.reduce((a, b) => (b.mag > a.mag ? b : a), list[0]);
    setStat("statMax", `M${mx.mag.toFixed(1)}`);
    $("statMaxSub").textContent = mx.closestCity || mx.title;
    setStat("statDepth", (list.reduce((s, q) => s + q.depth, 0) / list.length).toFixed(1));
  }

  function startPulseTicker() {
    setInterval(() => {
      if (!lastDate) return;
      const el = $("statLastSub");
      if (el) el.textContent = `${lastCity} · ${window.timeAgoTR(lastDate)}`;
    }, 1000);
  }

  function renderActivity() {
    const now = new Date();
    const buckets = new Array(24).fill(0);
    const labels = [];
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 3600000);
      labels.push(d.getHours());
    }
    state.raw.forEach((q) => {
      const t = new Date(q.date.replace(" ", "T")).getTime();
      const hoursAgo = Math.floor((now.getTime() - t) / 3600000);
      if (hoursAgo >= 0 && hoursAgo < 24) buckets[23 - hoursAgo]++;
    });
    D.daySeries($("qActivityChart"), buckets.map((v, i) => ({ v, label: i % 4 === 0 ? `${labels[i]}:00` : "" })), { height: 200 });
  }

  function rowHtml(q, i, flash) {
    const color = magColor(q.mag);
    const dist = state.userPos && q.lat != null ? ` · ${D.haversineKm(state.userPos, { lat: q.lat, lon: q.lon })} km uzakta` : "";
    return `<div class="side-row${flash ? " flash" : ""}" style="--i:${Math.min(i, 14)}" data-id="${q.id}" data-lat="${q.lat}" data-lon="${q.lon}">
      <span class="mag-chip" style="background:${color}">${q.mag.toFixed(1)}</span>
      <div class="row-main">
        <div class="row-title">${window.escapeHtml(q.closestCity || q.title)}</div>
        <div class="row-sub">${window.escapeHtml(q.title)} · ${q.depth} km · ${window.timeAgoTR(q.date.replace(" ", "T"))}${dist}</div>
      </div>
    </div>`;
  }
  function renderMiniList(list) {
    $("quakeListMini").innerHTML = list.length
      ? list.slice(0, 40).map((q, i) => rowHtml(q, i)).join("")
      : `<div class="sr-empty" style="padding:20px;color:var(--text-muted);text-align:center">Filtreye uyan deprem yok.</div>`;
    $("quakeListMini").querySelectorAll(".side-row").forEach((row) => row.addEventListener("click", () => { tabs.go("harita"); setTimeout(() => flyTo(row), 200); }));
  }
  function renderList(list, newOnes) {
    const newIds = new Set(newOnes.map((q) => q.id));
    $("sideCount").innerHTML = `<span class="live-blip"></span> ${list.length}`;
    $("quakeList").innerHTML = list.length
      ? list.slice(0, 250).map((q, i) => rowHtml(q, i, newIds.has(q.id))).join("")
      : `<div class="sr-empty" style="padding:24px;color:var(--text-muted);text-align:center">Filtreye uyan deprem bulunamadı.</div>`;
    $("quakeList").querySelectorAll(".side-row").forEach((row) => row.addEventListener("click", () => { tabs.go("harita"); setTimeout(() => flyTo(row), 200); }));
  }
  function flyTo(row) {
    if (!state.map) return;
    state.map.flyTo([+row.dataset.lat, +row.dataset.lon], 8, { duration: 0.8 });
    state.layer.eachLayer((m) => { if (m._qid === row.dataset.id) setTimeout(() => m.openPopup(), 700); });
  }

  function renderProvince(list) {
    const hours = parseInt($("timeSelect").value, 10);
    $("psWindow").textContent = hours === 1 ? "son 1 saat" : hours === 6 ? "son 6 saat" : hours === 72 ? "son 3 gün" : "son 24 saat";
    const counts = new Map();
    list.forEach((q) => { const p = provinceOf(q); if (p) counts.set(p, (counts.get(p) || 0) + 1); });
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, v]) => ({ label, v }));
    $("psCount").innerHTML = `<span class="live-blip"></span> ${counts.size} il`;
    if (!rows.length) { $("provinceBars").innerHTML = `<div class="sr-empty" style="padding:16px;color:var(--text-muted)">İl eşleşmesi yok.</div>`; return; }
    D.bars($("provinceBars"), rows);
  }

  /* ---------------- HARİTA ---------------- */
  function initMap() {
    if (state.mapReady) { setTimeout(() => state.map.invalidateSize(), 60); return; }
    state.mapReady = true;
    state.map = L.map("quakeMap", { scrollWheelZoom: true }).setView([39.0, 35.2], 5.8);
    window.HavaMap.addBaseLayer(state.map);
    state.layer = L.layerGroup().addTo(state.map);
    renderMap(filtered(), []);
  }
  function renderMap(list, newOnes) {
    if (!state.layer) return;
    state.layer.clearLayers();
    const newIds = new Set(newOnes.map((q) => q.id));
    const now = Date.now();
    $("mapCount").innerHTML = `<span class="live-blip"></span> ${list.length}`;
    list.forEach((q) => {
      const size = magSize(q.mag), color = magColor(q.mag);
      const recent = now - new Date(q.date.replace(" ", "T")).getTime() < 3600000;
      const html = `<div class="pulse-marker ${newIds.has(q.id) ? "pop" : ""}">
        ${recent ? `<div class="ring" style="width:${size * 1.8}px;height:${size * 1.8}px;background:${color}22;border:1.5px solid ${color}"></div>` : ""}
        <div class="dot" style="width:${size}px;height:${size}px;background:${color}"></div></div>`;
      const m = L.marker([q.lat, q.lon], { icon: L.divIcon({ className: "", html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }) }).addTo(state.layer);
      m.bindPopup(`<div class="map-pop"><strong>M${q.mag.toFixed(1)} — ${window.escapeHtml(q.closestCity || q.title)}</strong><br/>${window.escapeHtml(q.title)}<br/>Derinlik: ${q.depth} km · ${window.escapeHtml(q.date)}</div>`);
      m._qid = q.id;
      if (newIds.has(q.id)) m.openPopup();
    });
  }

  /* ---------------- 3B KÜRE ---------------- */
  function initGlobe() {
    if (state.globeReady || !window.QuakeGlobe) return;
    state.globeReady = true;
    const globe = window.QuakeGlobe.create("quakeGlobeCanvas");
    if (!globe) return;
    fetch("/api/quakes/history?days=7").then((r) => r.json()).then((data) => {
      const b = $("globeCount");
      if (data.ok) { globe.setQuakes(data.data); b.innerHTML = `<span class="live-blip"></span> ${data.count} deprem (7 gün)`; }
      else b.innerHTML = `<span class="live-blip"></span> veri alınamadı`;
    }).catch(() => { $("globeCount").innerHTML = `<span class="live-blip"></span> bağlantı hatası`; });
  }

  /* ---------------- ZAMAN TÜNELİ ---------------- */
  function initTimeline() {
    if (state.tunelReady) { setTimeout(() => state._tMap && state._tMap.invalidateSize(), 60); return; }
    state.tunelReady = true;
    const sliderEl = $("timelineSlider"), playBtn = $("timelinePlay"), dateEl = $("timelineDate");
    const dayStatEl = $("timelineDayStat"), speedSel = $("timelineSpeed"), countBadge = $("timelineCount");
    const tMap = L.map("timelineMap", { scrollWheelZoom: true }).setView([39.0, 35.2], 5.6);
    state._tMap = tMap;
    window.HavaMap.addBaseLayer(tMap);
    const tLayer = L.layerGroup().addTo(tMap);
    let days = [], playing = false, playTimer = null;

    fetch("/api/quakes/history?days=30").then((r) => r.json()).then((data) => {
      if (!data.ok) { countBadge.innerHTML = `<span class="live-blip"></span> veri alınamadı`; return; }
      days = buckets(data.data, 30);
      sliderEl.max = String(days.length - 1);
      sliderEl.value = String(days.length - 1);
      countBadge.innerHTML = `<span class="live-blip"></span> ${data.count} deprem (30 gün)`;
      renderDay(days.length - 1);
    }).catch(() => { countBadge.innerHTML = `<span class="live-blip"></span> bağlantı hatası`; });

    function buckets(list, n) {
      const map = new Map();
      const today = new Date();
      for (let i = n - 1; i >= 0; i--) { const d = new Date(today); d.setDate(d.getDate() - i); map.set(d.toISOString().slice(0, 10), { key: d.toISOString().slice(0, 10), quakes: [] }); }
      list.forEach((q) => { const k = (q.date || "").slice(0, 10); if (map.has(k)) map.get(k).quakes.push(q); });
      return [...map.values()];
    }
    function magC(m) { return m >= 5 ? "#b0503f" : m >= 3.5 ? "#c07f3a" : m >= 2 ? "#d7a066" : "#dcc08a"; }
    function renderDay(idx) {
      if (!days.length) return;
      idx = Math.max(0, Math.min(idx, days.length - 1));
      const d = new Date(days[idx].key);
      dateEl.textContent = d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
      tLayer.clearLayers();
      let cum = 0, cumMax = null;
      for (let i = 0; i <= idx; i++) days[i].quakes.forEach((q) => {
        cum++; if (!cumMax || q.mag > cumMax.mag) cumMax = q;
        const isToday = i === idx;
        const size = isToday ? Math.max(8, Math.min(28, 6 + q.mag * 3.6)) : Math.max(5, Math.min(16, 4 + q.mag * 2));
        L.circleMarker([q.lat, q.lon], { radius: size / 2, color: magC(q.mag), weight: isToday ? 2 : 0.5, fillColor: magC(q.mag), fillOpacity: isToday ? 0.9 : 0.32 })
          .addTo(tLayer);
      });
      const tc = days[idx].quakes.length;
      const tm = days[idx].quakes.reduce((a, b) => (!a || b.mag > a.mag ? b : a), null);
      dayStatEl.textContent = tc
        ? `${d.toLocaleDateString("tr-TR", { day: "2-digit", month: "long" })}: ${tc} deprem, en büyüğü M${tm.mag.toFixed(1)} (${tm.title}). Birikimli: ${cum}.`
        : `${d.toLocaleDateString("tr-TR", { day: "2-digit", month: "long" })}: bu gün deprem kaydı yok. Birikimli: ${cum}.`;
    }
    sliderEl.addEventListener("input", () => renderDay(parseInt(sliderEl.value, 10)));
    const setBtn = () => { playBtn.innerHTML = `${window.HavaIcon(playing ? "pause" : "play", { size: 14 })} <span>${playing ? "Duraklat" : "Oynat"}</span>`; };
    playBtn.addEventListener("click", () => {
      playing = !playing; setBtn();
      if (playing) { if (+sliderEl.value >= days.length - 1) sliderEl.value = "0"; step(); }
      else clearTimeout(playTimer);
    });
    function step() {
      if (!playing) return;
      const idx = parseInt(sliderEl.value, 10);
      renderDay(idx);
      if (idx >= days.length - 1) { playing = false; setBtn(); return; }
      sliderEl.value = String(idx + 1);
      playTimer = setTimeout(step, parseInt(speedSel.value, 10));
    }
  }

  /* ---------------- İSTATİSTİK ---------------- */
  async function ensureHistory() {
    if (state.hist || state.histLoading) { if (state.hist) renderStatView(); return; }
    state.histLoading = true;
    try {
      const data = await fetch("/api/quakes/history?days=30").then((r) => r.json());
      state.hist = data.ok ? data.data : [];
    } catch { state.hist = []; }
    state.histLoading = false;
    renderStatView();
  }
  function renderStatView() {
    const h = state.hist || [];
    if (!h.length) {
      $("qMagHist").innerHTML = `<div class="sr-empty" style="padding:24px;color:var(--text-muted)">Arşiv verisi alınamadı.</div>`;
      return;
    }
    // büyüklük dağılımı
    const magBins = [
      { label: "0–1.9", v: h.filter((q) => q.mag < 2).length },
      { label: "2–2.9", v: h.filter((q) => q.mag >= 2 && q.mag < 3).length },
      { label: "3–3.9", v: h.filter((q) => q.mag >= 3 && q.mag < 4).length },
      { label: "4–4.9", v: h.filter((q) => q.mag >= 4 && q.mag < 5).length },
      { label: "5+", v: h.filter((q) => q.mag >= 5).length },
    ];
    D.histogram($("qMagHist"), magBins);

    // derinlik dağılımı
    const depthBins = [
      { label: "0–5 km", v: h.filter((q) => q.depth < 5).length },
      { label: "5–10", v: h.filter((q) => q.depth >= 5 && q.depth < 10).length },
      { label: "10–20", v: h.filter((q) => q.depth >= 10 && q.depth < 20).length },
      { label: "20–50", v: h.filter((q) => q.depth >= 20 && q.depth < 50).length },
      { label: "50+ km", v: h.filter((q) => q.depth >= 50).length },
    ];
    D.histogram($("qDepthHist"), depthBins);

    // günlük sayı
    const byDay = new Map();
    const today = new Date();
    for (let i = 29; i >= 0; i--) { const d = new Date(today); d.setDate(d.getDate() - i); byDay.set(d.toISOString().slice(0, 10), 0); }
    h.forEach((q) => { const k = (q.date || "").slice(0, 10); if (byDay.has(k)) byDay.set(k, byDay.get(k) + 1); });
    const dayArr = [...byDay.entries()];
    const dailyAvg = dayArr.reduce((s, [, v]) => s + v, 0) / dayArr.length;
    $("qDailyHint").textContent = `Dönem ortalaması: günde ${dailyAvg.toFixed(1)} deprem`;
    D.daySeries($("qDailyChart"), dayArr.map(([k, v], i) => {
      const d = new Date(k);
      return { v, label: i % 5 === 0 ? `${d.getDate()} ${["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"][d.getMonth()]}` : "" };
    }), { height: 220 });

    // 24 saat kadranı
    const hourCounts = new Array(24).fill(0);
    h.forEach((q) => { const d = new Date(q.date.replace(" ", "T")); if (!isNaN(d)) hourCounts[d.getHours()]++; });
    D.clock24($("qClock"), hourCounts);

    // il sıralaması 30 gün
    const pc = new Map();
    h.forEach((q) => {
      let p = q.closestCity;
      if (!p && window.nearestCity) { const n = window.nearestCity(q.lat, q.lon); if (n) p = n.city.name; }
      p = (p || "").replace(/\s*yakını$/, "").trim();
      if (p) pc.set(p, (pc.get(p) || 0) + 1);
    });
    D.bars($("qProv30"), [...pc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, v]) => ({ label, v })));

    // en büyükler tablosu
    const big = [...h].sort((a, b) => b.mag - a.mag).slice(0, 10);
    $("qBigTable").innerHTML = `<thead><tr><th>Yer</th><th>Büyüklük</th><th>Derinlik</th><th>Tarih</th></tr></thead>
      <tbody>${big.map((q) => `<tr><td>${window.escapeHtml(q.closestCity || q.title)}</td><td>M${q.mag.toFixed(1)}</td><td>${q.depth} km</td><td>${window.escapeHtml((q.date || "").slice(0, 16))}</td></tr>`).join("")}</tbody>`;
  }
})();
