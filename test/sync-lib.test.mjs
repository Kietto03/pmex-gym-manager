// Run: node test/sync-lib.test.mjs — the bookkeeping of the data sync (tools/lib.mjs)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeIfChanged, nextStatus, settle, health, ageDays } from '../tools/lib.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-'));
const f = path.join(dir, 'x.json');
assert.equal(writeIfChanged(f, { a: 1, fetched: 'monday' }), true, 'a new file is written');
assert.equal(writeIfChanged(f, { a: 1, fetched: 'tuesday' }), false, 'only the fetch time changed: no write');
assert.equal(writeIfChanged(f, { a: 2, fetched: 'tuesday' }), true, 'real change: written');
assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { a: 2, fetched: 'tuesday' });

const def = { label: 'X', feeds: 'y', kind: 'file', staleAfterDays: 7, url: 'u' };
const good = nextStatus(null, def, { changed: true, items: 5, note: 'n' }, '2026-10-01T00:00:00Z');
assert.equal(good.ok, true); assert.equal(good.lastOk, '2026-10-01T00:00:00Z'); assert.equal(good.since, '2026-10-01T00:00:00Z');
const quiet = nextStatus(good, def, { changed: false, items: 5 }, '2026-10-02T00:00:00Z');
assert.equal(quiet.since, '2026-10-01T00:00:00Z', '"since" moves only when the data changed');
const bad = nextStatus(quiet, def, { error: 'boom' }, '2026-10-03T00:00:00Z');
assert.equal(bad.ok, false); assert.equal(bad.lastOk, '2026-10-02T00:00:00Z', 'a failure keeps the last good time'); assert.equal(bad.items, 5, 'and the last item count');
const now = Date.parse('2026-10-04T00:00:00Z');
assert.equal(health(quiet, now), 'fresh');
assert.equal(health(bad, now), 'failed');
assert.equal(health(quiet, Date.parse('2026-10-20T00:00:00Z')), 'stale');
assert.equal(health(nextStatus(null, { ...def, kind: 'manual' }, {}), now), 'manual');
assert.equal(health(undefined), 'never');
assert.equal(health(nextStatus(null, def, { error: 'x' })), 'never', 'never worked');
assert.equal(ageDays('2026-10-01T00:00:00Z', Date.parse('2026-10-04T12:00:00Z')), 3);
const recent = nextStatus(null, def, { changed: false, items: 5 }, '2026-10-05T10:00:00Z');
const again = nextStatus(recent, def, { changed: false, items: 5 }, '2026-10-05T16:00:00Z');
assert.equal(settle(recent, again, Date.parse('2026-10-05T16:00:00Z')).lastOk, '2026-10-05T10:00:00Z', 'within 20 h of the last confirmation the old time stays (no commit)');
assert.equal(settle(recent, again, Date.parse('2026-10-06T16:00:00Z')).lastOk, '2026-10-05T16:00:00Z', 'after that the time moves on');
const changedNow = nextStatus(recent, def, { changed: true, items: 6 }, '2026-10-05T16:00:00Z');
assert.equal(settle(recent, changedNow, Date.parse('2026-10-05T16:00:00Z')).lastOk, '2026-10-05T16:00:00Z', 'a real change always records the time');
console.log('sync bookkeeping: all passed');
