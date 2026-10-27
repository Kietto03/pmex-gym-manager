// Run: node test/sync-gems.test.mjs — the Gems sheet parser, on saved copies of the sheet's tabs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCsv, parseTab, merge, num, isoDate } from '../tools/sync-gems.mjs';

assert.equal(num('1.450'), 1450); assert.equal(num('8,5'), 8.5); assert.equal(num(''), null); assert.equal(isoDate('05/11/2026'), '2026-11-05'); assert.equal(isoDate('Tháng 1'), null);
assert.deepEqual(parseCsv('a,"b,c","d\ne"\n1,2,3'), [['a', 'b,c', 'd\ne'], ['1', '2', '3']]);

const tab = g => parseTab(parseCsv(fs.readFileSync(new URL(`./fixtures/gems-${g}.csv`, import.meta.url), 'utf8')), g);
const oct = tab('1512284588'), nov = tab('793377460');
const day = (t, d) => t.days.find(x => x.date === d);
assert.equal(day(oct, '2026-10-25').gems, 3250, 'Daily 1.230 + Gym 2.020 on 25 Oct');
assert.deepEqual(day(oct, '2026-10-25').parts, { daily: 1230, gym: 2020, other: 0 });
assert.equal(day(oct, '2026-09-29').gems, 530);
assert.ok(oct.days.filter(d => d.date.startsWith('2026-10')).length >= 29, 'a whole month table');
assert.equal(oct.days.filter(d => d.date === '2026-10-25').length, 1, 'no day twice');
assert.equal(day(nov, '2026-11-02').gems, 1000, 'forecast: free-to-play total (200 + 50 + 750)');
assert.equal(day(nov, '2026-11-02').kind, 'forecast');
assert.ok(!nov.days.some(d => d.gems === 1200 && d.date === '2026-11-02'), 'the paid block is not read');
assert.ok(oct.banners.some(b => b.name === 'SS Ghetsis' && b.start === '2026-09-30' && b.end === '2026-10-18' && b.type === 'EX Fair'));
const summary = tab('130555523');
assert.equal(summary.months.find(m => m.month === 10).total, 24560);
const all = merge([oct, nov, summary, tab('264958992')]);
assert.equal(all.updated, '2026-10-27');
assert.ok(all.days.length > 100 && all.days.every((d, i, a) => !i || a[i - 1].date < d.date), 'merged, one row per day, in order');
console.log('gems sheet parser: all passed');
