// Maps "<trainer>|<pokemon>" (lower case, the key pair-tags.json uses) to the id of the pair's file in the Dex build,
// so the app can open the moves, passives and grid of a sync pair from the tracker's catalog.
// Usage: node tools/build-pair-map.mjs [path-to-dex-site]   (default ~/Code/pmex-datamine-dex/site)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const site = process.argv[2] || path.join(os.homedir(), 'Code/pmex-datamine-dex/site');
const dir = path.join(site, 'data/pairs');
const map = {}, clashes = [];
for (const f of fs.readdirSync(dir).sort()) {
  const s = fs.readFileSync(path.join(dir, f), 'utf8');
  const j = JSON.parse(s.slice(s.indexOf('",') + 2, s.lastIndexOf(')')));
  const key = `${j.trainer}|${j.pokemon}`.toLowerCase();
  if (map[key] && map[key] !== j.id) { clashes.push(`${key}: ${map[key]} / ${j.id}`); continue; }   // the first one (lowest file name) wins
  map[key] = j.id;
}
const tags = JSON.parse(fs.readFileSync(path.join(site, 'data/pair-tags.json'), 'utf8'));
const missing = Object.keys(tags).filter(k => !map[k]);
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/pair-map.json', JSON.stringify({ built: new Date().toISOString().slice(0, 10), pairs: map }));
console.log(`${Object.keys(map).length} pairs mapped, ${clashes.length} clashing names (first kept), ${missing.length} tagged pairs without a file`);
if (clashes.length) console.log(clashes.slice(0, 8).join('\n'));
if (missing.length) console.log('no file for:', missing.slice(0, 8).join(', '));
