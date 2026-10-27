// Shared by the data tools: fetch with a polite User-Agent, write a JSON file only when its content changed,
// and keep the status record of every source (see tools/sync-all.mjs).
import fs from 'node:fs';
import path from 'node:path';

export const UA = { 'user-agent': 'Mozilla/5.0 (pmex-gym-manager data sync; github.com/Kietto03/pmex-gym-manager)' };
export const DEX_SITE = process.env.DEX_SITE || 'https://kietto03.github.io/pmex-supez-dex/';
export const POMA_SITE = process.env.POMA_SITE || 'https://pomasters.github.io/SyncPairsTracker/';

export async function getText(url, { tries = 3 } = {}) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: UA, redirect: 'follow' });
      if (!res.ok) throw new Error(`${url} answered ${res.status}`);
      return await res.text();
    } catch (e) { last = e; if (i < tries) await new Promise(r => setTimeout(r, 1500 * i)); }
  }
  throw last;
}
export const getJson = async url => JSON.parse(await getText(url));

// Compare ignoring the fields that change on every run (the fetch time), so a quiet source makes no commit
const VOLATILE = ['fetched', 'built'];
const strip = (o, drop) => JSON.stringify(o, (k, v) => (drop.includes(k) ? undefined : v));
export function writeIfChanged(file, obj, drop = VOLATILE) {
  let old = null;
  try { old = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* new file */ }
  if (old && strip(old, drop) === strip(obj, drop)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj));
  return true;
}

export { ageDays, health } from '../src/freshness.js';

// To keep the repo quiet, an unchanged source that was already confirmed within the last 20 hours keeps its old time:
// the status file then changes about once a day, not on every 6-hourly run.
export function settle(prev, next, now = Date.now()) {
  if (!prev || !next.ok || next.changed || !prev.ok || (now - Date.parse(prev.lastOk)) > 20 * 36e5) return next;
  return { ...next, lastOk: prev.lastOk, lastTry: prev.lastTry };
}
// One source's record after a run. A failed run keeps the time of the last good one.
export function nextStatus(prev, def, result, now = new Date().toISOString()) {
  const base = { label: def.label, feeds: def.feeds, kind: def.kind, url: def.url || '', staleAfterDays: def.staleAfterDays ?? 7 };
  if (def.kind === 'manual') return { ...base, ok: null, lastOk: prev?.lastOk || null, lastTry: now, note: def.note || '' };
  if (result.error) return { ...base, ok: false, lastOk: prev?.lastOk || null, lastTry: now, changed: false, items: prev?.items ?? null, note: prev?.note || '', error: String(result.error).slice(0, 300) };
  return { ...base, ok: true, lastOk: now, lastTry: now, changed: !!result.changed, items: result.items ?? null, note: result.note || '', error: '',
    since: result.changed ? now : prev?.since || prev?.lastOk || now };
}
