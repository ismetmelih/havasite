/* =========================================================================
   Dash — paylaşılan panel yardımcıları (bölümlü sayfa + SVG grafikler)
   deprem ve yangın sayfaları kullanır.
   ========================================================================= */
window.Dash = (function () {
  "use strict";

  const round = Math.round;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---- sekme yönetimi ---- */
  function setupTabs(sel, onSwitch) {
    const btns = [...document.querySelectorAll(sel + " .dash-tab")];
    function go(v, push) {
      btns.forEach((b) => b.classList.toggle("active", b.dataset.view === v));
      document.querySelectorAll(".dash-view").forEach((s) => s.classList.toggle("is-active", s.id === `view-${v}`));
      if (push !== false) { try { history.replaceState(null, "", v === btns[0].dataset.view ? location.pathname : `?v=${v}`); } catch {} }
      onSwitch && onSwitch(v);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    btns.forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));
    return { go, initial: () => {
      const want = (new URLSearchParams(location.search).get("v") || location.hash.slice(1) || "").toLowerCase();
      const valid = btns.some((b) => b.dataset.view === want);
      const v = valid ? want : btns[0].dataset.view;
      btns.forEach((b) => b.classList.toggle("active", b.dataset.view === v));
      document.querySelectorAll(".dash-view").forEach((s) => s.classList.toggle("is-active", s.id === `view-${v}`));
      return v;
    }};
  }

  /* ---- renk skalası ---- */
  function lerp(a, b, t) { return a.map((v, i) => round(v + (b[i] - v) * t)); }
  function rgb(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }
  function scale(stops, v) {
    if (v <= stops[0][0]) return rgb(stops[0][1]);
    if (v >= stops[stops.length - 1][0]) return rgb(stops[stops.length - 1][1]);
    for (let i = 0; i < stops.length - 1; i++) {
      const [x0, c0] = stops[i], [x1, c1] = stops[i + 1];
      if (v >= x0 && v <= x1) return rgb(lerp(c0, c1, (v - x0) / (x1 - x0)));
    }
    return rgb(stops[0][1]);
  }

  function catmullRom(pts) {
    if (pts.length < 2) return "";
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
    }
    return d;
  }

  /* ---- yay gauge (270°) ---- */
  function arcGauge(value, min, max, stops) {
    const a0 = 135, a1 = 405;
    const frac = clamp((value - min) / (max - min), 0, 1);
    const R = 46, cx = 60, cy = 60;
    const pol = (deg) => [cx + R * Math.cos(deg * Math.PI / 180), cy + R * Math.sin(deg * Math.PI / 180)];
    const [sx, sy] = pol(a0), [ex, ey] = pol(a1), [px, py] = pol(a0 + frac * (a1 - a0));
    let segs = "";
    for (let i = 0; i < stops.length; i++) {
      const f0 = clamp((stops[i][0] - min) / (max - min), 0, 1);
      const f1 = i + 1 < stops.length ? clamp((stops[i + 1][0] - min) / (max - min), 0, 1) : 1;
      if (f1 <= f0) continue;
      const [ax, ay] = pol(a0 + f0 * (a1 - a0)), [bx, by] = pol(a0 + f1 * (a1 - a0));
      const large = (f1 - f0) * 270 > 180 ? 1 : 0;
      segs += `<path d="M${ax.toFixed(1)},${ay.toFixed(1)} A${R},${R} 0 ${large} 1 ${bx.toFixed(1)},${by.toFixed(1)}" stroke="${stops[i][1]}" class="dg-seg"/>`;
    }
    return `<svg viewBox="0 0 120 120" class="dg">
      <path d="M${sx.toFixed(1)},${sy.toFixed(1)} A${R},${R} 0 1 1 ${ex.toFixed(1)},${ey.toFixed(1)}" class="dg-track-arc"/>
      ${segs}<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="6" class="dg-dot"/>
    </svg>`;
  }

  function ringFill(pct, color) {
    const r = 42, cir = 2 * Math.PI * r;
    return `<svg viewBox="0 0 120 120" class="dg">
      <circle cx="60" cy="60" r="${r}" class="dg-ring-track"/>
      <circle cx="60" cy="60" r="${r}" class="dg-ring-fill" transform="rotate(-90 60 60)"
        stroke-dasharray="${(cir * clamp(pct, 0, 100) / 100).toFixed(1)} ${cir.toFixed(1)}"${color ? ` stroke="${color}"` : ""}/>
    </svg>`;
  }

  // sayfa temasina gore grafik rengi (deprem: turuncu, yangin: kirmizi)
  function pageColor() {
    if (document.body.classList.contains("fire-body")) return "var(--c-fire)";
    if (document.body.classList.contains("quake-body")) return "var(--c-quake)";
    return "var(--accent)";
  }

  /* ---- histogram (Chart.js cubuk) ---- */
  function histogram(el, bins, opts) {
    opts = opts || {};
    window.HavaChart.bar(el, {
      labels: bins.map((b) => b.label),
      data: bins.map((b) => b.v),
      color: opts.color || pageColor(),
      label: opts.label || "Adet",
      height: opts.height || 230,
      integer: true,
    });
  }

  /* ---- gun gun / saat saat alan grafigi (Chart.js) ---- */
  function daySeries(el, points, opts) {
    opts = opts || {};
    window.HavaChart.line(el, {
      labels: points.map((p) => p.label),
      datasets: [{ label: opts.label || "Adet", data: points.map((p) => p.v), color: opts.color || pageColor(), fill: true }],
      height: opts.height || 240,
      beginAtZero: true,
      integer: true,
      decimals: 0,
    });
  }

  /* ---- 24 saatlik kadran ---- */
  function clock24(el, counts, opts) {
    opts = opts || {};
    const cx = 110, cy = 110, R = 88, r0 = 42;
    const max = Math.max(1, ...counts);
    let spokes = "", bars = "", lbls = "";
    for (let h = 0; h < 24; h++) {
      const ang = (h / 24) * 2 * Math.PI - Math.PI / 2;
      const len = r0 + (counts[h] / max) * (R - r0);
      const x1 = cx + r0 * Math.cos(ang), y1 = cy + r0 * Math.sin(ang);
      const x2 = cx + len * Math.cos(ang), y2 = cy + len * Math.sin(ang);
      bars += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="clk-bar" stroke-width="5" opacity="${0.35 + 0.65 * (counts[h] / max)}"/>`;
      if (h % 6 === 0) {
        const lx = cx + (R + 12) * Math.cos(ang), ly = cy + (R + 12) * Math.sin(ang);
        lbls += `<text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" class="clk-lbl">${String(h).padStart(2, "0")}</text>`;
      }
    }
    const total = counts.reduce((s, v) => s + v, 0);
    const peak = counts.indexOf(Math.max(...counts));
    el.innerHTML = `<svg viewBox="0 0 220 220" class="dash-clock">
      <circle cx="${cx}" cy="${cy}" r="${R}" class="clk-track"/>
      <circle cx="${cx}" cy="${cy}" r="${r0}" class="clk-track"/>
      ${bars}${lbls}
      <text x="${cx}" y="${cy - 2}" class="clk-center">${String(peak).padStart(2, "0")}:00</text>
      <text x="${cx}" y="${cy + 14}" class="clk-center-sub">en yoğun saat</text>
    </svg>`;
  }

  /* ---- donut ---- */
  function donut(el, segments, centerBig, centerSmall) {
    const total = segments.reduce((s, x) => s + x.v, 0) || 1;
    const r = 46, cir = 2 * Math.PI * r;
    let offset = -90, arcs = "";
    segments.forEach((s) => {
      const len = (s.v / total) * cir;
      arcs += `<circle cx="60" cy="60" r="${r}" class="dd-seg" stroke="${s.color}" transform="rotate(${offset} 60 60)" stroke-dasharray="${len.toFixed(1)} ${cir.toFixed(1)}"/>`;
      offset += (s.v / total) * 360;
    });
    el.innerHTML = `<div class="dash-donut-body">
      <svg viewBox="0 0 120 120" class="dash-donut-svg"><circle cx="60" cy="60" r="${r}" class="dd-track"/>${arcs}
        <text x="60" y="56" class="dd-big">${centerBig}</text><text x="60" y="72" class="dd-small">${centerSmall || ""}</text></svg>
      <ul class="dash-donut-legend">${segments.map((s) => `<li><span class="dl-dot" style="background:${s.color}"></span> ${s.label} <strong>${s.v}</strong></li>`).join("")}</ul>
    </div>`;
  }

  function bars(el, rows, opts) {
    opts = opts || {};
    const max = Math.max(1, ...rows.map((r) => r.v));
    el.innerHTML = `<div class="province-bars">${rows.map((r) => `
      <div class="pb-row">
        <span class="pb-name">${window.escapeHtml(r.label)}</span>
        <span class="pb-track"><span class="pb-fill${opts.fire ? " pb-fill-fire" : ""}" style="width:${Math.max((r.v / max) * 100, 4)}%"></span></span>
        <span class="pb-count">${r.v}</span>
      </div>`).join("")}</div>`;
  }

  function miniLine(el, vals, color) {
    if (!vals.length) { el.innerHTML = ""; return; }
    const W = 240, H = 64;
    let mn = Math.min(...vals), mx = Math.max(...vals); if (mx - mn < 1) { mx += 1; mn -= 1; }
    const x = (i) => (i / (vals.length - 1)) * W;
    const y = (v) => 6 + (1 - (v - mn) / (mx - mn)) * (H - 12);
    const pts = vals.map((v, i) => [x(i), y(v)]);
    const line = catmullRom(pts);
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="dash-mini" preserveAspectRatio="none">
      <path d="${line} L${W},${H} L0,${H} Z" fill="${color}" opacity="0.14"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
    </svg>`;
  }

  function haversineKm(a, b) {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLon = ((b.lon - a.lon) * Math.PI) / 180;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(s)));
  }

  return { setupTabs, scale, catmullRom, arcGauge, ringFill, histogram, daySeries, clock24, donut, bars, miniLine, haversineKm, round, clamp };
})();
