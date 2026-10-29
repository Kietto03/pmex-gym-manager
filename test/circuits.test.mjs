import assert from 'node:assert/strict';
import { circuitAt, circuitGuide, roundShort } from '../src/circuits.js';

const season = { leaders: Array(8).fill({}), target_score: 1_000_000, circuits: [
  { name: 'Circuit 1', kind: 'Regular Battle', pts: 10000 }, { name: 'Circuit 2', kind: 'Regular Battle', pts: 20000 },
  { name: 'Extra Battle 1', kind: 'Extra Battle', pts: 50000 }, { name: 'Extra Battle 2 and onward', kind: 'Extra Battle', pts: 100000 }] };
assert.equal(circuitAt(season, 2).fixed, 3, 'a regular battle always costs three tickets');
assert.equal(circuitAt(season, 4).label, 'Extra Battle 2');
assert.equal(circuitAt(season, 6).label, 'Extra Battle 4', 'past the last circuit it repeats');
assert.equal(circuitAt(season, 0), null);
assert.equal(roundShort('Circuit 3'), 'C3'); assert.equal(roundShort('Extra Battle 12 and onward'), 'EX12');

const g = circuitGuide(season);
assert.deepEqual(g.rows.slice(0, 3).map(r => [r.label, r.pts, r.total, r.cumulative]), [['Circuit 1', 10000, 80000, 80000], ['Circuit 2', 20000, 160000, 240000], ['Extra Battle 1', 50000, 400000, 640000]], 'a round is worth its points for each of the 8 leaders; the total runs on');
assert.equal(g.rows[3].cumulative, 640000 + 800000, 'Extra Battle 2 (100000 × 8)');
assert.equal(g.reachedAt, 4, 'the target of a million is reached in the fourth round');
assert.equal(g.rows.find(r => r.reached).n, 4);
assert.equal(g.rows.at(-1).n, 5, 'one row past the target shows the room there is');
assert.equal(g.rows[0].left, 1_000_000 - 80000); assert.equal(g.rows[3].left, 0);
// with no target: the circuits of the season only, no endless repeats
const free = circuitGuide({ ...season, target_score: 0 });
assert.equal(free.rows.length, 4); assert.equal(free.reachedAt, null); assert.equal(free.rows[0].left, null);
// a far target runs on through the repeating circuit, and stops at the limit
assert.equal(circuitGuide({ ...season, target_score: 20_000_000 }).reachedAt, 4 + Math.ceil((20_000_000 - 1_440_000) / 800000) , 'the repeat adds 800000 a round');
assert.equal(circuitGuide({ ...season, target_score: 1e12 }, { max: 12 }).rows.length, 12);
// a season with no circuits has no road
assert.deepEqual(circuitGuide({ leaders: [], circuits: [] }).rows, []);
console.log('circuits: all passed');
