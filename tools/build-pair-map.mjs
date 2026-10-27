// Maps "<trainer>|<pokemon>" (lower case, the key pair-tags.json uses) to the id of the pair's file in the Dex build,
// so the app can open the moves, passives and grid of a sync pair from the tracker's catalog.
//   node tools/build-pair-map.mjs            reads the published Dex site (DEX_SITE to change it)
// Two pairs sharing a name keep the id that sorts first.
import { getText, writeIfChanged, DEX_SITE } from './lib.mjs';

export function mapPairs(pairs) {
  const map = {}, clashes = [];
  for (const p of [...pairs].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const key = `${p.trainer}|${p.pokemon}`.toLowerCase();
    if (map[key] && map[key] !== p.id) { clashes.push(key); continue; }
    map[key] = p.id;
  }
  return { map, clashes };
}
export async function buildPairMap() {
  const js = await getText(`${DEX_SITE}data/data.js`);
  const data = JSON.parse(js.slice(js.indexOf('=') + 1, js.lastIndexOf(';')));
  if (!data.pairs?.length || data.pairs.length < 300) throw new Error(`The Dex lists only ${data.pairs?.length ?? 0} pairs: not used`);
  const { map, clashes } = mapPairs(data.pairs);
  return { file: 'data/pair-map.json', items: Object.keys(map).length, note: `Dex build ${String(data.builtAt || '').slice(0, 10)}, versions ${(data.versions || []).join(', ')}; ${clashes.length} shared names`,
    data: { built: new Date().toISOString().slice(0, 10), dexBuilt: data.builtAt || null, pairs: map } };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  buildPairMap().then(r => console.log(`${r.items} pairs mapped, ${r.note}${writeIfChanged(r.file, r.data) ? '' : ' (no change)'}`)).catch(e => { console.error(e.message); process.exit(1); });
}
