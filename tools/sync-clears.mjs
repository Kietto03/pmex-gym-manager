// The clear libraries: every D.C. (3v3 and 3v1) and GvG clear listed in the community Google Sheets, as one data file.
//   node tools/sync-clears.mjs     → writes data/clears.json
// D.C.: the "all scores" tab of the D.C. ranking sheet. GvG: one tab per type in the GvG clear list.
// Both sheets are written by hand: rows are found by their header or their type column, and a layout the parser does not
// understand is skipped instead of guessed.
import fs from 'node:fs';
import { parseCsv, num } from './sync-gems.mjs';
import { parseUnit } from './sync-ranking.mjs';
import { getText, writeIfChanged } from './lib.mjs';

export const DC_SHEET = '14C_CPMRC8xHslf7id6wMqTdQeCvPA-_X4w9URrHNRzE', DC_GID = '1272258526', GVG_SHEET = '1MxUU8SIMW7-EfehXIETsvXC5rlcRPinuHJkayrgr0xQ';
export const TYPES = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];
const URL_RE = /^(https?:\/\/)?(www\.)?(youtu\.be|youtube\.com|m\.youtube\.com|bilibili\.com|b23\.tv|nicovideo\.jp|twitter\.com|x\.com)/i;
const fixUrl = u => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

// D.C.: "Bug,,3v3,33.602.712,,Red 1996\n5 EX R,,Benga\n5 EX R,,Alder (Arc)\n5 EX R,https://…"
export function parseDc(rows) {
  const out = [];
  for (const r of rows) {
    const type = TYPES.find(t => t === (r[0] || '').trim()), mode = (r[2] || '').trim();
    if (!type || !/^3v[13]$/.test(mode)) continue;
    const cells = r.slice(3).map(c => c.trim()).filter(Boolean), video = cells.find(c => URL_RE.test(c)) || '', score = cells.find(c => /^\d{1,3}(\.\d{3})+$/.test(c));
    const units = cells.filter(c => c !== video && c !== score).slice(0, 3).map(parseUnit);
    if (score && units.length) out.push({ type, mode, score: num(score), units, video: video ? fixUrl(video) : '' });
  }
  return out;
}
// GvG: header "GvG Season,Type,,Tickets,Round,Score,Rules,1st,,2nd,,3rd,,Source", then one clear per row
export function parseGvg(rows) {
  const h = rows.findIndex(r => (r[0] || '').trim() === 'GvG Season');
  if (h < 0) return [];
  const out = [];
  for (const r of rows.slice(h + 1)) {
    const season = (r[0] || '').trim(), type = TYPES.find(t => t === (r[1] || '').trim());
    if (!season || !type) continue;
    const rest = r.slice(7).map(c => c.trim()).filter(Boolean), video = rest.find(c => URL_RE.test(c)) || '';
    const units = rest.filter(c => c !== video).slice(0, 3).map(parseUnit);
    out.push({ season, type, tickets: +r[3] || null, round: (r[4] || '').trim(), score: num(r[5]), rules: (r[6] || '').trim(), units, video: video ? fixUrl(video) : '' });
  }
  return out;
}

export async function buildClears() {
  const dc = parseDc(parseCsv(await getText(`https://docs.google.com/spreadsheets/d/${DC_SHEET}/export?format=csv&gid=${DC_GID}`)));
  const page = await getText(`https://docs.google.com/spreadsheets/d/${GVG_SHEET}/htmlview`);
  const gvg = [];
  for (const gid of [...new Set([...page.matchAll(/gid=(\d+)/g)].map(m => m[1]))]) {
    try { gvg.push(...parseGvg(parseCsv(await getText(`https://docs.google.com/spreadsheets/d/${GVG_SHEET}/export?format=csv&gid=${gid}`)))); } catch { /* a tab that cannot be read is skipped */ }
  }
  if (dc.length < 40 || gvg.length < 20) throw new Error(`Found ${dc.length} D.C. and ${gvg.length} GvG clears: the sheets may have changed layout. Nothing written.`);
  const key = x => `${x.video}|${x.type}|${x.mode || x.season}|${x.score}`, seen = new Set(), uniq = a => a.filter(x => (seen.has(key(x)) ? false : seen.add(key(x))));
  const data = { fetched: new Date().toISOString(), note: 'Clear teams from the community D.C. and GvG sheets.',
    sources: { dc: `https://docs.google.com/spreadsheets/d/${DC_SHEET}/edit?gid=${DC_GID}`, gvg: `https://docs.google.com/spreadsheets/d/${GVG_SHEET}/edit` }, dc: uniq(dc), gvg: uniq(gvg) };
  return { file: 'data/clears.json', data, items: data.dc.length + data.gvg.length, note: `${data.dc.length} D.C., ${data.gvg.length} GvG` };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  buildClears().then(r => console.log(`${r.note}${writeIfChanged(r.file, r.data) ? '' : ' (no change)'}`)).catch(e => { console.error(e.message); process.exit(1); });
}
