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
