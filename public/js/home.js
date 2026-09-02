(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("year").textContent = new Date().getFullYear();

    tickClock();
    setInterval(tickClock, 1000);

    loadWeatherChip();
    loadQuakeChip();
    loadFireChip();
    setInterval(loadQuakeChip, 45000);
    setInterval(loadFireChip, 5 * 60000);
  });

  function tickClock() {
    const el = document.getElementById("tkClock");
    if (el) el.textContent = window.formatClock(new Date());
  }

  async function loadWeatherChip() {
    const el = document.getElementById("tkWeather");
    try {
      const r = await fetch(
        "https://api.open-meteo.com/v1/forecast?latitude=39.9208&longitude=32.8541&current=temperature_2m,weather_code&timezone=Europe%2FIstanbul"
      );
      const data = await r.json();
      const t = Math.round(data.current.temperature_2m);
      el.textContent = `${t}°C`;
    } catch {
      el.textContent = "—";
    }
  }

  async function loadQuakeChip() {
    const el = document.getElementById("tkQuake");
    try {
      const r = await fetch("/api/quakes?limit=1");
      const data = await r.json();
      if (data.ok && data.data.length) {
        const q = data.data[0];
        el.textContent = `M${q.mag.toFixed(1)} · ${q.closestCity || q.title}`;
      } else {
        el.textContent = "veri yok";
      }
    } catch {
      el.textContent = "—";
    }
  }

  async function loadFireChip() {
    const el = document.getElementById("tkFire");
    try {
      const r = await fetch("/api/fires?days=1");
      const data = await r.json();
      if (data.ok) {
        el.textContent = `${data.count} nokta`;
      } else if (data.reason === "no_key") {
        el.textContent = "anahtar gerekli";
      } else {
        el.textContent = "—";
      }
    } catch {
      el.textContent = "—";
    }
  }
})();
