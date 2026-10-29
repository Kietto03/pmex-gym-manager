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
