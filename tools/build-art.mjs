// Index of the Pokémon pictures of pmrandom.dpdns.org (the game's own 3D renders, 256 px), so a pair's Mega, Gigantamax or other form can be found.
//   node tools/build-art.mjs     → writes data/pkmn-art.json
// Each picture is pm<number>_<form>_<name>_256.png. The index keeps, per national dex number: [form code, name part, display name].
// (Trainer pictures need no index: their names come straight from the tracker's internalTrainerName.)
import { getText, writeIfChanged } from './lib.mjs';

export const ART_SITE = 'https://pmrandom.dpdns.org/';

export function parseArt(html) {
  const pkmn = {};
  for (const m of html.matchAll(/<img id="normal_pm(\d{4})_(\d\d)_([^"]+)" data-src="[^"]+" alt="([^"]*)"/g)) {
    const [, num, code, stem, name] = m;
    (pkmn[num] ||= []).push([code, stem, name.replace(/&amp;/g, '&').replace(/&#0?39;/g, '’').trim()]);
  }
  return pkmn;
}
export async function buildArt() {
  const pkmn = parseArt(await getText(`${ART_SITE}pkmn`));
  const n = Object.values(pkmn).reduce((a, l) => a + l.length, 0);
  if (n < 600) throw new Error(`Only ${n} pictures found: the page layout may have changed`);
  return { file: 'data/pkmn-art.json', items: n, note: `${Object.keys(pkmn).length} Pokémon`,
    data: { site: ART_SITE, pkmn } };
}
if (process.argv[1]?.endsWith('build-art.mjs')) {
  const r = await buildArt();
  console.log(`${r.file}: ${writeIfChanged(r.file, r.data) ? 'updated' : 'unchanged'} — ${r.items} pictures, ${r.note}`);
}
