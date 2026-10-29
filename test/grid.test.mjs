// Run: node test/grid.test.mjs   — rules of the Sync Grid (src/grid.js), no browser needed
import assert from 'node:assert/strict';
import { indexGrid, whyNot, canRemove, validate, totals, levelNeeded, gridHash } from '../src/grid.js';

const cell = (n, q, r, extra = {}) => ({ n, q, r, s: -q - r, energy: 2, orbs: 24, req: [], color: 'blue', title: `T${n}`, description: '', ...extra });
// centre is (0,0); ring 1: 1=(1,0) 2=(0,1); ring 2 hangs off ring 1: 3=(2,0) 4=(1,1)+level; 5=(-1,0)
const grid = [cell(1, 1, 0), cell(2, 0, 1), cell(3, 2, 0), cell(4, 1, 1, { req: ['Move level must be 3 or higher'] }), cell(5, -1, 0, { energy: 5 })];
const ix = indexGrid(grid), A = new Set(), at = n => ix.byN.get(n);

assert.equal(whyNot(ix, A, at(1)), null, 'tiles around the centre can be switched on');
assert.equal(whyNot(ix, A, at(3)), 'not-adjacent', 'a far tile needs an active neighbour');
A.add(1);
assert.equal(whyNot(ix, A, at(3)), null, 'next to an active tile it is allowed');
assert.equal(whyNot(ix, A, at(4), { moveLevel: 2 }), 'move-level', 'move level too low');
assert.equal(whyNot(ix, A, at(4), { moveLevel: 3 }), null);
assert.equal(levelNeeded(at(4)), 3);
assert.equal(whyNot(ix, A, at(5), { energyCap: 4 }), 'energy', 'energy cap');
assert.equal(whyNot(ix, A, at(5)), null, 'no cap means no limit');
A.add(3);
assert.equal(canRemove(ix, A, at(1)), false, 'tile 3 hangs on tile 1');
assert.equal(canRemove(ix, A, at(3)), true);
assert.deepEqual(validate(ix, [1, 3]), []);
assert.deepEqual(validate(ix, [3]).map(p => p.code), ['not-adjacent'], 'a loose tile is invalid');
assert.deepEqual(validate(ix, [1, 4], { moveLevel: 1 }).map(p => p.code), ['move-level']);
assert.deepEqual(validate(ix, [1, 99]).map(p => p.code), ['unknown']);
assert.deepEqual(validate(ix, [1, 3], { energyCap: 3 }).map(p => p.code), ['energy']);
assert.deepEqual(totals(ix, new Set([1, 3, 5])), { energy: 9, orbs: 72, tiles: 3, byColor: { blue: 3 } });
assert.notEqual(gridHash(grid), gridHash([...grid.slice(0, 4), cell(5, -1, 0, { energy: 6 })]), 'a changed tile changes the fingerprint');

// layout: flat-topped hexagons, tile n=1 at the upper right, the ring running clockwise (as in the game)
import { hexXY } from '../src/grid.js';
const xy = (q, r) => hexXY({ q, r }, 10);
const near = (a, b) => Math.abs(a - b) < 1e-9;
assert.ok(xy(0, -1).y > 0 && near(xy(0, -1).x, 0), 'one step down: straight below the centre');
assert.ok(xy(0, 1).y < 0 && near(xy(0, 1).x, 0), 'and straight above');
const ring = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([q, r]) => xy(q, r));
assert.ok(ring[0].x > 0 && ring[0].y < 0, 'n=1 is at the upper right');
// clockwise on screen (y grows downward): the angle keeps increasing
const ang = ring.map(p => Math.atan2(p.y, p.x));
assert.ok(ang.every((a, i) => i === 0 || ((a - ang[i - 1] + 2 * Math.PI) % (2 * Math.PI)) < Math.PI), 'the ring turns clockwise');
// neighbours are all the same distance apart: √3 × size for flat-topped hexagons of that size
for (const [q, r, dq, dr] of [[0, 0, 1, 0], [2, -1, 0, 1], [-1, 3, -1, 1]]) {
  const a = xy(q, r), b = xy(q + dq, r + dr);
  assert.ok(near(Math.hypot(a.x - b.x, a.y - b.y), 10 * Math.sqrt(3)), 'adjacent tiles are √3 × size apart');
}
console.log('grid rules: all passed');
