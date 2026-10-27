// Trainer Lodge topics (what each Sync Pair likes) from Serebii.
//   node tools/build-lodge.mjs     → writes data/lodge.json
import { getText, writeIfChanged } from './lib.mjs';

const URL_ = 'https://www.serebii.net/pokemonmasters/trainerlodgetopics.shtml';
const decode = s => s.replace(/&eacute;/g, 'é').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, '');

export function parseLodge(html) {
  const trainers = [];
  for (const m of html.matchAll(/<a name="([^"]+)"><h3>([^<]+)<\/h3><\/td><\/table><\/td><\/tr>([\s\S]*?)<\/table>/g)) {
    const [, id, name, body] = m;
    const cols = [...body.matchAll(/<td class="fooinfo"[^>]*>([\s\S]*?)<\/td>/g)].map(x => x[1]);
    if (cols.length !== 3) continue;
    const topics = {};
    ['5', '7', '10'].forEach((pts, i) => {
      topics[pts] = cols[i].split(/<br\s*\/?>/).map(x => decode(x.replace(/<[^>]+>/g, '')).trim()).filter(Boolean).map(x => {
        const k = x.lastIndexOf(' - ');
        const cat = k < 0 ? '' : x.slice(k + 3).trim();
        return [k < 0 ? x : x.slice(0, k).trim(), cat === 'Pokemon' ? 'Pokémon' : cat];
      });
    });
    trainers.push({ id, name: decode(name).trim(), icon: `https://www.serebii.net/pokemonmasters/syncpairs/icons/${id}.png`, topics });
  }
  return trainers;
}
export async function buildLodge() {
  const trainers = parseLodge(await getText(URL_));
  if (trainers.length < 40) throw new Error(`Only ${trainers.length} trainers found: the page layout may have changed`);
  const topics = trainers.reduce((a, t) => a + Object.values(t.topics).flat().length, 0);
  return { file: 'data/lodge.json', items: trainers.length, note: `${topics} topics`,
    data: { source: URL_, fetched: new Date().toISOString().slice(0, 10), note: 'Topics a Sync Pair likes, by the points they give (5 / 7 / 10). Copied for lookup; Serebii is the source.', trainers } };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  buildLodge().then(r => console.log(`${r.items} sync pairs, ${r.note}${writeIfChanged(r.file, r.data) ? '' : ' (no change)'}`)).catch(e => { console.error(e.message); process.exit(1); });
}
