import assert from 'node:assert/strict';
import { squadsOf, runKind } from '../src/squads.js';

const rows = [{ type: 'Fire', reinType: 'Water', total: 5, id: 'a' }, { type: 'Fire', reinType: '', total: 9, id: 'b' }, { type: 'Water', reinType: 'Fire', total: 1, id: 'c' }, { type: '', reinType: '', total: 0, id: 'd' }];
const ORDER = ['Normal', 'Fire', 'Water', 'Electric', 'Grass'];
const sq = squadsOf(rows, ['Fire', 'Grass'], ORDER);
assert.deepEqual(sq.map(q => q.type), ['Fire', 'Water', 'Grass'], 'types in the game order, stage types included');
const fire = sq.find(q => q.type === 'Fire');
assert.deepEqual(fire.core.map(r => r.id), ['b', 'a'], 'core squad: strongest first');
assert.deepEqual(fire.reinforcement.map(r => r.id), ['c']);
assert.equal(sq.find(q => q.type === 'Grass').core.length, 0, 'a stage type nobody covers is listed with empty sides');
assert.equal(sq.find(q => q.type === 'Water').stage, false);
assert.equal(runKind('Fire', 'Fire', 'Water'), 'main');
assert.equal(runKind('Water', 'Fire', 'Water'), 'reinforce');
assert.equal(runKind('Grass', 'Fire', 'Water'), 'support');
assert.equal(runKind('Grass', null, 'Water'), 'unclassified');
console.log('squads: all passed');
