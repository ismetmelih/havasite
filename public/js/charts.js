// Ortak grafik katmani (Chart.js 4 — js/vendor/chart.umd.min.js, MIT).
// Tum sayfalardaki cizgi/alan/cubuk grafikleri buradan cizilir: eksenler, birimler,
// izgara, dokunmatik/fare ipucu ve tema renkleri tek yerde.
//
// Kullanim: HavaChart.line(el, {...}), HavaChart.bar(el, {...}), HavaChart.rain(el, {...})
// "el" bir kapsayici <div>; grafik yeniden cizildiginde eskisi temizlenir.
window.HavaChart = (function () {
  const registry = new Set();

  function css(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function theme() {
    return {
      text: css("--text-secondary", "#a3b3cc"),
      muted: css("--text-muted", "#6f82a0"),
      grid: css("--chart-grid", "rgba(140,170,230,0.10)"),
      tipBg: css("--surface-2", "#16223d"),
      tipText: css("--text-primary", "#e8eef8"),
      border: css("--border-strong", "rgba(110,150,230,0.28)"),
      font: css("--font", "system-ui"),
    };
  }

  function withAlpha(color, a) {
    // "#rrggbb" -> rgba(); diger bicimler oldugu gibi (color-mix ile)
    const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
    if (!m) return `color-mix(in srgb, ${color} ${Math.round(a * 100)}%, transparent)`;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function resolveColor(c) {
    // "var(--c-fire)" gibi CSS degiskenleri canvas'ta calismaz; gercek renge cevir
    const m = /^var\((--[\w-]+)\)$/.exec(String(c || "").trim());
    return m ? css(m[1], "#38bdf8") : c;
  }

  function areaGradient(color, top = 0.38, bottom = 0.02) {
    return (ctx) => {
      const { chart } = ctx;
      const area = chart.chartArea;
      if (!area) return withAlpha(color, top / 2);
      const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
      g.addColorStop(0, withAlpha(color, top));
      g.addColorStop(1, withAlpha(color, bottom));
      return g;
    };
  }

  function mount(el, height) {
    if (!el) return null;
    if (el._hc) {
      el._hc.chart.destroy();
      registry.delete(el._hc);
    }
    el.innerHTML = `<div class="hc-box" style="height:${height}px"><canvas></canvas></div>`;
    return el.querySelector("canvas");
  }

  function baseOptions(t, opts) {
    const unit = opts.unit || "";
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 6, right: 4 } },
      plugins: {
        legend: {
          display: !!opts.legend,
          position: "top",
          labels: {
            color: t.text, font: { family: t.font, size: 12, weight: "600" }, usePointStyle: true, pointStyle: "circle", boxWidth: 8, boxHeight: 8, padding: 14,
            // aciklama noktalari cizgi rengiyle dolu olsun (alan dolgusu seffaf olsa bile)
            generateLabels: (chart) => Chart.defaults.plugins.legend.labels.generateLabels(chart).map((l) => ({ ...l, fillStyle: l.strokeStyle, lineDash: [] })),
          },
        },
        tooltip: {
          backgroundColor: t.tipBg,
          titleColor: t.tipText,
          bodyColor: t.text,
          borderColor: t.border,
          borderWidth: 1,
          padding: 10,
          cornerRadius: 10,
          displayColors: !!opts.legend,
          titleFont: { family: t.font, weight: "700", size: 13 },
          bodyFont: { family: t.font, size: 12 },
          callbacks: {
            title: (items) => (opts.tooltipTitle ? opts.tooltipTitle(items[0].dataIndex) : items[0].label),
            label: (item) => {
              const u = (item.dataset.unit != null ? item.dataset.unit : unit);
              const v = item.parsed.y;
              const val = v == null ? "—" : (Number.isInteger(v) ? v : v.toFixed(opts.decimals != null ? opts.decimals : 1));
              return ` ${item.dataset.label ? item.dataset.label + ": " : ""}${u === "%" ? "%" + val : val + u}`;
            },
            afterBody: opts.tooltipExtra ? (items) => opts.tooltipExtra(items[0].dataIndex) : undefined,
          },
        },
      },
      scales: {
        x: {
          grid: { color: t.grid, drawTicks: false },
          border: { display: false },
          ticks: {
            color: t.muted,
            font: { family: t.font, size: 11 },
            maxRotation: 0,
            autoSkip: true,
            autoSkipPadding: 14,
            padding: 8,
            callback: function (value, index) { return opts.xTick ? opts.xTick(index) : this.getLabelForValue(value); },
          },
        },
        y: {
          grid: { color: t.grid, drawTicks: false },
          border: { display: false },
          beginAtZero: !!opts.beginAtZero,
          suggestedMin: opts.min,
          suggestedMax: opts.max,
          title: opts.yTitle ? { display: true, text: opts.yTitle, color: t.muted, font: { family: t.font, size: 11 } } : undefined,
          ticks: {
            color: t.muted,
            font: { family: t.font, size: 11 },
            padding: 8,
            maxTicksLimit: 6,
            precision: opts.integer ? 0 : undefined,
            callback: (v) => (unit === "%" ? "%" + v : v + unit),
          },
        },
      },
    };
  }

  function create(el, height, build) {
    const canvas = mount(el, height);
    if (!canvas || typeof Chart === "undefined") return null;
    const entry = { el, build, chart: null };
    entry.chart = new Chart(canvas, build(theme()));
    el._hc = entry;
    registry.add(entry);
    return entry.chart;
  }

  /* ---- cizgi / alan ----
     opts: { labels, datasets: [{ label, data, color, fill, dashed, unit, yAxisID }], unit, height,
             xTick(i), tooltipTitle(i), tooltipExtra(i), min, max, beginAtZero, legend } */
  function line(el, opts) {
    return create(el, opts.height || 260, (t) => {
      const o = baseOptions(t, opts);
      return {
        type: "line",
        data: {
          labels: opts.labels,
          datasets: opts.datasets.map((d) => {
            const color = resolveColor(d.color);
            return {
              label: d.label || "",
              data: d.data,
              unit: d.unit,
              borderColor: color,
              backgroundColor: d.fill === "between" ? withAlpha(color, 0.16) : d.fill ? areaGradient(color) : "transparent",
              fill: d.fill === "between" ? "-1" : !!d.fill,
              borderWidth: d.width || 2.5,
              borderDash: d.dashed ? [5, 5] : undefined,
              tension: 0.4,
              cubicInterpolationMode: "monotone",
              pointRadius: 0,
              pointHoverRadius: 5,
              pointHoverBackgroundColor: color,
              pointHoverBorderColor: t.tipText,
              pointHoverBorderWidth: 2,
              spanGaps: true,
            };
          }),
        },
        options: o,
      };
    });
  }

  /* ---- cubuk ----
     opts: { labels, data, color, unit, height, xTick(i), integer, valueLabels } */
  function bar(el, opts) {
    return create(el, opts.height || 240, (t) => {
      const color = resolveColor(opts.color || "var(--accent)");
      const o = baseOptions(t, { beginAtZero: true, integer: true, ...opts });
      o.scales.x.grid.display = false;
      return {
        type: "bar",
        data: {
          labels: opts.labels,
          datasets: [{
            label: opts.label || "",
            data: opts.data,
            backgroundColor: withAlpha(color, 0.85),
            hoverBackgroundColor: color,
            borderRadius: 6,
            borderSkipped: false,
            maxBarThickness: 42,
            categoryPercentage: 0.8,
            barPercentage: 0.9,
          }],
        },
        options: o,
      };
    });
  }

  /* ---- yagis: miktar (cubuk, mm) + ihtimal (cizgi, %) — iki eksenli ----
     opts: { labels, amount, probability, height, xTick(i), tooltipTitle(i) } */
  function rain(el, opts) {
    return create(el, opts.height || 280, (t) => {
      const amountColor = css("--c-weather", "#38bdf8");
      const probColor = css("--status-good", "#34d399");
      const o = baseOptions(t, { ...opts, legend: true, unit: " mm", beginAtZero: true });
      o.scales.x.grid.display = false;
      o.scales.y.title = { display: true, text: "Yağış (mm)", color: amountColor, font: { family: t.font, size: 11 } };
      o.scales.y.suggestedMax = Math.max(1, ...opts.amount.map((v) => v || 0)) * 1.15;
      o.scales.y2 = {
        position: "right",
        min: 0,
        max: 100,
        grid: { display: false },
        border: { display: false },
        title: { display: true, text: "İhtimal (%)", color: probColor, font: { family: t.font, size: 11 } },
        ticks: { color: t.muted, font: { family: t.font, size: 11 }, padding: 8, stepSize: 20, callback: (v) => "%" + v },
      };
      return {
        data: {
          labels: opts.labels,
          datasets: [
            {
              type: "line",
              label: "Yağış ihtimali",
              unit: "%",
              data: opts.probability,
              yAxisID: "y2",
              borderColor: probColor,
              backgroundColor: probColor,
              borderWidth: 2.5,
              tension: 0.4,
              cubicInterpolationMode: "monotone",
              pointRadius: 0,
              pointHoverRadius: 5,
              order: 0,
            },
            {
              type: "bar",
              label: "Yağış miktarı",
              unit: " mm",
              data: opts.amount,
              yAxisID: "y",
              backgroundColor: withAlpha(amountColor, 0.8),
              hoverBackgroundColor: amountColor,
              borderRadius: 3,
              categoryPercentage: 1,
              barPercentage: 0.92,
              order: 1,
            },
          ],
        },
        options: o,
      };
    });
  }

  // tema degisince tum grafikleri yeni renklerle yeniden kur
  function refreshTheme() {
    registry.forEach((entry) => {
      if (!document.body.contains(entry.el)) { registry.delete(entry); return; }
      const cfg = entry.build(theme());
      entry.chart.options = cfg.options;
      entry.chart.data.datasets.forEach((ds, i) => Object.assign(ds, cfg.data.datasets[i]));
      entry.chart.update("none");
    });
  }

  if (typeof Chart !== "undefined") {
    Chart.defaults.font.family = css("--font", "system-ui");
  }

  return { line, bar, rain, refreshTheme, withAlpha };
})();
