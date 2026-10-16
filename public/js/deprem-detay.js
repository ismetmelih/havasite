// Deprem sayfasi (/deprem/<id>): harita (aktif faylarla), 50 km icindeki son 30 gunun depremleri,
// baglanti kopyalama ve telefonun kendi paylasim penceresi.
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (s) => window.escapeHtml(String(s == null ? "" : s));
  const ic = (n) => window.HavaIcon(n, { size: 13 });
  const main = $("qdMain");
  const ID = main.dataset.id;
  const LAT = Number(main.dataset.lat), LON = Number(main.dataset.lon), MAG = Number(main.dataset.mag);
  const TZ = { timeZone: "Europe/Istanbul" };
  const quakeTime = (q) => Date.parse(String(q.date || "").replace(" ", "T") + "+03:00");
  const hhmm = (t) => new Date(t).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", ...TZ });
  const dayShort = (t) => new Date(t).toLocaleDateString("tr-TR", { day: "numeric", month: "short", ...TZ });
  function km(lat1, lon1, lat2, lon2) {
    const r = (d) => (d * Math.PI) / 180;
    const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(a));
  }
  const magSq = (m, type) => `<span class="mag-sq${m >= 4 ? " m-strong" : ""}" style="--m:${window.magTone(m)}">${m.toFixed(1)}<small>${esc(type || "MAG")}</small></span>`;

  let pm = null;
  function setupMap() {
    if (!window.L || !window.HavaProvMap) return;
    pm = window.HavaProvMap.create({ el: "qdMap", kind: "quake", faults: true, noFill: true, maxZoom: 14 });
    pm.map.setView([LAT, LON], 8);
    const tone = window.magTone(MAG);
    L.circleMarker([LAT, LON], { pane: "points", radius: 22, color: tone, weight: 2, opacity: 0.6, fill: false, interactive: false }).addTo(pm.points);
    L.circleMarker([LAT, LON], { pane: "points", radius: 9, color: "#ffffff", weight: 2.5, fillColor: tone, fillOpacity: 1 }).addTo(pm.points);
  }

  async function loadNear() {
    try {
      const res = await fetch("/api/quakes/history?days=30").then((r) => r.json());
      if (!res.ok) throw new Error();
      const near = res.data
        .filter((q) => String(q.id) !== ID && q.lat != null && km(LAT, LON, q.lat, q.lon) <= 50)
        .sort((a, b) => quakeTime(b) - quakeTime(a));
      if (pm) {
        [...near].sort((a, b) => a.mag - b.mag).forEach((q) => {
          L.circleMarker([q.lat, q.lon], { pane: "points", radius: 3 + q.mag * 2, color: "#0b0d11", weight: 1, fillColor: window.magTone(q.mag), fillOpacity: 0.75 })
            .bindPopup(`<div class="map-pop"><strong>${esc(q.magType || "M")} ${q.mag.toFixed(1)} · ${esc(q.title)}</strong><br/>${esc(dayShort(quakeTime(q)))} ${esc(hhmm(quakeTime(q)))}<br/><a href="/deprem/${encodeURIComponent(q.id)}">Ayrıntı ve paylaş →</a></div>`)
            .addTo(pm.points);
        });
      }
      $("qdNear").innerHTML = near.length
        ? near.slice(0, 10).map((q) => {
            const t = quakeTime(q);
            return `<a class="lp-q" href="/deprem/${encodeURIComponent(q.id)}">${magSq(q.mag, q.magType)}
              <div class="lp-q-main"><b>${esc(q.title)}</b>
                <div class="lp-q-meta"><span>${ic("navigation")} ${Math.round(km(LAT, LON, q.lat, q.lon))} km uzakta</span><span>${ic("ruler")} ${Number.isFinite(q.depth) ? `${Math.round(q.depth * 10) / 10} km derinlik` : "—"}</span></div>
              </div>
              <div class="lp-q-time"><b>${esc(hhmm(t))}</b><span>${esc(dayShort(t))}</span></div></a>`;
          }).join("") + (near.length > 10 ? `<p class="il-more-note">50 km içinde son 30 günde toplam ${near.length} deprem; en yeni 10 tanesi gösteriliyor.</p>` : "")
        : '<p class="il-empty">Son 30 günde 50 km içinde başka deprem kaydedilmedi.</p>';
    } catch {
      $("qdNear").innerHTML = '<p class="il-empty">Deprem verisine şu an ulaşılamıyor.</p>';
    }
  }

  function setupShare() {
    const copy = $("qdCopy");
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(copy.dataset.url);
        window.showToast("Bağlantı kopyalandı.", { accent: "var(--status-good)" });
      } catch {
        window.showToast(copy.dataset.url, { duration: 6000 });
      }
    });
    // telefonda sistemin paylasim penceresi (WhatsApp, Mesajlar vb. hepsi tek yerde)
    const native = $("qdNative");
    if (navigator.share) {
      native.hidden = false;
      native.addEventListener("click", () => navigator.share({ title: native.dataset.title, text: native.dataset.title, url: native.dataset.url }).catch(() => {}));
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("year") && ($("year").textContent = new Date().getFullYear());
    setupShare();
    setupMap();
    loadNear();
  });
})();
