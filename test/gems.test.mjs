// Run: node test/gems.test.mjs — Free Gems projection rules (src/gems.js)
import assert from 'node:assert/strict';
import { groupEvents, eventStatus, project, serverToday, monthEnd, addDays } from '../src/gems.js';

const R = (id, kind, start_date, end_date, free_gems, extra = {}) => ({ id, label: `r${id}`, kind, start_date, end_date, free_gems, ...extra });
assert.equal(monthEnd('2026-10-26'), '2026-10-31');
assert.equal(monthEnd('2026-02-03'), '2026-02-28');
assert.equal(addDays('2026-10-31', 1), '2026-11-01');

// from the 26th to the end of October
const p = project([
  R(1, 'daily', '2026-10-01', '2026-10-31', 10),            // 6 days left: 26..31
  R(2, 'on_date', '2026-10-28', '2026-10-28', 300),
  R(3, 'on_date', '2026-10-20', '2026-10-20', 999),         // already past: not counted
  R(4, 'window', '2026-10-24', '2026-10-30', 500),          // claimable now, no fixed day
  R(5, 'window', '2026-10-29', '2026-11-05', 200),          // upcoming, overlaps the month
  R(6, 'window', '2026-11-02', '2026-11-09', 700),          // next month: outside
  R(7, 'daily', '2026-10-25', '2026-11-03', 20),            // crosses the month: only 26..31 counts
  R(8, 'on_date', '2026-10-30', '2026-10-30', null),        // amount unknown
], '2026-10-26', '2026-10-31');
assert.equal(p.rows.length, 6);
assert.equal(p.rows[0].total, 30, '10 + 20 on the 26th');
assert.equal(p.rows[2].total, 330, '10 + 20 + 300 on the 28th');
assert.equal(p.totals.days, 6 * 30 + 300);
assert.equal(p.totals.windows, 700, 'two windows counted once each, on no day');
assert.equal(p.totals.all, 6 * 30 + 300 + 700);
assert.equal(p.rows.at(-1).cumulative, p.totals.days, 'the days add up to the month total');
assert.deepEqual(p.windows.map(w => [w.reward.id, w.state]), [[4, 'open'], [5, 'upcoming']]);
assert.deepEqual(p.incomplete.map(r => r.id), [8], 'an unknown amount is listed, not counted as 0');
assert.deepEqual(p.past.map(r => r.id), [3]);

// the server day is not the viewer's day
const noon = Date.parse('2026-10-26T18:00:00Z');
assert.equal(serverToday({ reset_timezone: 'Asia/Tokyo', reset_hour: 0 }, noon), '2026-10-27');
assert.equal(serverToday({ reset_timezone: 'UTC', reset_hour: 0 }, noon), '2026-10-26');
assert.equal(serverToday({ reset_timezone: 'UTC', reset_hour: 20 }, noon), '2026-10-25', 'before the reset hour it is still the previous server day');
// looking at the whole month from the 1st, with the 26th as today: what is behind and what is ahead
const whole = project([R(1, 'daily', '2026-10-01', '2026-10-31', 10), R(2, 'on_date', '2026-10-05', '2026-10-05', 300), R(3, 'window', '2026-10-24', '2026-10-30', 500)], '2026-10-01', '2026-10-31', '2026-10-26');
assert.equal(whole.rows.length, 31); assert.equal(whole.rows[4].total, 310); assert.equal(whole.rows[4].past, true); assert.equal(whole.rows[25].past, false);
assert.equal(whole.totals.earned, 25 * 10 + 300, 'days before the 26th are earned');
assert.equal(whole.totals.ahead, 6 * 10 + 500, 'the 26th on, with the one-off still open');
assert.equal(whole.totals.all, 31 * 10 + 300 + 500);
assert.equal(whole.windows[0].state, 'open');
// the column "still to come": what is left after each day, to the end of the month
assert.equal(whole.rows[0].left, 31 * 10 + 300 - 10, 'after the 1st everything but its 10 is left');
assert.equal(whole.rows[4].left, 31 * 10 + 300 - (5 * 10 + 300), 'after the 5th, with the 300 of that day in');
assert.equal(whole.rows[30].left, 0, 'after the last day nothing is left');
assert.ok(whole.rows.every((r, i, a) => !i || r.left <= a[i - 1].left), 'it only goes down');
assert.ok(whole.rows.every(r => r.left + r.cumulative === whole.totals.days), 'what is behind plus what is left is the month');
// the event list: grouped by the moment an event starts, what began earlier first
const E = (title, start, end, extra = {}) => ({ title, start: start.slice(0, 10), startAt: start.length > 10 ? start : undefined, end: end.slice(0, 10), endAt: end.length > 10 ? end : undefined, ...extra });
const evs = [E('Late', '2026-11-12T06:00', '2026-12-01T06:00'), E('Early A', '2026-11-02T06:00', '2026-11-20T06:00'), E('Early B', '2026-11-02T06:00', '2026-11-09T06:00'), E('Before', '2026-10-20T06:00', '2026-11-05T06:00'), E('Sheet only', '2026-11-12', '2026-11-30'), E('After', '2026-12-03T06:00', '2026-12-20T06:00')];
const gr = groupEvents(evs.filter(e => e.end >= '2026-11-01' && e.start <= '2026-11-30'), '2026-11-01', '2026-11-30');
assert.deepEqual(gr.running.map(e => e.title), ['Before'], 'started before the month, still running');
assert.deepEqual(gr.groups.map(g => `${g.date} ${g.time}`), ['2026-11-02 06:00', '2026-11-12 ', '2026-11-12 06:00'].sort(), 'by start moment, in order');
assert.deepEqual(gr.groups.find(g => g.date === '2026-11-02').events.map(e => e.title), ['Early A', 'Early B'], 'events that start together share a group');
assert.equal(gr.groups.find(g => g.key === '2026-11-12').time, '', 'an event known only by its day has no time');
const now = Date.parse('2026-11-10T00:00:00Z');
assert.deepEqual(eventStatus(E('x', '2026-11-12T06:00', '2026-12-01T06:00'), now), { state: 'upcoming', ms: Date.parse('2026-11-12T06:00Z') - now });
assert.equal(eventStatus(E('x', '2026-11-02T06:00', '2026-11-20T06:00'), now).state, 'running');
assert.equal(eventStatus(E('x', '2026-11-02T06:00', '2026-11-20T06:00'), now).ms, Date.parse('2026-11-20T06:00Z') - now);
assert.equal(eventStatus(E('x', '2026-10-02T06:00', '2026-11-05T06:00'), now).state, 'ended');
assert.equal(eventStatus(E('x', '2026-11-02', '2026-11-10'), now).state, 'running', 'a day-only event runs to the end of its last day');
assert.equal(eventStatus({ title: 'x', start: '2026-11-02', end: '2026-11-02', open: true }, now).ms, null, 'no end date: no countdown');
console.log('gems projection: all passed');
