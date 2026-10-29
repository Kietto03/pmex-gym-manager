// Index of the Pokémon pictures of pmrandom.dpdns.org (the game's own 3D renders, 256 px), so a pair's Mega, Gigantamax or other form can be found.
//   node tools/build-art.mjs     → writes data/pkmn-art.json
// Each picture is pm<number>_<form>_<name>_256.png. The index keeps, per national dex number: [form code, name part, display name].
// (Trainer pictures need no index: their names come straight from the tracker's internalTrainerName.)
import { getText, getJson, writeIfChanged, exists, POMA_SITE } from './lib.mjs';

export const ART_SITE = 'https://pmrandom.dpdns.org/';
export const SEREBII = 'https://www.serebii.net/pokemonmasters/';

export function parseArt(html) {
  const pkmn = {};
  for (const m of html.matchAll(/<img id="normal_pm(\d{4})_(\d\d)_([^"]+)" data-src="[^"]+" alt="([^"]*)"/g)) {
    const [, num, code, stem, name] = m;
    (pkmn[num] ||= []).push([code, stem, name.replace(/&amp;/g, '&').replace(/&#0?39;/g, '’').trim()]);
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
  if (!m) return [];
  const named = POKE_FORMS[`${m[1]}_${m[2]}`];
  if (named) return [named];
  return m[2] === '00' ? [String(+m[1]).padStart(3, '0')] : [];
}
export const parseIds = (html, re) => new Set([...html.matchAll(re)].map(m => m[1]));

// For each pair whose picture pmrandom does not have: the Serebii one, if there is one. Keyed "<dexNumber>|<pokemonNumber>" like the tracker.
async function backups() {
  const pairs = (await getJson(`${POMA_SITE}js/syncpairs.json`)).SYNCPAIRS || [];
  const chara = parseIds(await getText(`${ART_SITE}characters`), /static\/data\/chara\/(ch\d{4}_\d\d_[A-Za-z0-9]+)_1024\.png/g);
  const stems = parseIds(await getText(`${ART_SITE}pkmn`), /static\/data\/pkmn\/(pm\d{4}_\d\d_[^"']+?)_256\.png/g);
  const out = {}, seen = new Map();
  const once = (url, f) => { if (!seen.has(url)) seen.set(url, f()); return seen.get(url); };
  for (const p of pairs) {
    const entry = {};
    const tid = p.internalTrainerName;
    if (tid && !chara.has(tid) && !(await once(`${ART_SITE}static/data/chara/${tid}_1024.png`, () => exists(`${ART_SITE}static/data/chara/${tid}_1024.png`)))) {
      for (const sl of serebiiTrainerSlugs(p)) if (await once(`${SEREBII}syncpairs/${sl}.png`, () => exists(`${SEREBII}syncpairs/${sl}.png`))) { entry.t = sl; break; }
    }
    const pid = p.internalPokemonName;
    if (pid && !stems.has(pid) && !(await once(`${ART_SITE}static/data/pkmn/${pid}_256.png`, () => exists(`${ART_SITE}static/data/pkmn/${pid}_256.png`)))) {
      for (const nm of serebiiPokemonNames(p)) if (await once(`${SEREBII}pokemon/${nm}.png`, () => exists(`${SEREBII}pokemon/${nm}.png`))) { entry.p = nm; break; }
    }
    if (entry.t || entry.p) out[`${p.dexNumber}|${p.pokemonNumber}`] = entry;
  }
  return out;
}
export async function buildArt() {
  const pkmn = parseArt(await getText(`${ART_SITE}pkmn`));
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
