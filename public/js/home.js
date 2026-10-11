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
  function magColor(m) {
    if (m >= 5) return "#ef4444";
    if (m >= 4) return "#f97316";
    if (m >= 3) return "#f5a524";
    if (m >= 2) return "#22c55e";
    return "#34d399";
  }
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
    const ph = $("phList");
    if (ph) {
      ph.innerHTML = qs.slice(0, 6).map((q) => `<div class="ph-item">${magSq(q.mag)}<div><b>${esc(q.title)}</b><span class="meta">${Number.isFinite(q.depth) ? `${Math.round(q.depth)} km` : ""} · ${ago(quakeTime(q))}</span></div><em>${hhmm(quakeTime(q))}</em></div>`).join("");
    }

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
    if (!el) return;
    try {
      const d = await fetch("/api/fires?days=1").then((r) => r.json());
      el.textContent = d.ok ? `${d.count} ısı noktası` : "—";
    } catch {
      el.textContent = "—";
    }
  }
})();
