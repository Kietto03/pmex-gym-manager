// Run: node test/stats.test.mjs — stats of a pair with a grid build (src/stats.js)
import assert from 'node:assert/strict';
import { tileStat, gridBonus, totalStats, STATS } from '../src/stats.js';
import { indexGrid } from '../src/grid.js';

assert.deepEqual(tileStat({ title: 'HP +10' }), { stat: 'HP', n: 10 });
assert.deepEqual(tileStat({ title: 'Sp. Atk +5' }), { stat: 'Sp. Atk', n: 5 });
assert.deepEqual(tileStat({ title: 'Sp.Def +25' }), { stat: 'Sp. Def', n: 25 });
assert.deepEqual(tileStat({ title: 'Speed +5' }), { stat: 'Speed', n: 5 });
assert.deepEqual(tileStat({ title: 'Speed 5' }), { stat: 'Speed', n: 5 }, 'some tiles are written without the plus');
assert.equal(tileStat({ title: 'Glorious Thunder: Power ↑ 5' }), null); assert.equal(tileStat({ title: 'Move Gauge Refresh 3' }), null); assert.equal(tileStat(undefined), null);
const cell = (n, title) => ({ n, q: n, r: 0, s: -n, energy: 0, orbs: 5, req: [], color: 'blue', title });
const ix = indexGrid([cell(1, 'HP +10'), cell(2, 'HP +10'), cell(3, 'Sp. Atk +5'), cell(4, 'Power Induction 1'), cell(5, 'Speed +5')]);
const bonus = gridBonus(ix, new Set([1, 2, 3, 4]));
assert.equal(bonus.HP, 20); assert.equal(bonus['Sp. Atk'], 5); assert.equal(bonus.Speed, 0, 'tile 5 is off');
const base = { HP: 671, Attack: 312, Defense: 146, 'Sp. Atk': 336, 'Sp. Def': 147, Speed: 335 };
const tot = totalStats(base, bonus, { Attack: 7 });
assert.equal(tot.HP, 691); assert.equal(tot['Sp. Atk'], 341); assert.equal(tot.Attack, 319, 'a bonus typed by hand is added');
assert.deepEqual(Object.keys(tot), STATS);
assert.equal(totalStats({}, gridBonus(ix, new Set())).HP, 0, 'no data is not a crash');
console.log('pair stats: all passed');
