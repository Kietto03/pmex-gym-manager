// Refreshes every outside data source the app depends on and records how each one went in data/sync-status.json.
//   node tools/sync-all.mjs                 run everything
//   node tools/sync-all.mjs --only gems,lodge
//   node tools/sync-all.mjs --dry           fetch and check, write nothing
// A source that fails keeps its previous file and its last good time, so one broken source never blanks the app.
// Exit code 1 when any automatic source failed (the scheduled workflow turns that into a red run and an e-mail).
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { buildGems } from './sync-gems.mjs';
import { buildClears } from './sync-clears.mjs';
import { buildLodge } from './build-lodge.mjs';
import { buildEvents } from './build-events.mjs';
import { buildPairMap } from './build-pair-map.mjs';
import { getJson, writeIfChanged, nextStatus, settle, health, DEX_SITE, POMA_SITE } from './lib.mjs';

const STATUS = 'data/sync-status.json';

// Sources that become a file in data/ (the site reads that file)
const fileSource = (id, label, feeds, url, staleAfterDays, build) => ({ id, label, feeds, url, staleAfterDays, kind: 'file', run: async dry => {
  const r = await build();
  return { items: r.items, note: r.note, changed: dry ? false : writeIfChanged(r.file, r.data) };
} });
// Sources the app reads live in the browser: here we only check they answer and say what they hold
const liveSource = (id, label, feeds, url, staleAfterDays, check) => ({ id, label, feeds, url, staleAfterDays, kind: 'live', run: check });

export const SOURCES = [
  liveSource('catalog', 'Sync pairs (PoMasters tracker)', 'every sync pair, icons, roles', POMA_SITE, 14, async () => {
    const j = await getJson(`${POMA_SITE}js/syncpairs.json`);
    const n = (j.SYNCPAIRS || []).length;
    if (n < 500) throw new Error(`The tracker lists only ${n} pairs`);
    return { items: n, note: `tracker version ${j.VERSION || '?'}` };
  }),
  liveSource('gyms', 'Gym Battle info (Dex build of the datamine)', 'leaders, circuits, rules, bosses, rewards, next rounds', `${DEX_SITE}data/gyms.json`, 40, async () => {
    const j = await getJson(`${DEX_SITE}data/gyms.json`);
    if (!j.gyms?.length) throw new Error('The Dex has no Gym Battle');
    return { items: j.gyms.length, note: `${j.gyms.at(-1).name}; game ${j.versions?.at(-1) || '?'}; built ${String(j.builtAt || '').slice(0, 10)}` };
  }),
  liveSource('tags', 'Pair tags (Dex): weather, terrain, zones, Type Rebuff', 'roster sheet suggestions', `${DEX_SITE}data/pair-tags.json`, 40, async () => {
    const j = await getJson(`${DEX_SITE}data/pair-tags.json`);
    return { items: Object.keys(j).length, note: '' };
  }),
  liveSource('pairindex', 'Pair index of the Dex (grid, moves, passives)', 'Sync Grid: which pairs have a grid page', `${DEX_SITE}data/pair-index.json`, 40, async () => {
    const j = await getJson(`${DEX_SITE}data/pair-index.json`);
    const n = Object.keys(j.pairs || {}).length;
    if (n < 300) throw new Error(`The Dex index lists only ${n} pairs`);
    return { items: n, note: `Dex build ${String(j.dexBuilt || '').slice(0, 10)}, versions ${(j.versions || []).join(', ')}` };
  }),
  fileSource('pairmap', 'Pair files of the Dex, copy kept here', 'Sync Grid fallback when the Dex index is unreachable', `${DEX_SITE}data/data.js`, 40, buildPairMap),
  fileSource('gems', 'Free Gems (community Gems sheet)', 'Free Gems projection, banners', 'https://docs.google.com/spreadsheets/d/1Vu8af6bU3hXuHCDZHr-ppVwkVjJfO2QZ3iSitcViYts/edit', 7, buildGems),
  fileSource('clears', 'D.C. and GvG clears (community sheets)', 'Strategies: D.C. and GvG libraries', 'https://docs.google.com/spreadsheets/d/14C_CPMRC8xHslf7id6wMqTdQeCvPA-_X4w9URrHNRzE/edit', 30, buildClears),
  fileSource('events', 'Event calendar: scout banners (Dex build of the datamine)', 'Free Gems: event calendar', `${DEX_SITE}data/data.js`, 40, buildEvents),
  fileSource('lodge', 'Trainer Lodge topics (Serebii)', 'Trainer Lodge lookup', 'https://www.serebii.net/pokemonmasters/trainerlodgetopics.shtml', 60, buildLodge),
  { id: 'tier', label: 'Tier lists (China, Spark, Japan)', feeds: 'suggestions by tier (not built yet)', kind: 'manual', url: 'https://docs.qq.com/sheet/DSWp2aXZHSUphT1lW?tab=n44aze',
    note: 'No machine-readable copy: the China sheet asks for a login and the Spark list is made of pictures.' },
];

