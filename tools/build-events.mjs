// The event calendar: scouts (banners) with their dates, from the Dex build of the datamine.
//   node tools/build-events.mjs     → writes data/events.json
import { getText, writeIfChanged, DEX_SITE } from './lib.mjs';

export function parseScouts(data) {
  return (data.scouts || []).filter(x => x.start).map(x => ({
    id: x.id, title: x.title || x.id, type: x.scoutType || '', start: x.start, end: x.end || null, version: x.version || '',
    rateUp: (x.rateUp || []).map(r => ({ trainer: r.trainer, pokemon: r.pokemon })).filter(r => r.trainer),
  })).sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}
export async function buildEvents() {
  const js = await getText(`${DEX_SITE}data/data.js`);
  const data = JSON.parse(js.slice(js.indexOf('=') + 1, js.lastIndexOf(';')));
  const events = parseScouts(data);
  if (events.length < 30) throw new Error(`Only ${events.length} scouts in the Dex: not used`);
  return { file: 'data/events.json', items: events.length, note: `${events[0].start.slice(0, 10)} → ${events.at(-1).start.slice(0, 10)}`,
    data: { source: `${DEX_SITE}`, fetched: new Date().toISOString(), note: 'Scout banners of the game with their times (UTC), from the datamine.', events } };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  buildEvents().then(r => console.log(`${r.items} events, ${r.note}${writeIfChanged(r.file, r.data) ? '' : ' (no change)'}`)).catch(e => { console.error(e.message); process.exit(1); });
}
