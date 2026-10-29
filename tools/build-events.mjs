// The event calendar: scouts (Dex build of the datamine) plus events, Champion Stadium and missions (brybry's copy of the datamine).
//   node tools/build-events.mjs     → writes data/events.json
import fs from 'node:fs';
import { getText, getJson, writeIfChanged, exists, DEX_SITE } from './lib.mjs';

// The banner picture of a scout: brybry's schedule page keeps the game's own banners, named like the event id
export const BANNER_SITE = 'https://pokemon.brybry.ch/masters/data/banner/scout/';
const DAY = 864e5;

export function parseScouts(data) {
  return (data.scouts || []).filter(x => x.start).map(x => ({
    id: x.id, title: x.title || x.id, type: x.scoutType || '', start: x.start, end: x.end || null, version: x.version || '',
    rateUp: (x.rateUp || []).map(r => ({ trainer: r.trainer, pokemon: r.pokemon })).filter(r => r.trainer),
  })).sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}
// The rest of the game's calendar (events, Champion Stadium, missions), from brybry's copy of the datamine. A banner's first line is the
// category the game prints on it ("High Score Event"), the second the name. Times are in seconds; the game's own schedule table holds them.
export const PROTO_SITE = 'https://pokemon.brybry.ch/masters/data/';
export const SINCE = '2025-01-01';
export const kindOf = (label, src) => {
  if (src === 'champ') return 'stadium';
  if (src === 'mission') return 'mission';
  const l = String(label || '').toLowerCase();
  if (/high score/.test(l)) return 'hse';
  if (/academy/.test(l)) return 'academy';
  if (/story|villain|solo event|costume|trainer files|special sync pair|30-year|arc celebration|legendary event|welcome|beginners/.test(l)) return 'story';
  if (/battle|damage|neo champions|time trial|challenge|legendary arena|gym/.test(l)) return 'battle';
  return 'other';
};
const oneLine = s => String(s || '').replace(/\s+/g, ' ').trim();
const iso = sec => new Date(sec * 1000).toISOString().slice(0, 16);
export function parseProgramme({ banner, schedule, events, regions, openings, missions, legends, legendSchedule, text }, since = SINCE) {
  const ban = new Map(banner.map(b => [b.bannerId, b]));
  const sch = new Map(); for (const s of schedule) if (!sch.has(s.scheduleId)) sch.set(s.scheduleId, s);
  const region = new Map(regions.map(r => [r.championBattleRegionId, r]));
  const legend = new Map(legends.map(g => [String(g.questGroupId), g]));
  const rows = [], seen = new Set();
  const add = (src, bannerId, scheduleId) => {
    const b = ban.get(bannerId), s = sch.get(scheduleId);
    if (!b || !s || /^QA_|_CLOSE$/.test(scheduleId) || !b.bannerIdString) return;
    const head = oneLine(text[b.text1Id]), name = b.text2Id > -1 ? oneLine(text[b.text2Id]) : '';
    if (!head) return;
    const start = +s.startDate, end = +s.endDate;
    if (end >= 4e9 || iso(end) < since) return;   // permanent entries and what ended before the window are left out
    const key = `${b.bannerIdString}|${start}`;
    if (seen.has(key)) return;   // an event and its missions share one banner: the event wins (events are read first)
    seen.add(key);
    rows.push({ id: b.bannerIdString, title: name ? `${head} · ${name}` : head, head, name, type: head, kind: kindOf(head, src), start: iso(start), end: iso(end), dir: 'event' });
  };
  for (const e of events) add('event', e.bannerId, e.scheduleId);
  for (const o of openings) add('champ', region.get(o.championBattleRegionId)?.bannerId, o.scheduleId);
  for (const l of legendSchedule) add('legend', legend.get(String(l.questGroupId))?.bannerId, l.scheduleId);
  for (const m of missions) add('mission', m.bannerId, m.scheduleId);
  return rows.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}
// Marks each event: banner 1 = a scout banner, 2 = an event banner, 0 = it was asked and has none, no field = never asked. A banner never goes away,
// so a known answer is kept; one that was missing is asked again only while the event is recent or soon (the site adds the banner around the start).
export async function addBanners(events, prev = new Map(), check = defaultCheck, now = Date.now()) {
  const out = [];
  for (const e of events) {
    const had = prev.get(e.id), known = had === true ? 1 : had === false ? 0 : had, recent = Math.abs(Date.parse(`${e.start}Z`) - now) < 21 * DAY;
    let v = known > 0 ? known : known === 0 && !recent ? 0 : await check(e.id, e);
    if (v === true) v = e.dir === 'event' ? 2 : 1;
    const { dir, ...rest } = e;
    out.push({ ...rest, banner: v || 0 });
  }
  return out;
}
async function defaultCheck(id, e) {
  if (e.dir === 'event') return (await exists(`${PROTO_SITE}banner/event/${id}.png`)) ? 2 : (await exists(`${BANNER_SITE}${id}.png`)) ? 1 : 0;
  return (await exists(`${BANNER_SITE}${id}.png`)) ? 1 : 0;
}
const knownBanners = file => { try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return new Map(j.events.filter(e => typeof e.banner === 'number').map(e => [e.id, e.banner])); } catch { return new Map(); } };
const proto = async f => (await getJson(`${PROTO_SITE}proto/${f}.json`)).entries;
async function fetchProgramme() {
  const [banner, schedule, events, regions, openings, missions, legends, legendSchedule, text] = await Promise.all([proto('Banner'), proto('Schedule'), proto('EventQuestGroup'), proto('ChampionBattleRegion'),
    proto('ChampionBattleRegionOpeningSchedule'), proto('MissionGroup'), proto('LegendQuestGroup'), proto('LegendQuestGroupSchedule'), getJson(`${PROTO_SITE}lsd/banner_text_en.json`)]);
  return parseProgramme({ banner, schedule, events, regions, openings, missions, legends, legendSchedule, text });
}
export async function buildEvents() {
  const js = await getText(`${DEX_SITE}data/data.js`);
  const data = JSON.parse(js.slice(js.indexOf('=') + 1, js.lastIndexOf(';')));
  const scouts = parseScouts(data).map(e => ({ ...e, kind: 'scout' }));
  if (scouts.length < 30) throw new Error(`Only ${scouts.length} scouts in the Dex: not used`);
  let rest = [];
  try { rest = await fetchProgramme(); } catch (e) { console.warn(`Programme not read (${e.message}): scouts only`); }
  if (!rest.length) { try { rest = JSON.parse(fs.readFileSync('data/events.json', 'utf8')).events.filter(e => e.kind && e.kind !== 'scout').map(e => ({ ...e, dir: 'event' })); } catch { /* none kept */ } }   // the last good copy stays when brybry is down
  const events = await addBanners([...scouts, ...rest], knownBanners('data/events.json'));
  return { file: 'data/events.json', items: events.length, note: `${events[0].start.slice(0, 10)} → ${events.at(-1).start.slice(0, 10)}; ${events.filter(e => e.banner > 0).length} banners, ${rest.length} other events`,
    data: { source: `${DEX_SITE}`, bannerSource: BANNER_SITE, programmeSource: PROTO_SITE, fetched: new Date().toISOString(), note: 'Scouts (Dex datamine) and the rest of the calendar: events, Champion Stadium, missions (brybry). Times are UTC.', events } };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  buildEvents().then(r => console.log(`${r.items} events, ${r.note}${writeIfChanged(r.file, r.data) ? '' : ' (no change)'}`)).catch(e => { console.error(e.message); process.exit(1); });
}
