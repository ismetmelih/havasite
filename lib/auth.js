// Sifre hashleme + imzali oturum cerezi. Ekstra bagimlilik (bcrypt, jsonwebtoken,
// express-session vb.) eklememek icin Node'un yerlesik crypto modulunu kullanir:
// - sifreler scrypt ile tuz + hash olarak saklanir
// - oturum, HMAC-SHA256 ile imzalanmis, sunucu tarafinda state tutmayan (stateless)
//   bir cerezdir (kucuk bir JWT benzeri yapi)
const crypto = require("crypto");

const COOKIE_NAME = "havasite_session";
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 gun

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(check, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function getSecret() {
  // Uretimde SESSION_SECRET mutlaka ortam degiskeni olarak set edilmeli (render.yaml
  // otomatik uretir). Yerelde unutulursa site yine calissin diye bir varsayilan var.
  return process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
}

function b64urlEncode(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(str) {
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(payloadObj) {
  const payload = b64urlEncode(Buffer.from(JSON.stringify(payloadObj)));
  const sig = b64urlEncode(crypto.createHmac("sha256", getSecret()).update(payload).digest());
  return `${payload}.${sig}`;
}

function verify(token) {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = b64urlEncode(crypto.createHmac("sha256", getSecret()).update(payload).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(b64urlDecode(payload).toString("utf8"));
    if (obj.exp && Date.now() > obj.exp) return null;
    return obj;
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
    }
  });
  return out;
}

function isSecureRequest(req) {
  return process.env.RENDER === "true" || req.headers["x-forwarded-proto"] === "https";
}

function createSessionCookie(req, user) {
  const token = sign({ uid: user.id, isAdmin: !!user.is_admin, exp: Date.now() + SESSION_TTL_MS });
  const secure = isSecureRequest(req) ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; SameSite=Lax${secure}`;
}

function clearSessionCookie(req) {
  const secure = isSecureRequest(req) ? "; Secure" : "";
  return `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

function readSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  return verify(cookies[COOKIE_NAME]);
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSessionCookie,
  clearSessionCookie,
  readSession,
  COOKIE_NAME,
};
