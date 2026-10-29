// The event calendar: scouts (banners) with their dates, from the Dex build of the datamine.
//   node tools/build-events.mjs     → writes data/events.json
import fs from 'node:fs';
import { getText, writeIfChanged, exists, DEX_SITE } from './lib.mjs';

// The banner picture of a scout: brybry's schedule page keeps the game's own banners, named like the event id
export const BANNER_SITE = 'https://pokemon.brybry.ch/masters/data/banner/scout/';
const DAY = 864e5;

export function parseScouts(data) {
  return (data.scouts || []).filter(x => x.start).map(x => ({
    id: x.id, title: x.title || x.id, type: x.scoutType || '', start: x.start, end: x.end || null, version: x.version || '',
    rateUp: (x.rateUp || []).map(r => ({ trainer: r.trainer, pokemon: r.pokemon })).filter(r => r.trainer),
  })).sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}
// Marks each event: banner 1 = it has one, 0 = it was asked and has none, no field = never asked. A banner never goes away, so a known answer is kept; one that was missing is asked
// again only while the event is recent or soon (the site adds the banner around the start), so a run makes a handful of requests.
export async function addBanners(events, prev = new Map(), check = id => exists(`${BANNER_SITE}${id}.png`), now = Date.now()) {
  const out = [];
  for (const e of events) {
    const had = prev.get(e.id), recent = Math.abs(Date.parse(`${e.start}Z`) - now) < 21 * DAY;
    const has = had === true ? true : had === false && !recent ? false : await check(e.id);
    out.push({ ...e, banner: has ? 1 : 0 });
  }
  return out;
}
const knownBanners = file => { try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return new Map(j.events.filter(e => e.banner === 1 || e.banner === 0).map(e => [e.id, e.banner === 1])); } catch { return new Map(); } };
export async function buildEvents() {
  const js = await getText(`${DEX_SITE}data/data.js`);
  const data = JSON.parse(js.slice(js.indexOf('=') + 1, js.lastIndexOf(';')));
  const events = await addBanners(parseScouts(data), knownBanners('data/events.json'));
  if (events.length < 30) throw new Error(`Only ${events.length} scouts in the Dex: not used`);
  return { file: 'data/events.json', items: events.length, note: `${events[0].start.slice(0, 10)} → ${events.at(-1).start.slice(0, 10)}; ${events.filter(e => e.banner === 1).length} banners`,
    data: { source: `${DEX_SITE}`, bannerSource: BANNER_SITE, fetched: new Date().toISOString(), note: 'Scout banners of the game with their times (UTC), from the datamine.', events } };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  buildEvents().then(r => console.log(`${r.items} events, ${r.note}${writeIfChanged(r.file, r.data) ? '' : ' (no change)'}`)).catch(e => { console.error(e.message); process.exit(1); });
}
