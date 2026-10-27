// D.C 3v3 score ranking by type (a shared Google Sheet): the best score per type, the three pairs used and a video.
//   node tools/sync-ranking.mjs   → writes data/dc-ranking.json
import fs from 'node:fs';
import { parseCsv, num } from './sync-gems.mjs';

const SHEET_ID = '14C_CPMRC8xHslf7id6wMqTdQeCvPA-_X4w9URrHNRzE', GID = '1658000195';
const TYPES = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];

// "Red 1996\n5 EX R" → { name: 'Red 1996', level: 5, ex: true, exr: true }
export function parseUnit(cell) {
  const [name, rest = ''] = String(cell).split('\n').map(x => x.trim());
  const lvl = /^(\d+)\s*(EX)?\s*(R)?/i.exec(rest);
  return { name, level: lvl ? +lvl[1] : null, ex: !!lvl?.[2], exr: !!lvl?.[3] };
}
export function parseRanking(rows) {
  const out = [];
  for (const r of rows) {
    const type = TYPES.find(t => t === (r[2] || '').trim());
    if (!type) continue;
    const cells = r.slice(3).map(c => c.trim()).filter(Boolean);
    const url = cells.find(c => /^(https?:\/\/)?(www\.)?(youtu|youtube)/i.test(c)) || '';
    const score = cells.find(c => /^\d{1,3}(\.\d{3})+$/.test(c));
    const units = cells.filter(c => c !== url && c !== score).slice(0, 3).map(parseUnit);
    if (score && units.length) out.push({ rank: +r[1] || out.length + 1, type, score: num(score), units, video: url && !/^https?:/i.test(url) ? `https://${url}` : url });
  }
  return out;
}
async function main() {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`, { headers: { 'user-agent': 'Mozilla/5.0 (pmex-gym-manager)' } });
  if (!res.ok) throw new Error(`Google answered ${res.status}`);
  const types = parseRanking(parseCsv(await res.text()));
  if (types.length < 10) throw new Error(`Only ${types.length} types found: the sheet layout may have changed. Nothing written.`);
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/dc-ranking.json', JSON.stringify({ source: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${GID}`, fetched: new Date().toISOString(),
    note: 'Best 3v3 scores by type, from D.C. and Ranked Damage Super Sparring (community sheet).', types }));
  console.log(`${types.length} types, best ${types[0].type} ${types[0].score}`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e.message); process.exit(1); });
