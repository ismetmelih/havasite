// Afet arsivi yazisi: olayin yeri (depremlerde bugunku aktif fay hatlariyla birlikte)
(function () {
  "use strict";
  const COLOR = { deprem: "#f5a524", sel: "#38bdf8", yangin: "#ef4444" };
  document.addEventListener("DOMContentLoaded", () => {
    const y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
    const main = document.getElementById("arMain");
    if (!main || !window.L || !window.HavaProvMap) return;
    const lat = Number(main.dataset.lat), lon = Number(main.dataset.lon), type = main.dataset.type;
    const pm = window.HavaProvMap.create({ el: "arMap", kind: "quake", faults: type === "deprem", noFill: true, maxZoom: 12 });
    pm.map.setView([lat, lon], 7);
    const c = COLOR[type] || "#22d3ee";
    L.circleMarker([lat, lon], { pane: "points", radius: 26, color: c, weight: 2, opacity: 0.55, fill: false, interactive: false }).addTo(pm.points);
    L.circleMarker([lat, lon], { pane: "points", radius: 10, color: "#ffffff", weight: 2.5, fillColor: c, fillOpacity: 1, interactive: false }).addTo(pm.points);
  });
})();
