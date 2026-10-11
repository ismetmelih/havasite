// Ana sayfa: canli onizlemeler (son depremler, telefon gorseli, panel ozetleri).
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (s) => window.escapeHtml(String(s == null ? "" : s));
  const AY = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

  document.addEventListener("DOMContentLoaded", () => {
    tickClock();
    setInterval(tickClock, 15000);
    loadQuakes();
    loadWeather();
    loadFires();
    loadPhoneWeather();
    setInterval(() => showPhoneTab((phTab + 1) % PH_TABS.length), 4800);
    setInterval(loadQuakes, 60000);
    setInterval(loadFires, 5 * 60000);

    document.querySelectorAll("[data-install]").forEach((b) => b.addEventListener("click", () => window.HavaInstall && window.HavaInstall.prompt()));
    document.querySelectorAll("[data-open-emergency]").forEach((b) => b.addEventListener("click", () => { const f = $("emergencyFab"); if (f) f.click(); }));
  });

  function tickClock() {
    const el = $("phClock");
    if (el) el.textContent = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
  }

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
  const magSq = (m) => `<span class="mag-sq${m >= 4 ? " m-strong" : ""}" style="--m:${magColor(m)}">${m.toFixed(1)}<small>MAG</small></span>`;

  async function loadQuakes() {
    let data;
    try { data = await fetch("/api/quakes?limit=60").then((r) => r.json()); } catch { data = null; }
    const list = $("lpQuakes");
    if (!data || !data.ok || !data.data.length) {
      if (list) list.innerHTML = `<div class="lp-q"><div class="lp-q-main"><b>Deprem verisine şu an ulaşılamıyor.</b><div class="lp-q-meta">Birazdan kendiliğinden yeniden denenecek.</div></div></div>`;
      return;
    }
    const qs = data.data;
    const ic = (n) => window.HavaIcon(n, { size: 13 });

    if (list) {
      list.innerHTML = qs.slice(0, 5).map((q) => {
        const t = quakeTime(q);
        return `<a class="lp-q" href="deprem.html?v=liste">
          ${magSq(q.mag)}
          <div class="lp-q-main">
            <b>${esc(q.title)}</b>
            <div class="lp-q-meta">
              <span>${ic("ruler")} ${Number.isFinite(q.depth) ? `${Math.round(q.depth * 10) / 10} km derinlik` : "derinlik —"}</span>
              <span>${ic("clock")} ${ago(t)}</span>
              <span class="lp-q-coord">${ic("map-pin")} ${q.lat.toFixed(2)}, ${q.lon.toFixed(2)}</span>
            </div>
          </div>
          <div class="lp-q-time"><b>${hhmm(t)}</b><span>${dayLabel(t)}</span></div>
        </a>`;
      }).join("");
      const up = $("lpUpdated");
      if (up) up.textContent = `Son güncelleme ${new Date(data.updated || Date.now()).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })}`;
    }

    // telefon onizlemesi: son 6 deprem
    phData.quake = qs.slice(0, 6).map((q) => `<div class="ph-item">${magSq(q.mag)}<div><b>${esc(q.title)}</b><span class="meta">${Number.isFinite(q.depth) ? `${Math.round(q.depth)} km` : ""} · ${ago(quakeTime(q))}</span></div><em>${hhmm(quakeTime(q))}</em></div>`).join("");
    if (phTab === 0) $("phList").innerHTML = phData.quake;

    // yuzen bildirim: son 24 saatin en buyugu
    const day = qs.filter((q) => Date.now() - quakeTime(q) < 24 * 3600 * 1000);
    const big = (day.length ? day : qs).reduce((a, b) => (b.mag > a.mag ? b : a));
    if ($("phNotifText")) $("phNotifText").textContent = `M${big.mag.toFixed(1)} deprem — ${big.title}, ${ago(quakeTime(big))}.`;
    if ($("phMag")) $("phMag").innerHTML = `${big.mag.toFixed(1)}<small>Mw</small>`;

    const pn = $("pnQuake");
    if (pn) pn.textContent = `M${qs[0].mag.toFixed(1)} · ${qs[0].closestCity || qs[0].title}`;
  }

  async function loadWeather() {
    try {
      const d = await fetch("https://api.open-meteo.com/v1/forecast?latitude=39.9208&longitude=32.8541&current=temperature_2m,weather_code&timezone=Europe%2FIstanbul").then((r) => r.json());
      const t = Math.round(d.current.temperature_2m);
      const label = window.WeatherWMO ? window.WeatherWMO.label(d.current.weather_code) : "";
      if ($("phWxT")) $("phWxT").textContent = `${t}°C`;
      if ($("phWxD")) $("phWxD").textContent = label.toLowerCase() || "şu an";
      if ($("pnWx")) $("pnWx").textContent = `${t}°C${label ? ` · ${label}` : ""}`;
    } catch {
      if ($("pnWx")) $("pnWx").textContent = "—";
    }
  }

  async function loadFires() {
    const el = $("pnFire");
    try {
      const d = await fetch("/api/fires?days=1").then((r) => r.json());
      if (el) el.textContent = d.ok ? `${d.count} ısı noktası` : "—";
      // telefon onizlemesi: en cok tespit olan 6 il
      if (d.ok && Array.isArray(d.data) && window.nearestCity) {
        const cc = new Map();
        d.data.forEach((f) => { const n = window.nearestCity(f.lat, f.lon); if (n) cc.set(n.city.name, (cc.get(n.city.name) || 0) + 1); });
        phData.fire = [...cc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) =>
          `<div class="ph-item"><span class="mag-sq${v >= 20 ? " m-strong" : ""}" style="--m:${v >= 20 ? "#ef4444" : "#f97316"}">${v}<small>NOKTA</small></span><div><b>${esc(k)}</b><span class="meta">son 24 saat · uydu tespiti</span></div><em>NASA</em></div>`).join("");
      }
    } catch {
      if (el) el.textContent = "—";
    }
  }

  // telefon onizlemesi: depremler -> hava -> yangin arasinda doner
  const PH_TABS = ["quake", "weather", "fire"];
  const phData = { quake: "", weather: "", fire: "" };
  let phTab = 0;
  function showPhoneTab(i) {
    const list = $("phList");
    if (!list || !phData[PH_TABS[i]]) return;
    phTab = i;
    document.querySelectorAll(".ph-tabs span").forEach((t, j) => t.classList.toggle("on", j === i));
    list.classList.add("swap");
    setTimeout(() => { list.innerHTML = phData[PH_TABS[i]]; list.classList.remove("swap"); }, 230);
  }
  const PH_CITIES = [["İstanbul", 41.01, 28.95], ["Ankara", 39.92, 32.85], ["İzmir", 38.42, 27.14], ["Antalya", 36.9, 30.71], ["Trabzon", 41.0, 39.72], ["Van", 38.5, 43.38]];
  async function loadPhoneWeather() {
    try {
      const d = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${PH_CITIES.map((c) => c[1]).join(",")}&longitude=${PH_CITIES.map((c) => c[2]).join(",")}&current=temperature_2m,weather_code,is_day,relative_humidity_2m&timezone=Europe%2FIstanbul`).then((r) => r.json());
      const arr = Array.isArray(d) ? d : [d];
      phData.weather = arr.map((x, i) => {
        const c = x.current; if (!c) return "";
        const icon = window.WeatherWMO ? window.WeatherWMO.svg(c.weather_code, c.is_day === 1) : "";
        const label = window.WeatherWMO ? window.WeatherWMO.label(c.weather_code) : "";
        return `<div class="ph-item"><span class="ph-wx">${icon}</span><div><b>${PH_CITIES[i][0]}</b><span class="meta">${esc(label)} · nem %${Math.round(c.relative_humidity_2m)}</span></div><em class="ph-t">${Math.round(c.temperature_2m)}°</em></div>`;
      }).join("");
    } catch { /* sessiz */ }
  }
})();
