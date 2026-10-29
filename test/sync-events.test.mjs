import assert from 'node:assert/strict';
import { parseScouts, addBanners } from '../tools/build-events.mjs';

const now = Date.parse('2026-10-29T00:00:00Z');
const ev = (id, start) => ({ id, title: id, type: 'Scout', start, end: null, version: '', rateUp: [] });
const events = [ev('old_has', '2026-01-01T06:00'), ev('old_missing', '2026-02-01T06:00'), ev('old_unknown', '2026-03-01T06:00'), ev('soon_missing', '2026-11-05T06:00'), ev('new_one', '2026-10-30T06:00')];
const asked = [];
const out = await addBanners(events, new Map([['old_has', true], ['old_missing', false], ['soon_missing', false]]), async id => { asked.push(id); return id === 'new_one' || id === 'old_unknown'; }, now);
assert.deepEqual(out.map(e => e.banner), [1, 0, 1, 0, 1]);
assert.deepEqual(asked.sort(), ['new_one', 'old_unknown', 'soon_missing'], 'a known banner and an old missing one are not asked again; an unknown, a recent or an upcoming one is');
assert.equal(out[1].banner, 0, 'asked once, none: 0');
const fresh = await addBanners([ev('never_asked', '2026-01-05T06:00')], new Map(), async () => true, now);
assert.equal(fresh[0].banner, 1, 'an event never asked about is asked');
assert.equal(parseScouts({ scouts: [{ id: 'a', start: '2026-01-01T06:00', rateUp: [{ trainer: 'Red', pokemon: 'Pikachu' }] }, { id: 'b' }] }).length, 1, 'a scout without a start is dropped');
console.log('event banners: all passed');

import { parseProgramme, kindOf } from '../tools/build-events.mjs';
const sec = s => String(Date.parse(`${s}Z`) / 1000);
const proto = {
  banner: [{ bannerId: 1, bannerIdString: 'hse_1', text1Id: 11, text2Id: 21 }, { bannerId: 2, bannerIdString: 'acad_1', text1Id: 12, text2Id: 22 }, { bannerId: 3, bannerIdString: 'rally', text1Id: 13, text2Id: -1 },
    { bannerId: 4, bannerIdString: 'champ_1', text1Id: 14, text2Id: -1 }, { bannerId: 5, bannerIdString: 'forever', text1Id: 11, text2Id: 21 }, { bannerId: 6, bannerIdString: 'old', text1Id: 11, text2Id: 21 }],
  schedule: [{ scheduleId: 's_hse', startDate: sec('2026-11-03T06:00'), endDate: sec('2026-11-12T06:00') }, { scheduleId: 's_acad', startDate: sec('2026-11-06T06:00'), endDate: sec('2026-11-30T06:00') },
    { scheduleId: 's_champ', startDate: sec('2026-11-02T06:00'), endDate: sec('2026-11-09T06:00') }, { scheduleId: 's_champ_CLOSE', startDate: sec('2026-11-02T06:00'), endDate: sec('2026-11-09T06:00') },
    { scheduleId: 's_forever', startDate: sec('2026-01-01T06:00'), endDate: '32503680000' }, { scheduleId: 's_old', startDate: sec('2023-01-01T06:00'), endDate: sec('2023-02-01T06:00') }],
  events: [{ bannerId: 1, scheduleId: 's_hse' }, { bannerId: 1, scheduleId: 's_hse' }, { bannerId: 2, scheduleId: 's_acad' }, { bannerId: 5, scheduleId: 's_forever' }, { bannerId: 6, scheduleId: 's_old' }],
  regions: [{ championBattleRegionId: 9, bannerId: 4 }], openings: [{ championBattleRegionId: 9, scheduleId: 's_champ' }, { championBattleRegionId: 9, scheduleId: 's_champ_CLOSE' }],
  missions: [{ bannerId: 1, scheduleId: 's_hse' }, { bannerId: 3, scheduleId: 's_acad' }], legends: [], legendSchedule: [],
  text: { 11: 'High Score Event', 21: 'Electric and\nGround Conqueror', 12: 'Academy Event', 22: 'Fair Prep', 13: 'Battle Rally missions\nupdated every month!', 14: 'Unova Challenge' },
};
const rows = parseProgramme(proto);
assert.deepEqual(rows.map(r => [r.kind, r.id]), [['stadium', 'champ_1'], ['hse', 'hse_1'], ['academy', 'acad_1'], ['mission', 'rally']], 'sorted by start; duplicates, the CLOSE schedule, permanent and old entries are dropped; an event hides its own mission');
assert.equal(rows[1].start, '2026-11-03T06:00'); assert.equal(rows[1].name, 'Electric and Ground Conqueror'); assert.equal(rows[1].head, 'High Score Event');
assert.equal(kindOf('Academy Founding Chapter', 'event'), 'academy'); assert.equal(kindOf('Ranked Damage Event', 'event'), 'battle'); assert.equal(kindOf('Special Monthly Event', 'event'), 'other');
const withDir = await addBanners(rows, new Map(), async (id, e) => e.dir === 'event', now);
assert.equal(withDir[1].banner, 2, 'an event banner is 2 (the event folder), a scout banner 1');
assert.ok(!('dir' in withDir[1]));
console.log('programme: all passed');