// The members' sync pairs also live in the database (pair_catalog): refresh it when the secrets are there
function catalogToDatabase(dry) {
  const need = ['SUPABASE_PROJECT_REF'].filter(k => !process.env[k]);
  const hasKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ACCESS_TOKEN;
  if (need.length || !hasKey) return { skipped: true };
  if (dry) return { skipped: true };
  const r = spawnSync('node', ['tools/sync-catalog.mjs'], { encoding: 'utf8', env: process.env });
  return { skipped: false, ok: r.status === 0, out: `${r.stdout}${r.stderr}`.trim().split('\n').pop() };
}

export async function syncAll({ only = null, dry = false, log = console.log } = {}) {
  let status = {};
  try { status = JSON.parse(fs.readFileSync(STATUS, 'utf8')).sources || {}; } catch { /* first run */ }
  const out = Object.fromEntries(Object.entries(status).filter(([id]) => SOURCES.some(x => x.id === id)));   // a source that no longer exists leaves the report
  let failed = 0;
  for (const def of SOURCES) {
    if (only && !only.includes(def.id)) continue;
    let result;
    if (def.kind === 'manual') result = {};
    else try { result = await def.run(dry); } catch (e) { result = { error: e.message }; }
    out[def.id] = settle(status[def.id], nextStatus(status[def.id], def, result));
    if (result.error) failed++;
    log(`${result.error ? 'FAIL' : def.kind === 'manual' ? 'MANUAL' : result.changed ? 'UPDATED' : 'ok'}  ${def.label}${result.error ? ` — ${result.error}` : result.items != null ? ` (${result.items}${result.note ? `, ${result.note}` : ''})` : ''}`);
  }
  if (!only || only.includes('catalog')) {
    const db = catalogToDatabase(dry);
    if (!db.skipped) { log(`${db.ok ? 'ok' : 'FAIL'}  Sync pairs → database: ${db.out}`); if (!db.ok) failed++; }
    else log('skip  Sync pairs → database (no Supabase secrets here; use Admin → Pair catalog → Sync)');
  }
  const stamped = { generated: new Date().toISOString(), sources: out };
  if (!dry) writeIfChanged(STATUS, stamped, ['generated', 'lastTry', 'fetched']);
  return { status: stamped, failed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), onlyArg = args.indexOf('--only') >= 0 ? args[args.indexOf('--only') + 1] : null;
  const { status, failed } = await syncAll({ only: onlyArg ? onlyArg.split(',') : null, dry: args.includes('--dry') });
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = Object.entries(status.sources).map(([id, s]) => `| ${s.label} | ${health(s)} | ${s.lastOk?.slice(0, 16).replace('T', ' ') || '—'} | ${s.items ?? ''} | ${(s.error || s.note || '').replace(/\|/g, '/')} |`);
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Data sync\n| Source | State | Last good | Items | Note |\n|---|---|---|---|---|\n${rows.join('\n')}\n`);
  }
  process.exit(failed ? 1 : 0);
}
