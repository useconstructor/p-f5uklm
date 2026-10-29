const randomUUID = () => globalThis.crypto.randomUUID();

/** One initializer per connection; all schema and seed writes share one transaction.
 * @param {import('@libsql/client').Client} db
 */
function createInitializer(db) {
let ready;
return function initialize() {
  if (!ready) ready = db.batch([
    `CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL CHECK(length(trim(name))>0), sku TEXT NOT NULL CHECK(length(trim(sku))>0), sku_key TEXT NOT NULL UNIQUE, quantity INTEGER NOT NULL CHECK(typeof(quantity)='integer' AND quantity BETWEEN 0 AND 9007199254740991), price_decimal TEXT NOT NULL CHECK(typeof(price_decimal)='text' AND length(price_decimal)>0 AND price_decimal NOT GLOB '*[^0-9.]*' AND price_decimal GLOB '[0-9]*'), version INTEGER NOT NULL CHECK(version>0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS anonymous_sessions (id TEXT PRIMARY KEY NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS mutations (id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL REFERENCES anonymous_sessions(id), idempotency_key TEXT NOT NULL, operation TEXT NOT NULL, product_id TEXT, payload TEXT NOT NULL, payload_hash TEXT NOT NULL, state TEXT NOT NULL, http_status INTEGER NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(session_id,idempotency_key))`,
    `CREATE TABLE IF NOT EXISTS seed_markers (id TEXT PRIMARY KEY NOT NULL, created_at TEXT NOT NULL)`,
    ...[['Cuaderno de ejemplo','DEMO-001','12','3.50'],['Caja de ejemplo','DEMO-002','8','2'],['Etiquetas de ejemplo','DEMO-003','20','1.25']].map(([name,sku,quantity,price])=>({sql:`INSERT INTO products (id,name,sku,sku_key,quantity,price_decimal,version,created_at,updated_at) SELECT ?,?,?,?,CAST(? AS INTEGER),?,1,?,? WHERE NOT EXISTS (SELECT 1 FROM seed_markers WHERE id='initial-v1')`,args:[randomUUID(),name,sku,sku,quantity,price,new Date().toISOString(),new Date().toISOString()]})),
    `INSERT OR IGNORE INTO seed_markers(id,created_at) VALUES ('initial-v1',datetime('now'))`,
  ], 'write').then(()=>{}).catch(e=>{ready=undefined;throw e;});
  return ready;
}
}
module.exports = { createInitializer };
