// Postgres baglantisi ve semasi. DATABASE_URL tanimli degilse (yerel gelistirme,
// veritabani henuz kurulmadi vb.) pool null doner ve auth ozellikleri "veritabani yok"
// mesaji dondurur; site geri kalaniyla (hava/deprem/yangin API proxy'leri) etkilenmez.
const { Pool } = require("pg");

let pool = null;
let poolAttempted = false;

function isLocalConn(connStr) {
  return /localhost|127\.0\.0\.1/.test(connStr);
}

function getPool() {
  if (poolAttempted) return pool;
  poolAttempted = true;
  const connStr = process.env.DATABASE_URL;
  if (!connStr) return null;
  pool = new Pool({
    connectionString: connStr,
    ssl: isLocalConn(connStr) ? false : { rejectUnauthorized: false },
    max: 5,
  });
  pool.on("error", (err) => {
    console.error("[db] beklenmeyen pool hatasi:", err.message);
  });
  return pool;
}

let schemaReady = null;
async function ensureSchema() {
  const p = getPool();
  if (!p) return false;
  if (schemaReady) return schemaReady;
  schemaReady = p
    .query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        is_admin BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      -- kullanici tercihleri (favori sehir, deprem uyari esigi...) hesapla birlikte saklanir
      ALTER TABLE users ADD COLUMN IF NOT EXISTS prefs JSONB NOT NULL DEFAULT '{}'::jsonb;
      -- sifre degisince/sifirlaninca artar; eski oturum cerezleri gecersiz olur
      ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
      -- sifre sifirlama baglantilari (yalnizca token'in SHA-256 ozeti saklanir)
      CREATE TABLE IF NOT EXISTS password_resets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets(user_id);
      -- deprem bildirimi abonelikleri (Web Push). Konum ~1 km'ye yuvarlanarak saklanir.
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        endpoint TEXT UNIQUE NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        min_mag REAL NOT NULL DEFAULT 4.0,
        lat REAL,
        lon REAL,
        radius_km INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_sent_at TIMESTAMPTZ
      );
      -- kucuk anahtar/deger durumu (orn. bildirimi gonderilmis deprem kimlikleri)
      CREATE TABLE IF NOT EXISTS app_state (
        k TEXT PRIMARY KEY,
        v JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `)
    .then(() => true)
    .catch((err) => {
      console.error("[db] sema olusturulamadi:", err.message);
      schemaReady = null; // bir sonraki istekte tekrar denensin
      return false;
    });
  return schemaReady;
}

module.exports = { getPool, ensureSchema };
