// Platform data layer. ONE Postgres, a SCHEMA per module (cobo, core, qms, …); in-memory fallback
// when DATABASE_URL is unset so the app still runs pre-provisioning. Each schema has a JSONB-KV table.
let Pool = null;
try { Pool = require('pg').Pool; } catch (e) { /* pg not installed yet */ }
const URL = process.env.DATABASE_URL || '';
const usePg = !!(URL && Pool);
const pool = usePg ? new Pool({ connectionString: URL, ssl: { rejectUnauthorized: false }, max: 5 }) : null;
const mem = {}; // { schema: { coll: { id: obj } } }

function safe(name) { if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error('bad schema name: ' + name); return name; }
async function ensureSchema(schema) { if (pool) await pool.query('CREATE SCHEMA IF NOT EXISTS ' + safe(schema)); }

// A per-module store over <schema>.kv (coll, id, data jsonb).
function store(schema) {
  safe(schema);
  const memS = () => (mem[schema] = mem[schema] || {});
  return {
    schema,
    async init() {
      if (!pool) return;
      await ensureSchema(schema);
      await pool.query(`CREATE TABLE IF NOT EXISTS ${schema}.kv (coll text NOT NULL, id text NOT NULL, data jsonb NOT NULL, updated timestamptz DEFAULT now(), PRIMARY KEY (coll, id))`);
    },
    async all(coll) {
      if (pool) { const r = await pool.query(`SELECT data FROM ${schema}.kv WHERE coll=$1 ORDER BY id`, [coll]); return r.rows.map((x) => x.data); }
      return Object.values(memS()[coll] || {});
    },
    async get(coll, id) {
      if (pool) { const r = await pool.query(`SELECT data FROM ${schema}.kv WHERE coll=$1 AND id=$2`, [coll, id]); return r.rows[0] ? r.rows[0].data : null; }
      return (memS()[coll] || {})[id] || null;
    },
    async put(coll, obj) {
      obj = Object.assign({}, obj);
      if (!obj.id) obj.id = coll + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      if (pool) await pool.query(`INSERT INTO ${schema}.kv (coll,id,data) VALUES ($1,$2,$3) ON CONFLICT (coll,id) DO UPDATE SET data=EXCLUDED.data, updated=now()`, [coll, obj.id, obj]);
      else (memS()[coll] = memS()[coll] || {})[obj.id] = obj;
      return obj;
    },
    async del(coll, id) {
      if (pool) await pool.query(`DELETE FROM ${schema}.kv WHERE coll=$1 AND id=$2`, [coll, id]);
      else if (memS()[coll]) delete memS()[coll][id];
    },
  };
}
module.exports = { usePg, pool, store, ensureSchema };
