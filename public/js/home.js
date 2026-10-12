// Ana sayfa: canli Turkiye haritasi, "Su an Turkiye" panosu, son depremler,
// model karsilastirmasi.
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (s) => window.escapeHtml(String(s == null ? "" : s));
  const AY = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

  // ortak veri (harita, pano ve onizleme ayni veriyi kullanir)
  const data = { temps: null, quakes: null, fires: null };

  document.addEventListener("DOMContentLoaded", () => {
    initMap();
    loadTemps();
    loadQuakes();
    loadFires();
    loadModels();
    loadPhoneWeather();
    setInterval(loadQuakes, 60000);
    setInterval(loadFires, 5 * 60000);

    document.querySelectorAll("[data-install]").forEach((b) => b.addEventListener("click", () => window.HavaInstall && window.HavaInstall.prompt()));
  });

  /* ---------------- yardimcilar ---------------- */
  // AFAD tarihi Turkiye saatiyle "YYYY-MM-DD HH:MM:SS"
  const quakeTime = (q) => Date.parse(String(q.date || "").replace(" ", "T") + "+03:00");
  function ago(t) {
    const m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 1) return "az önce";
    if (m < 60) return `${m} dk önce`;
    const h = Math.round(m / 60);
    return h < 24 ? `${h} sa önce` : `${Math.round(h / 24)} gün önce`;
  }
  const hhmm = (t) => new Date(t).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
  const dayLabel = (t) => { const d = new Date(new Date(t).toLocaleString("en-US", { timeZone: "Europe/Istanbul" })); return `${d.getDate()} ${AY[d.getMonth()]}`; };
  const magColor = (m) => window.magTone(m);
  const magSq = (m, type) => `<span class="mag-sq${m >= 4 ? " m-strong" : ""}" style="--m:${magColor(m)}">${m.toFixed(1)}<small>${esc(type || "MAG")}</small></span>`;
  const TEMP_STOPS = [[-10, [124, 92, 214]], [0, [64, 132, 232]], [8, [45, 182, 214]], [15, [72, 196, 140]], [21, [226, 206, 80]], [27, [242, 146, 52]], [34, [226, 64, 64]], [40, [168, 34, 74]]];
  function tempColor(v) {
    const s = TEMP_STOPS;
    if (v <= s[0][0]) return `rgb(${s[0][1]})`;
    for (let i = 0; i < s.length - 1; i++) {
      const [x0, c0] = s[i], [x1, c1] = s[i + 1];
      if (v <= x1) { const t = (v - x0) / (x1 - x0); return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * t))})`; }
    }
    return `rgb(${s[s.length - 1][1]})`;
  }
  const provinceOf = (q) => (q.closestCity || "").replace(/\s*yakını$/, "").trim() || (q.title.match(/\(([^)]+)\)\s*$/) || [])[1] || q.title;

  /* ---------------- canli Turkiye haritasi ---------------- */
  const map = { geo: null, layer: "temp", auto: true, timer: null };
  async function initMap() {
    const box = $("tmMap");
    if (!box) return;
    try { map.geo = await fetch("/data/tr-iller-svg.json").then((r) => r.json()); } catch { $("tmCap").textContent = "Harita yüklenemedi."; return; }
    const g = map.geo;
    box.innerHTML = `<svg viewBox="-6 -6 ${g.w + 12} ${g.h + 12}" preserveAspectRatio="xMidYMid meet">
      <g class="tm-provs">${g.p.map((p) => `<path d="${p.d}" data-n="${esc(p.n)}"></path>`).join("")}</g>
      <path class="tm-faults" d=""></path><g class="tm-fires"></g><g class="tm-quakes"></g>
    </svg>`;
    document.querySelectorAll(".tm-layers button").forEach((b) => b.addEventListener("click", () => { map.auto = false; setLayer(b.dataset.layer); }));
    map.timer = setInterval(() => {
      if (!map.auto) return clearInterval(map.timer);
      const order = ["temp", "quake", "fire"];
      setLayer(order[(order.indexOf(map.layer) + 1) % order.length]);
    }, 6500);
    setLayer("temp");
    paintTemps(); drawQuakes(); drawFires();
    // aktif fay hatlari (GEM, CC BY-SA 4.0): deprem katmaninda gorunur
    fetch("/data/tr-faults-svg.json").then((r) => r.json()).then((f) => { const el = box.querySelector(".tm-faults"); if (el) el.setAttribute("d", f.d); }).catch(() => {});
  }
  const proj = (lat, lon) => { const g = map.geo; return [(lon - g.lon0) * g.k * g.c, (g.lat0 - lat) * g.k]; };
  function setLayer(l) {
    map.layer = l;
    const box = $("tmMap");
    if (box) box.dataset.layer = l;
    document.querySelectorAll(".tm-layers button").forEach((b) => { const on = b.dataset.layer === l; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); });
    caption();
  }
  function caption() {
    const el = $("tmCap");
    if (!el) return;
    if (map.layer === "temp") {
      const t = data.temps;
      el.innerHTML = t ? `<b>81 ilin anlık sıcaklığı</b> · en sıcak ${esc(t.hot.name)} ${Math.round(t.hot.t)}°, en soğuk ${esc(t.cold.name)} ${Math.round(t.cold.t)}°` : "81 ilin sıcaklığı yükleniyor…";
    } else if (map.layer === "quake") {
      const q = data.quakes;
      el.innerHTML = q ? `<b>Son 24 saatte ${q.day.length} deprem</b>${q.max ? ` · en büyüğü M${q.max.mag.toFixed(1)} ${esc(provinceOf(q.max))}` : ""} · <span class="tm-fault-key">kırmızı çizgiler: fay hatları</span>` : "Depremler yükleniyor…";
    } else {
      const f = data.fires;
      el.innerHTML = f ? `<b>Son 24 saatte ${f.count} ısı noktası</b>${f.top ? ` · en çok ${esc(f.top[0])} (${f.top[1]})` : ""}` : "Uydu verisi yükleniyor…";
    }
  }
  function paintTemps() {
    if (!map.geo || !data.temps) return;
    const byName = data.temps.byName;
    document.querySelectorAll("#tmMap .tm-provs path").forEach((p) => {
      const v = byName.get(p.dataset.n);
      if (v != null) p.style.setProperty("--f", tempColor(v));
    });
    caption();
  }
  function drawQuakes() {
    const g = document.querySelector("#tmMap .tm-quakes");
    if (!g || !data.quakes) return;
    const latest = data.quakes.day[0];
    g.innerHTML = data.quakes.day.slice().reverse().map((q) => {
      const [x, y] = proj(q.lat, q.lon);
      const r = 4 + q.mag * 3;
      return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" style="--m:${magColor(q.mag)}"></circle>`;
    }).join("") + (latest ? (() => { const [x, y] = proj(latest.lat, latest.lon); return `<circle class="tm-ping" cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="10"></circle>`; })() : "");
    caption();
  }
  function drawFires() {
    const g = document.querySelector("#tmMap .tm-fires");
    if (!g || !data.fires) return;
    g.innerHTML = data.fires.points.slice(0, 900).map((f) => { const [x, y] = proj(f.lat, f.lon); return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${f.frp >= 15 ? 5 : 3.2}"></circle>`; }).join("");
    caption();
  }

  /* ---------------- veri ---------------- */
  async function loadTemps() {
    try {
      const d = await window.HavaCityWeather();
      const arr = d.data.filter((x) => Number.isFinite(x.temp)).map((x) => ({ name: x.name, t: x.temp }));
      if (!arr.length) return;
      const hot = arr.reduce((a, b) => (b.t > a.t ? b : a)), cold = arr.reduce((a, b) => (b.t < a.t ? b : a));
      data.temps = { byName: new Map(arr.map((x) => [x.name, x.t])), hot, cold };
      $("puHot").textContent = `${hot.name} ${Math.round(hot.t)}°`;
      $("puCold").textContent = `${cold.name} ${Math.round(cold.t)}°`;
      paintTemps();
    } catch { /* sessiz */ }
  }

  async function loadQuakes() {
    let res;
    try { res = await fetch("/api/quakes?limit=200").then((r) => r.json()); } catch { res = null; }
    const list = $("lpQuakes");
    if (!res || !res.ok || !res.data.length) {
      if (list) list.innerHTML = `<div class="lp-q"><div class="lp-q-main"><b>Deprem verisine şu an ulaşılamıyor.</b><div class="lp-q-meta">Birazdan kendiliğinden yeniden denenecek.</div></div></div>`;
      return;
    }
    const qs = res.data;
    const now = Date.now();
    const day = qs.filter((q) => now - quakeTime(q) < 864e5 && q.lat != null);
    const max = day.length ? day.reduce((a, b) => (b.mag > a.mag ? b : a)) : null;
    data.quakes = { day, max };
    const ic = (n) => window.HavaIcon(n, { size: 13 });

    if (list) {
      list.innerHTML = qs.slice(0, 5).map((q) => {
        const t = quakeTime(q);
        return `<a class="lp-q" href="deprem.html?v=liste">
          ${magSq(q.mag, q.magType)}
          <div class="lp-q-main">
            <b>${esc(q.title)}</b>
            <div class="lp-q-meta">
              ${q.neighborhood ? `<span>${ic("home")} ${esc(q.neighborhood)} Mah.</span>` : ""}
              <span>${ic("ruler")} ${Number.isFinite(q.depth) ? `${Math.round(q.depth * 10) / 10} km derinlik` : "derinlik —"}</span>
              <span>${ic("clock")} ${ago(t)}</span>
              <span class="lp-q-coord">${ic("map-pin")} ${q.lat.toFixed(2)}, ${q.lon.toFixed(2)}</span>
            </div>
          </div>
          <div class="lp-q-time"><b>${hhmm(t)}</b><span>${dayLabel(t)}</span></div>
        </a>`;
      }).join("");
      $("lpUpdated").textContent = `Son güncelleme ${new Date(res.updated || Date.now()).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })} · Kaynak: ${res.source === "emsc" ? "EMSC" : "AFAD"}`;
    }

    const last = qs[0];
    $("puQuake").innerHTML = `M${last.mag.toFixed(1)} ${esc(provinceOf(last))}<small>${ago(quakeTime(last))}</small>`;
    $("puQuakeMax").textContent = max ? `M${max.mag.toFixed(1)} ${provinceOf(max)}` : "—";
    if ($("pnQuake")) $("pnQuake").textContent = `M${last.mag.toFixed(1)} · ${provinceOf(last)}`;

    drawQuakes();
  }

  async function loadFires() {
    try {
      const d = await fetch("/api/fires?days=1").then((r) => r.json());
      if ($("pnFire")) $("pnFire").textContent = d.ok ? `${d.count} ısı noktası` : "—";
      if (!d.ok || !Array.isArray(d.data)) { $("puFire").textContent = "—"; return; }
      const cc = new Map();
      d.data.forEach((f) => { const n = window.nearestCity && window.nearestCity(f.lat, f.lon); if (n) cc.set(n.city.name, (cc.get(n.city.name) || 0) + 1); });
      const top = [...cc.entries()].sort((a, b) => b[1] - a[1]);
      data.fires = { count: d.count, points: d.data, top: top[0] || null };
      $("puFire").textContent = top[0] ? `${top[0][0]} · ${top[0][1]} nokta` : "tespit yok";
      drawFires();
    } catch {
      if ($("pnFire")) $("pnFire").textContent = "—";
    }
  }

  /* ---------------- 6 model: Ankara yarin en yuksek ---------------- */
  const MODELS = [
    ["ecmwf_ifs025", "ECMWF", "Avrupa"], ["gfs_seamless", "GFS", "ABD"], ["icon_seamless", "ICON", "Almanya"],
    ["meteofrance_seamless", "ARPEGE", "Fransa"], ["gem_seamless", "GEM", "Kanada"], ["ukmo_seamless", "UKMO", "İngiltere"],
  ];
  async function loadModels() {
    if (!$("mcCard")) return;
    try {
      const d = await fetch("/api/weather/models").then((r) => r.json());
      if (!d.ok) throw new Error("model yok");
      const vals = MODELS.map(([id, name, land]) => ({ name, land, v: (d.daily[`temperature_2m_max_${id}`] || [])[1] })).filter((m) => Number.isFinite(m.v));
      if (vals.length < 3) throw new Error("az model");
      const lo = Math.min(...vals.map((m) => m.v)), hi = Math.max(...vals.map((m) => m.v));
      const mean = vals.reduce((s, m) => s + m.v, 0) / vals.length;
      const pad = Math.max(1.5, (hi - lo) * 0.25), a = lo - pad, b = hi + pad;
      const pos = (v) => ((v - a) / (b - a)) * 100;
      $("mcStrip").innerHTML = `<div class="mc-axis"></div><span class="mc-band" style="left:${pos(lo)}%;width:${pos(hi) - pos(lo)}%"></span>` +
        vals.map((m, i) => `<span class="mc-dot" style="left:${pos(m.v)}%;--d:${i * 90}ms" title="${m.name} ${m.v.toFixed(1)}°"></span>`).join("") +
        `<span class="mc-mean" style="left:${pos(mean)}%"><b>${mean.toFixed(1)}°</b></span>` +
        `<span class="mc-tick" style="left:0">${Math.round(a)}°</span><span class="mc-tick" style="left:100%">${Math.round(b)}°</span>`;
      $("mcRows").innerHTML = vals.map((m) => `<div class="mc-row"><b>${m.name}</b><span>${m.land}</span><i>${m.v.toFixed(1)}°</i></div>`).join("");
      const spread = hi - lo;
      const ag = spread <= 2 ? ["Yüksek uyum", "ok"] : spread <= 4 ? ["Orta uyum", "warn"] : ["Düşük uyum", "bad"];
      const badge = $("mcAgree");
      badge.textContent = ag[0];
      badge.className = `badge mc-agree ${ag[1]}`;
      $("mcFoot").textContent = `Modeller arası fark ${spread.toFixed(1)}° · ortalama ${mean.toFixed(1)}°`;
    } catch {
      $("mcFoot").textContent = "Model verisine şu an ulaşılamadı.";
    }
  }

  /* ---------------- panel ozeti: Ankara'nin anlik havasi ---------------- */
  async function loadPhoneWeather() {
    try {
      const d = await window.HavaCityWeather();
      const ank = d.byName.get("Ankara");
      if (ank && $("pnWx") && window.WeatherWMO) $("pnWx").textContent = `${Math.round(ank.temp)}°C · ${window.WeatherWMO.label(ank.code)}`;
    } catch { /* sessiz */ }
  }
})();
