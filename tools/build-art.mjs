// Index of the Pokémon pictures of pmrandom.dpdns.org (the game's own 3D renders, 256 px), so a pair's Mega, Gigantamax or other form can be found.
//   node tools/build-art.mjs     → writes data/pkmn-art.json
// Each picture is pm<number>_<form>_<name>_256.png. The index keeps, per national dex number: [form code, name part, display name].
// (Trainer pictures need no index: their names come straight from the tracker's internalTrainerName.)
import fs from 'node:fs';
import { getText, getJson, writeIfChanged, exists, POMA_SITE } from './lib.mjs';

export const ART_SITE = 'https://pmrandom.dpdns.org/';
export const SEREBII = 'https://www.serebii.net/pokemonmasters/';

// The site lists every picture as a name inside one JSON list of the page (…,"pm0006_51_megalizardonX","pm0006_52_megalizardonY",…).
// It no longer prints the display name or the shiny twin, so those are kept from the previous index and only asked for new pictures.
export const parseStems = html => [...new Set([...html.matchAll(/"(pm\d{4}_\d\d_[^"\\]+)"/g)].map(m => m[1]))];
const tidy = stem => { const w = stem.replace(/^(\d\d_)+/, '').replace(/_/g, ' ').trim(); return w ? w[0].toUpperCase() + w.slice(1) : stem; };
export function parseArt(html, prev = {}) {
  const pkmn = {};
  for (const full of parseStems(html)) {
    const [, num, code, stem] = /^pm(\d{4})_(\d\d)_(.+)$/.exec(full);
    const old = (prev[num] || []).find(e => e[0] === code && e[1] === stem);
    (pkmn[num] ||= []).push(old ? [...old] : [code, stem, tidy(stem)]);
  }
  return pkmn;
}
// A picture that is new here may have a shiny twin (…_rare_256.png): asked once, and kept (a 1 as its fourth item)
export async function addShiny(pkmn, prev = {}, probe = url => exists(url)) {
  for (const [num, list] of Object.entries(pkmn)) for (const e of list) {
    if ((prev[num] || []).some(o => o[0] === e[0] && o[1] === e[1])) continue;
    if (await probe(`${ART_SITE}static/data/pkmn/pm${num}_${e[0]}_${e[1]}_rare_256.png`)) e[3] = 1;
  }
  return pkmn;
}
// ── Backup pictures: Serebii has the same 2D trainer art and the same 256 px Pokémon renders, and usually has a new pair before pmrandom does ──
const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
// Serebii names a trainer's picture <trainer>.png or <trainer>-<outfit>.png (hau, hau-sygna, hau-arcsuit, bea-alt2…). An outfit is never swapped for another.
export function serebiiTrainerSlugs(p) {
  const name = slug(String(p.trainerName || '').replace(/\s*\(.*\)/, '')), alt = slug(p.trainerAlt);
  if (!name || name === 'player') return [];
  return alt ? [...new Set([`${name}-${alt}`, ...(alt === 'sygnasuit' ? [`${name}-sygna`] : [])])] : [name];
}
// …and a Pokémon <dex number>.png (026-a.png for a regional form). Only forms we can name for sure: the normal form, and a few spelled out.
const POKE_FORMS = { '0892_11': '892', '0892_12': '892-r' };
export function serebiiPokemonNames(p) {
  const m = /^pm(\d{4})_(\d\d)_/.exec(p.internalPokemonName || '');
  if (!m || /_rare$/.test(p.internalPokemonName)) return [];   // Serebii has no shiny pictures
  const named = POKE_FORMS[`${m[1]}_${m[2]}`];
  if (named) return [named];
  return m[2] === '00' ? [String(+m[1]).padStart(3, '0')] : [];
}
export const parseIds = (html, re) => new Set([...html.matchAll(re)].map(m => m[1]));

// Runs f over the items, n at a time; the answers by item
export async function pool(items, n, f) {
  const out = new Map(); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const it = items[i++]; out.set(it, await f(it)); } }));
  return out;
}
// For each pair whose picture pmrandom does not have: the Serebii one, if there is one. Keyed "<dexNumber>|<pokemonNumber>" like the tracker.
async function backups() {
  const pairs = (await getJson(`${POMA_SITE}js/syncpairs.json`)).SYNCPAIRS || [];
  const chara = parseIds(await getText(`${ART_SITE}characters`), /"(ch\d{4}_\d\d_[A-Za-z0-9]+)"/g);
  const stems = new Set(parseStems(await getText(`${ART_SITE}pkmn`)));
  const out = {}, seen = new Map();
  const once = (url, f) => { if (!seen.has(url)) seen.set(url, f()); return seen.get(url); };
  // The pictures the lists do not name are asked for one by one, a few at a time
  const asks = [...new Set(pairs.flatMap(p => [p.internalTrainerName && !chara.has(p.internalTrainerName) ? `${ART_SITE}static/data/chara/${p.internalTrainerName}_1024.png` : '',
    p.internalPokemonName && !stems.has(p.internalPokemonName) ? `${ART_SITE}static/data/pkmn/${p.internalPokemonName}_256.png` : '']).filter(Boolean))];
  const here = await pool(asks, 16, exists);
  for (const p of pairs) {
    const entry = {};
    const tid = p.internalTrainerName;
    if (tid && !chara.has(tid) && !here.get(`${ART_SITE}static/data/chara/${tid}_1024.png`)) {
      for (const sl of serebiiTrainerSlugs(p)) if (await once(`${SEREBII}syncpairs/${sl}.png`, () => exists(`${SEREBII}syncpairs/${sl}.png`))) { entry.t = sl; break; }
    }
    const pid = p.internalPokemonName;
    if (pid && !stems.has(pid) && !here.get(`${ART_SITE}static/data/pkmn/${pid}_256.png`)) {
      for (const nm of serebiiPokemonNames(p)) if (await once(`${SEREBII}pokemon/${nm}.png`, () => exists(`${SEREBII}pokemon/${nm}.png`))) { entry.p = nm; break; }
    }
    if (entry.t || entry.p) out[`${p.dexNumber}|${p.pokemonNumber}`] = entry;
  }
  return out;
}
export async function buildArt() {
  let prev = {}; try { prev = JSON.parse(fs.readFileSync('data/pkmn-art.json', 'utf8')).pkmn || {}; } catch { /* first run */ }
  const pkmn = await addShiny(parseArt(await getText(`${ART_SITE}pkmn`), prev), prev);
  const n = Object.values(pkmn).reduce((a, l) => a + l.length, 0);
  if (n < 600) throw new Error(`Only ${n} pictures found: the page layout may have changed`);
  const backup = await backups();
  return { file: 'data/pkmn-art.json', items: n, note: `${Object.keys(pkmn).length} Pokémon; Serebii backup for ${Object.keys(backup).length} pairs`,
    data: { site: ART_SITE, backupSite: SEREBII, pkmn, backup } };
}
if (process.argv[1]?.endsWith('build-art.mjs')) {
  const r = await buildArt();
  console.log(`${r.file}: ${writeIfChanged(r.file, r.data) ? 'updated' : 'unchanged'} — ${r.items} pictures, ${r.note}`);
}
