// HTTP yardimcilari: guvenlik basliklari, sikistirma ve basit hiz sinirlama.
// Ekstra bagimlilik yok; Node'un yerlesik zlib modulu kullanilir.
const zlib = require("zlib");

// ---------- guvenlik basliklari ----------
// Sayfalarin kullandigi dis kaynaklar: Leaflet (unpkg), Esri harita karolari,
// tarayicidan dogrudan cagrilan Open-Meteo servisleri. Baska bir kaynak eklenirse
// buraya da eklenmeli, yoksa tarayici engeller.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://unpkg.com",
  "img-src 'self' data: blob: https://server.arcgisonline.com https://unpkg.com",
  "font-src 'self'",
  "connect-src 'self' https://api.open-meteo.com https://air-quality-api.open-meteo.com https://archive-api.open-meteo.com https://geocoding-api.open-meteo.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

function securityHeaders(isHtml) {
  const h = {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "geolocation=(self), camera=(self), microphone=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  };
  if (isHtml) h["Content-Security-Policy"] = CSP;
  return h;
}

// ---------- sikistirma ----------
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|manifest\+json|xml)|image\/svg\+xml)/;

// Govdeyi istemcinin destekledigi bicimde (br > gzip) sikistirip gonderir.
function send(req, res, status, headers, body) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8");
  const type = headers["Content-Type"] || "";
  const accept = String((req && req.headers["accept-encoding"]) || "");
  const out = { ...headers, Vary: "Accept-Encoding" };
  let payload = buf;
  if (buf.length > 1024 && COMPRESSIBLE.test(type)) {
    if (/\bbr\b/.test(accept)) {
      payload = zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } });
      out["Content-Encoding"] = "br";
    } else if (/\bgzip\b/.test(accept)) {
      payload = zlib.gzipSync(buf, { level: 6 });
      out["Content-Encoding"] = "gzip";
    }
  }
  out["Content-Length"] = payload.length;
  res.writeHead(status, out);
  res.end(req && req.method === "HEAD" ? undefined : payload);
}

// ---------- istemci IP'si ----------
// AWS Amplify/CloudFront arkasinda gercek adres X-Forwarded-For'un ilk elemanidir.
// Ziyaretcinin gercek IP'si. X-Forwarded-For'un ILK degeri ziyaretci tarafindan yazilabilir
// (sahte IP ile hiz siniri asilabiliyordu). Amplify/CloudFront onunde:
//  1) cloudfront-viewer-address: CloudFront'un kendisi yazar, ziyaretci degistiremez ("ip:port")
//  2) yoksa X-Forwarded-For'un sondan ikinci degeri (sonuncusu CloudFront'un kendi adresi)
//  3) yerelde (vekil yok) baglantinin adresi
function clientIp(req) {
  const cf = String(req.headers["cloudfront-viewer-address"] || "").trim();
  if (cf) return cf.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  const xff = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (xff.length >= 2) return xff[xff.length - 2];
  return req.socket.remoteAddress || "unknown";
}

// ---------- hiz sinirlama (bellek ici, kayan pencere) ----------
// Not: birden fazla sunucu ornegi calisiyorsa her ornek kendi sayacini tutar;
// yine de kaba kuvvet denemelerini ciddi bicimde yavaslatir.
function createRateLimiter({ windowMs, max }) {
  const hits = new Map(); // key -> [zaman damgalari]
  function prune(key, now) {
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length) hits.set(key, list);
    else hits.delete(key);
    return list;
  }
  // bellek sismesin diye ara ara eski kayitlari temizle
  setInterval(() => {
    const now = Date.now();
    for (const key of hits.keys()) prune(key, now);
  }, Math.min(windowMs, 60 * 1000)).unref();

  return {
    // bir deneme kaydeder; sinir asildiysa { ok: false, retryAfterSec } doner
    hit(key) {
      const now = Date.now();
      const list = prune(key, now);
      if (list.length >= max) {
        return { ok: false, retryAfterSec: Math.ceil((list[0] + windowMs - now) / 1000) };
      }
      list.push(now);
      hits.set(key, list);
      return { ok: true };
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

module.exports = { securityHeaders, send, clientIp, createRateLimiter, CSP };
