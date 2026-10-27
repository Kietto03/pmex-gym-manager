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
import { resolveUnit } from '../src/ranking.js';
const R = (id, trainer, trainerName, pokemon, extra = {}) => ({ id, trainer, trainerName, pokemon, type: 'Normal', exRole: 'Support', rarity: 5, acquisition: 'Poké Fair Scout', release: '2024-01-01', ...extra });
const cat = [R(1, 'Hilbert', 'Hilbert', 'Samurott', { acquisition: 'Variety Scout', release: '2022-03-01' }), R(2, 'Hilbert', 'Hilbert', 'Glaceon'), R(3, 'Hilbert (Champion)', 'Hilbert', 'Kyurem'),
  R(4, 'Sygna Suit Ball Guy', 'Ball Guy', 'Dedenne'), R(5, 'Sygna Suit Lear', 'Lear', 'Gholdengo'), R(6, 'Korrina', 'Korrina', 'Lucario', { acquisition: 'Arc Suit Fair Scout' }), R(7, 'Volo', 'Volo', 'Giratina', { release: '2025-01-01' }), R(8, 'Volo', 'Volo', 'Dialga', { release: '2020-01-01' })];
assert.equal(resolveUnit({ name: 'Hilbert (Var)' }, cat).pair.id, 1, 'Var = the Variety Scout pair');
assert.equal(resolveUnit({ name: 'C.Hilbert' }, cat).pair.id, 3, 'C. = Champion');
assert.equal(resolveUnit({ name: 'Hilbert (Champion)' }, cat).approx, false);
assert.equal(resolveUnit({ name: 'SS Ball Guy' }, cat).pair.id, 4, 'a trainer written with two words');
assert.equal(resolveUnit({ name: 'SS.Lear' }, cat).pair.id, 5);
assert.equal(resolveUnit({ name: 'Koriana (Arc)' }, cat).pair.id, 6, 'a typo in the name');
assert.equal(resolveUnit({ name: 'Volvo' }, cat).pair.id, 7, 'when several fit the newest strong one is taken…');
assert.equal(resolveUnit({ name: 'Volvo' }, cat).approx, true, '…and it is flagged as a guess');
assert.equal(resolveUnit({ name: 'Nobody Atall' }, cat), null);
console.log('ranking names: all passed');
