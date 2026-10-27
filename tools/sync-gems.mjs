// Free Gems from the community Gems sheet (Google Sheets, shared for viewing): daily gems per day (the month
// tables and the free-to-play columns of the next-month forecast) plus the banner schedule.
//   node tools/sync-gems.mjs            → writes data/gems-sheet.json
// The sheet is hand-made, so the parser looks for its header rows ("Daily Gems … Tổng", "Regional Rotation …")
// instead of fixed cell positions, and refuses to write the file when it finds nothing.
import fs from 'node:fs';
import { UA, getText, writeIfChanged } from './lib.mjs';

export const SHEET_ID = '1Vu8af6bU3hXuHCDZHr-ppVwkVjJfO2QZ3iSitcViYts';

// RFC 4180 CSV (quoted cells may hold commas and line breaks)
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const DATE = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/;
export const isoDate = s => { const m = DATE.exec(s || ''); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };
// "1.450" → 1450 (dot = thousands), "8,5" → 8.5, "" → null
export const num = s => { const x = String(s ?? '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.'); return x === '' || isNaN(x) ? null : +x; };

export function parseTab(rows, tab = '') {
  const days = [], banners = [], months = [];
  let updated = null;
  rows.forEach((r, i) => {
    const u = r.findIndex(c => /^Cập nhật/i.test(c.trim()));
    if (u >= 0) { const d = isoDate(r[u + 1]); if (d && (!updated || d > updated)) updated = d; }
    const mo = /^Tháng (\d+)$/.exec((r[2] || '').trim());
    if (mo && isoDate(r[3]) && isoDate(r[4])) months.push({ month: +mo[1], start: isoDate(r[3]), end: isoDate(r[4]), daily: num(r[5]), gym: num(r[6]), other: num(r[7]), total: num(r[8]) });
    const daily = r.indexOf('Daily Gems'), reg = r.indexOf('Regional Rotation'), ban = r.indexOf('Banner');
    const take = (c0, from, make) => {
      for (let j = i + 1; j < rows.length; j++) { const d = isoDate(rows[j][c0 - 1] ?? ''); if (!d) break; const x = make(rows[j], d); if (x) days.push(x); }
    };
    if (daily > 0 && r[daily + 3]?.trim() === 'Tổng') take(daily, i, (w, date) => {
      const parts = { daily: num(w[daily]) ?? 0, gym: num(w[daily + 1]) ?? 0, other: num(w[daily + 2]) ?? 0 }, total = num(w[daily + 3]) ?? parts.daily + parts.gym + parts.other;
      return { date, gems: total, parts, kind: 'table', tab };
    });
    if (reg > 0 && r[reg + 3]?.trim() === 'Tổng') take(reg, i, (w, date) => {   // the first block is free-to-play; a second one to its right is not read
      const parts = { regional: num(w[reg]) ?? 0, daily: num(w[reg + 1]) ?? 0, stadium: num(w[reg + 2]) ?? 0 }, total = num(w[reg + 3]) ?? parts.regional + parts.daily + parts.stadium;
      return { date, gems: total, parts, kind: 'forecast', tab };
    });
    if (ban > 0 && /Bắt đầu/.test(r[ban + 1] || '')) {
      for (let j = i + 1; j < rows.length; j++) {
        const w = rows[j], s = isoDate(w[ban + 1]), e = isoDate(w[ban + 2]);
        if (!(w[ban] || '').trim() || !s) break;
        banners.push({ type: (w[ban - 1] || '').trim(), name: w[ban].trim(), start: s, end: e });
      }
    }
  });
  return { days, banners, months, updated };
}

export function merge(tabs) {
  const byDate = new Map(), banners = new Map(), months = new Map();
  let updated = null;
  for (const t of tabs) {
    for (const d of t.days) { const old = byDate.get(d.date); if (!old || (old.kind === 'forecast' && d.kind === 'table')) byDate.set(d.date, d); }
    for (const b of t.banners) banners.set(`${b.name}|${b.start}`, b);
    for (const m of t.months) months.set(m.month, m);
    if (t.updated && (!updated || t.updated > updated)) updated = t.updated;
  }
  return { updated, days: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)), banners: [...banners.values()].sort((a, b) => a.start.localeCompare(b.start)), months: [...months.values()].sort((a, b) => a.month - b.month) };
}

export async function buildGems() {
  const page = await getText(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/htmlview`);
  const gids = [...new Set([...page.matchAll(/gid=(\d+)/g)].map(m => m[1]))];
  const tabs = [];
  for (const gid of gids) tabs.push(parseTab(parseCsv(await getText(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`)), gid));
  const out = merge(tabs);
  if (out.days.length < 20) throw new Error(`Only ${out.days.length} days found in ${gids.length} tabs: the sheet layout may have changed. Nothing written.`);
  const data = { source: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`, author: 'Tarolush', fetched: new Date().toISOString(), note: 'Free Gems per day from the community Gems sheet (daily + Gym + other; the free-to-play columns of the forecast). Not Paid Gems.', ...out };
  return { file: 'data/gems-sheet.json', data, items: out.days.length, note: `${out.days[0].date} → ${out.days.at(-1).date}, sheet updated ${out.updated}` };
}
async function main() {
  const r = await buildGems();
  const changed = writeIfChanged(r.file, r.data);
  console.log(`${r.items} days, ${r.note}${changed ? '' : ' (no change)'}`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e.message); process.exit(1); });
