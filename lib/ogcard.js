// Deprem paylasim gorseli (1200x630 PNG): WhatsApp, X, LinkedIn onizlemesi icin.
// SVG burada uretilir, resvg (WebAssembly; yerel derleme gerektirmez) ile PNG'ye cevrilir.
// Harita: public/data/tr-iller-svg.json (geoBoundaries, CC BY-SA) projeksiyonuyla ayni.
const fs = require("fs");
const path = require("path");
const { Resvg, initWasm } = require("@resvg/resvg-wasm");

const ROOT = path.join(__dirname, "..");
let wasmReady = null;
const init = () => (wasmReady = wasmReady || initWasm(fs.readFileSync(require.resolve("@resvg/resvg-wasm/index_bg.wasm"))));
const FONTS = ["satoshi-500.ttf", "satoshi-700.ttf", "cabinet-grotesk-800.ttf"].map((f) => fs.readFileSync(path.join(__dirname, "fonts", f)));
const MAP = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "data", "tr-iller-svg.json"), "utf8"));
const proj = (lat, lon) => [(lon - MAP.lon0) * MAP.k * MAP.c, (MAP.lat0 - lat) * MAP.k];

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// buyukluk rengi: sitedeki window.magTone ile ayni olcek
const magTone = (m) => (m >= 5 ? "#ef4444" : m >= 4 ? "#f97316" : m >= 3 ? "#f5a524" : m >= 2 ? "#22c55e" : "#34d399");

// basligi en fazla iki satira bol (SVG metni kendiliginden kaydirmaz)
function wrap(text, max) {
  const words = String(text).split(/\s+/);
  const lines = [""];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if ((cur + " " + w).trim().length <= max) lines[lines.length - 1] = (cur + " " + w).trim();
    else if (lines.length < 2) lines.push(w);
    else { lines[1] = (lines[1] + " " + w).slice(0, max - 1).trim() + "…"; break; }
  }
  return lines;
}

function quakeCardSvg(q) {
  const tone = magTone(q.mag);
  const t = Date.parse(String(q.date).replace(" ", "T") + "+03:00");
  const when = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(t);
  const depth = Number.isFinite(q.depth) ? `${(Math.round(q.depth * 10) / 10).toLocaleString("tr-TR")} km derinlik` : "";
  const lines = wrap(q.title || "Türkiye", 26);

  // harita kutusu: sagda 600x330
  const BX = 560, BY = 150, BW = 600, BH = 330;
  const s = Math.min(BW / MAP.w, BH / MAP.h);
  const ox = BX + (BW - MAP.w * s) / 2, oy = BY + (BH - MAP.h * s) / 2;
  const [px, py] = proj(q.lat, q.lon);
  const dx = ox + px * s, dy = oy + py * s;
  const provinces = MAP.p.map((p) => `<path d="${p.d}"/>`).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="g" cx="0.85" cy="0.1" r="0.8"><stop offset="0" stop-color="${tone}" stop-opacity="0.22"/><stop offset="1" stop-color="#0a0f17" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#0a0f17"/>
  <rect width="1200" height="630" fill="url(#g)"/>
  <g transform="translate(56,46)">
    <rect width="48" height="48" rx="13" fill="#16223a"/>
    <path d="M24 8c-7.1 0-12.8 5.5-12.8 12.4 0 8.6 11.2 18.5 12.3 19.4a.8.8 0 0 0 1 0c1.1-.9 12.3-10.8 12.3-19.4C36.8 13.5 31.1 8 24 8Z" fill="#3b9ed9"/>
    <circle cx="24" cy="20.2" r="4.6" fill="#16223a"/><circle cx="24" cy="20.2" r="1.9" fill="#3b9ed9"/>
    <text x="64" y="34" font-family="Satoshi Bold" font-size="28" fill="#f4f6fb">Türkiye<tspan fill="#22d3ee" dx="8">Canlı</tspan></text>
  </g>
  <text x="1144" y="80" text-anchor="end" font-family="Satoshi Bold" font-size="22" letter-spacing="3" fill="${tone}">DEPREM · AFAD</text>
  <line x1="56" y1="122" x2="1144" y2="122" stroke="#ffffff" stroke-opacity="0.08"/>

  <text x="56" y="285" font-family="Cabinet Grotesk Extrabold" font-size="150" fill="${tone}">${q.mag.toFixed(1)}<tspan dx="14" font-family="Satoshi Bold" font-size="34" fill="#f4f6fb" fill-opacity="0.7">${esc(q.magType || "M")}</tspan></text>
  ${lines.map((l, i) => `<text x="56" y="${352 + i * 52}" font-family="Satoshi Bold" font-size="44" fill="#f4f6fb">${esc(l)}</text>`).join("\n  ")}
  <text x="56" y="${352 + lines.length * 52 + 18}" font-family="Satoshi Medium" font-size="28" fill="#f4f6fb" fill-opacity="0.65">${esc(when)}</text>
  ${depth ? `<text x="56" y="${352 + lines.length * 52 + 58}" font-family="Satoshi Medium" font-size="28" fill="#f4f6fb" fill-opacity="0.65">${esc(depth)}</text>` : ""}

  <g transform="translate(${ox},${oy}) scale(${s})" fill="#1f2632" stroke="#0a0f17" stroke-width="${1.2 / s}" stroke-linejoin="round">${provinces}</g>
  <circle cx="${dx}" cy="${dy}" r="46" fill="${tone}" fill-opacity="0.12"/>
  <circle cx="${dx}" cy="${dy}" r="28" fill="none" stroke="${tone}" stroke-opacity="0.5" stroke-width="3"/>
  <circle cx="${dx}" cy="${dy}" r="11" fill="${tone}" stroke="#ffffff" stroke-width="3"/>

  <line x1="56" y1="552" x2="1144" y2="552" stroke="#ffffff" stroke-opacity="0.08"/>
  <text x="56" y="592" font-family="Satoshi Bold" font-size="26" fill="#22d3ee">turkiyecanli.com</text>
  <text x="1144" y="592" text-anchor="end" font-family="Satoshi Medium" font-size="22" fill="#f4f6fb" fill-opacity="0.5">Resmî deprem bilgisi için AFAD esas alınır</text>
</svg>`;
}

async function quakeCardPng(q) {
  await init();
  const r = new Resvg(quakeCardSvg(q), { font: { fontBuffers: FONTS, loadSystemFonts: false, defaultFontFamily: "Satoshi Medium" } });
  return Buffer.from(r.render().asPng());
}

module.exports = { quakeCardPng, quakeCardSvg };
