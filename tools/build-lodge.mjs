// Refreshes data/lodge.json from Serebii's Trainer Lodge topics page (the topics each Sync Pair likes).
// Usage: node tools/build-lodge.mjs     — then check the diff and commit.
import fs from 'node:fs';

const URL_ = 'https://www.serebii.net/pokemonmasters/trainerlodgetopics.shtml';
const res = await fetch(URL_, { headers: { 'user-agent': 'Mozilla/5.0 (pmex-gym-manager)' } });
if (!res.ok) throw new Error(`Serebii answered ${res.status}`);
const html = await res.text();
const decode = s => s.replace(/&eacute;/g, 'é').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, '');
const trainers = [];
for (const m of html.matchAll(/<a name="([^"]+)"><h3>([^<]+)<\/h3><\/td><\/table><\/td><\/tr>([\s\S]*?)<\/table>/g)) {
  const [, id, name, body] = m;
  const cols = [...body.matchAll(/<td class="fooinfo"[^>]*>([\s\S]*?)<\/td>/g)].map(x => x[1]);
  if (cols.length !== 3) { console.warn('skipped', name, cols.length); continue; }
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
if (trainers.length < 40) throw new Error(`Only ${trainers.length} trainers found: the page layout may have changed`);
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/lodge.json', JSON.stringify({ source: URL_, fetched: new Date().toISOString().slice(0, 10),
  note: 'Topics a Sync Pair likes, by the points they give (5 / 7 / 10). Copied for lookup; Serebii is the source.', trainers }));
console.log(`${trainers.length} sync pairs, ${trainers.reduce((a, t) => a + Object.values(t.topics).flat().length, 0)} topics`);
