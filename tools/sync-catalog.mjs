// Loads every sync pair from the PoMasters tracker into public.pair_catalog (Node 18+).
//
//   node tools/sync-catalog.mjs
//
// Uses the same ids as the app (src/catalog.js), so it is identical to Admin → Pair catalog → Sync.
// Needs SUPABASE_PROJECT_REF and an sbp_ SUPABASE_ACCESS_TOKEN (or SUPABASE_SECRET_KEY) in .env.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const envFile = process.env.ENV_FILE || join(import.meta.dirname, '../.env');
const env = { ...process.env };
if (existsSync(envFile)) for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*["']?(.*?)["']?\s*$/);
  if (m && !(m[1] in env)) env[m[1]] = m[2];
}
const ref = (env.SUPABASE_PROJECT_REF || '').replace(/^https?:\/\//, '').replace(/\.supabase\.co.*$/, '');
let key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
if (!key && env.SUPABASE_ACCESS_TOKEN?.startsWith('sbp_')) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` } });
  key = (await r.json()).find(k => k.name === 'service_role')?.api_key;
}
if (!ref || !key) { console.error('Need SUPABASE_PROJECT_REF and an sbp_ token or secret key in', envFile); process.exit(1); }

// src/catalog.js is a browser module: give it the two globals it reads
globalThis.window = { GYM_CONFIG: {} };
globalThis.location = { search: '' };
const { loadCatalog, catalogRows } = await import('../src/catalog.js');
await loadCatalog();
const rows = catalogRows();
const base = `https://${ref}.supabase.co/rest/v1/pair_catalog`;
for (let i = 0; i < rows.length; i += 200) {
  const res = await fetch(base, { method: 'POST', body: JSON.stringify(rows.slice(i, i + 200)),
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' } });
  if (!res.ok) { console.error(`batch ${i}: ${res.status} ${(await res.text()).slice(0, 300)}`); process.exit(1); }
}
console.log(`Synced ${rows.length} sync pairs.`);
