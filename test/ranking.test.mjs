// Run: node test/ranking.test.mjs — matching ranking-sheet names to catalog pairs
import assert from 'node:assert/strict';
import { matchUnit } from '../src/ranking.js';

const P = (id, trainer, pokemon, type) => ({ id, trainer, pokemon, type });
const pairs = [P(1, 'Red (1996)', 'Pikachu', 'Electric'), P(2, 'Red', 'Venusaur', 'Grass'), P(3, 'Gloria (Anniversary 2025)', 'Cinderace', 'Dark'),
  P(4, 'Gloria', 'Zacian', 'Fairy'), P(5, 'Hilbert (Variety 2022)', 'Zoroark', 'Dark'), P(6, 'Hilbert (Champion)', 'Kyurem', 'Ice'),
  P(7, 'Marnie (Alt.)', 'Grimmsnarl', 'Dark'), P(8, 'Marnie', 'Morpeko', 'Dark')];
assert.equal(matchUnit('Red 1996', 'Electric', pairs)?.id, 1);
assert.equal(matchUnit('Gloria (Anni)', 'Dark', pairs)?.id, 3, 'abbreviation of the costume');
assert.equal(matchUnit('Hilbert (Var)', 'Dark', pairs)?.id, 5);
assert.equal(matchUnit('Hilbert (Champion)', 'Ice', pairs)?.id, 6);
assert.equal(matchUnit('Marnie (Alt)', 'Dark', pairs)?.id, 7);
assert.equal(matchUnit('Marnie', 'Dark', pairs)?.id, 8, 'the plain trainer, not a costume');
assert.equal(matchUnit('Gloria (Anni)', 'Fire', pairs), null, 'wrong type');
assert.equal(matchUnit('Nobody', 'Dark', pairs), null);
const ambiguous = [...pairs, P(9, 'Marnie', 'Toxicroak', 'Dark')];
assert.equal(matchUnit('Marnie', 'Dark', ambiguous), null, 'two equal fits: no guess');
console.log('ranking names: all passed');
