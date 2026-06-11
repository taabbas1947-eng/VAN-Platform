// COBO data store. Postgres (its own DB) when DATABASE_URL is set; in-memory fallback otherwise
// so the app still runs before the DB is provisioned. JSONB-KV keeps the schema flexible as COBO grows.
let Pool = null;
try { Pool = require('pg').Pool; } catch (e) { /* pg not installed yet */ }
const URL = process.env.DATABASE_URL || '';
const usePg = !!(URL && Pool);
const pool = usePg ? new Pool({ connectionString: URL, ssl: { rejectUnauthorized: false } }) : null;
const mem = {}; // { coll: { id: obj } }

async function init() {
  if (!pool) return;
  await pool.query('CREATE TABLE IF NOT EXISTS cobo_kv (coll text NOT NULL, id text NOT NULL, data jsonb NOT NULL, updated timestamptz DEFAULT now(), PRIMARY KEY (coll, id))');
}
function nid(coll) { return coll + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
async function all(coll) {
  if (pool) { const r = await pool.query('SELECT data FROM cobo_kv WHERE coll=$1 ORDER BY id', [coll]); return r.rows.map((x) => x.data); }
  return Object.values(mem[coll] || {});
}
async function get(coll, id) {
  if (pool) { const r = await pool.query('SELECT data FROM cobo_kv WHERE coll=$1 AND id=$2', [coll, id]); return r.rows[0] ? r.rows[0].data : null; }
  return (mem[coll] || {})[id] || null;
}
async function put(coll, obj) {
  obj = Object.assign({}, obj);
  if (!obj.id) obj.id = nid(coll);
  if (pool) await pool.query('INSERT INTO cobo_kv (coll,id,data) VALUES ($1,$2,$3) ON CONFLICT (coll,id) DO UPDATE SET data=EXCLUDED.data, updated=now()', [coll, obj.id, obj]);
  else (mem[coll] = mem[coll] || {})[obj.id] = obj;
  return obj;
}
async function del(coll, id) {
  if (pool) await pool.query('DELETE FROM cobo_kv WHERE coll=$1 AND id=$2', [coll, id]);
  else if (mem[coll]) delete mem[coll][id];
}
module.exports = { init, all, get, put, del, usePg };
