// Run: node test/sync-ranking.test.mjs — the D.C ranking sheet parser, on a saved copy
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCsv } from '../tools/sync-gems.mjs';
import { parseRanking, parseUnit } from '../tools/sync-ranking.mjs';

assert.deepEqual(parseUnit('Red 1996\n5 EX R'), { name: 'Red 1996', level: 5, ex: true, exr: true });
assert.deepEqual(parseUnit('Volvo (Anni)\n5 EX'), { name: 'Volvo (Anni)', level: 5, ex: true, exr: false });
const rows = parseRanking(parseCsv(fs.readFileSync(new URL('./fixtures/dc-ranking.csv', import.meta.url), 'utf8')));
assert.equal(rows.length, 17);
assert.equal(rows[0].type, 'Electric'); assert.equal(rows[0].score, 87628783); assert.equal(rows[0].units.length, 3);
assert.equal(rows[0].units[0].name, 'Red 1996'); assert.match(rows[0].video, /^https:\/\/youtu\.be\//);
assert.ok(rows.every(r => r.units.length === 3 && r.score > 1e7 && r.video), 'every type has a score, three pairs and a video');
assert.ok(rows.every((r, i, a) => !i || a[i - 1].score >= r.score), 'ranked by score');
console.log('D.C ranking parser: all passed');
