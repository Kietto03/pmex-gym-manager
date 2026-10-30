// Run: node test/grid.test.mjs   — rules of the Sync Grid (src/grid.js), no browser needed
import assert from 'node:assert/strict';
import { indexGrid, whyNot, canRemove, validate, totals, levelNeeded, gridHash, settle, linkGap } from '../src/grid.js';

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

// picking ahead: far tiles wait, and switch on together once a chain of active tiles reaches them
const line = indexGrid([cell(1, 1, 0), cell(2, 2, 0), cell(3, 3, 0), cell(4, 4, 0), cell(5, 5, 0, { energy: 10 })]);   // a straight chain out from the centre
let r = settle(line, new Set(), new Set([4, 3]));
assert.deepEqual([...r.active], [], 'nothing switches on while the chain is broken');
assert.deepEqual([...r.pending].sort(), [3, 4]);
assert.equal(r.blocked.get(4), 'not-adjacent');
assert.equal(linkGap(line, new Set(), new Set([4, 3]), 4), 2, 'two tiles (1 and 2) still to pick');
assert.equal(linkGap(line, new Set(), new Set([4, 3]), 3), 2);
assert.equal(linkGap(line, new Set(), new Set([4, 3, 2]), 4), 1, 'picked tiles count for nothing');
assert.equal(linkGap(line, new Set([1]), new Set([4, 3]), 4), 1, 'an active tile shortens the chain');
assert.equal(linkGap(line, new Set(), new Set(), 1), 0, 'a tile at the centre needs nothing');
r = settle(line, new Set([1]), new Set([4, 3, 2]));
assert.deepEqual([...r.active].sort(), [1, 2, 3, 4], 'tile 2 links the rest: all of them switch on at once');
assert.equal(r.pending.size, 0);
// the order of picking decides who gets the energy when there is a cap, and the rest keeps waiting
r = settle(line, new Set([1]), new Set([2, 3]), { energyCap: 4 });
assert.deepEqual([...r.active].sort(), [1, 2]);
assert.equal(r.blocked.get(3), 'energy');
r = settle(line, new Set([1]), new Set([5]), { moveLevel: 1 });
assert.equal(r.blocked.get(5), 'not-adjacent');
assert.deepEqual([...settle(line, new Set([1]), new Set([99])).pending], [], 'a tile that does not exist is dropped');
assert.deepEqual([...settle(line, new Set([1]), new Set([1])).pending], [], 'an active tile is not pending');
// gaps around a bend: the shorter way round is counted
const bend = indexGrid([cell(1, 1, 0), cell(2, 1, 1), cell(3, 0, 2), cell(4, 2, 0), cell(5, 2, 1), cell(6, 1, 2)]);
assert.equal(linkGap(bend, new Set(), new Set([6]), 6), 2, '6 → 2 → 1: tiles 2 and 1 are still to pick');

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

import { markArc, isArcPair } from '../src/grid.js';
{
  const g = [{ n: 1, q: 1, r: 0, color: 'blue', req: [] }, { n: 2, q: 2, r: 0, color: 'blue', req: ['Move level must be 4 or higher'] }, { n: 3, q: 3, r: 0, color: 'red', req: ['Move level must be 5 or higher'] }, { n: 4, q: 4, r: 0, color: 'yellow', req: ['Move level must be 3 or higher'] }, { n: 5, q: 5, r: 0, color: 'blue', energy: 0, title: 'Heroic Ascension Divine Outrage: Power ↑ 50', req: ['Move level must be 3 or higher'] }, { n: 6, q: 6, r: 0, color: 'blue', energy: 2, title: 'Power ↑ 10', req: ['Move level must be 3 or higher'] }];
  assert.ok(isArcPair('Arc Suit Lance') && !isArcPair('Lance') && !isArcPair('Sygna Suit Elesa'));
  const arc = markArc(g, 'Arc Suit Lance');
  assert.deepEqual(arc.map(c => c.color), ['blue', 'arc', 'arc', 'yellow', 'arc', 'blue'], 'the move level 4 and 5 tiles and the free Power tile of an Arc Suit pair turn gold');
  assert.equal(arc[1].was, 'blue');
  assert.deepEqual(markArc(g, 'Lance').map(c => c.color), ['blue', 'blue', 'red', 'yellow', 'blue', 'blue'], 'other pairs keep the datamine colours');
  assert.equal(g[1].color, 'blue', 'the source grid is not changed');
  console.log('arc tiles: all passed');
}

{
  const g = [{ n: 1, q: 1, r: 0, energy: 30, orbs: 1, req: [], color: 'blue' }, { n: 2, q: 2, r: 0, energy: 30, orbs: 1, req: [], color: 'blue' }, { n: 3, q: 3, r: 0, energy: 2, orbs: 1, req: [], color: 'blue' }];
  const ix = indexGrid(g), act = new Set([1, 2]);
  assert.equal(whyNot(ix, act, ix.byN.get(3), { energyCap: 60 }), 'energy', 'at the limit of 60 nothing more can be switched on');
  assert.equal(whyNot(ix, act, ix.byN.get(3), { energyCap: 62 }), null, 'a limit of 62 leaves room for 2 more');
  console.log('energy limit: all passed');
}

import { energyCapFor } from '../src/grid.js';
assert.deepEqual([1, 2, 3, 4, 5].map(energyCapFor), [62, 64, 66, 68, 70], 'move level 1..5 gives 62..70 energy');
console.log('energy cap by move level: all passed');
