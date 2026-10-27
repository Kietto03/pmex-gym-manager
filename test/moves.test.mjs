// Run: node test/moves.test.mjs — reading a move's text (src/moves.js)
import assert from 'node:assert/strict';
import { splitDescription, count } from '../src/moves.js';

let r = splitDescription('Activation Condition: When the user’s Attack is raised. Deactivation Condition: Cannot be deactivated. Never misses. Lowers the target’s Defense by two stat ranks.');
assert.equal(r.activation, 'When the user’s Attack is raised.'); assert.equal(r.deactivation, 'Cannot be deactivated.'); assert.equal(r.rest, 'Never misses. Lowers the target’s Defense by two stat ranks.');
r = splitDescription('Activation Condition: When the user’s Sp. Atk is raised. Deactivation Condition: When the user’s Sp. Atk is not raised. Never misses. Raises Sp. Def.');
assert.equal(r.activation, 'When the user’s Sp. Atk is raised.');
assert.equal(r.deactivation, 'When the user’s Sp. Atk is not raised.', '"Sp. Atk" does not end the sentence');
assert.equal(r.rest, 'Never misses. Raises Sp. Def.');
r = splitDescription('Activation Condition: When this move is used. Deactivation Condition: When this move is used. Never misses.');
assert.equal(r.deactivation, 'When this move is used.'); assert.equal(r.rest, 'Never misses.');
r = splitDescription('Lowers the target’s Speed. Has a chance (30%) of making the target flinch.');
assert.deepEqual(r, { activation: '', deactivation: '', rest: 'Lowers the target’s Speed. Has a chance (30%) of making the target flinch.' }, 'plain text stays as it is');
r = splitDescription('Activation Condition: When it rains.');
assert.equal(r.activation, 'When it rains.'); assert.equal(r.deactivation, '');
assert.equal(count('2'), 2); assert.equal(count('--'), 0); assert.equal(count(undefined), 0); assert.equal(count('0'), 0);
console.log('move text: all passed');
