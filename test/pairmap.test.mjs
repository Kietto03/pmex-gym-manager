import assert from 'node:assert/strict';
import { makeDexLookup, tidy } from '../src/pairmap.js';

// the Dex's keys (what pair-index.json holds) and the tracker's pairs, as they really differ
const map = {
  'leon (alt.)|dragapult': 'leon-alt-dragapult', 'sycamore (holiday 2023)|gogoat': 'syc-gogoat', 'bea|sirfetch’d': 'bea-sirfetchd', 'hop|zacian': 'hop-zacian',
  'red|snorlax': 'red-snorlax', 'kris (academy)|igglybuff': 'kris-igglybuff', 'akari|mime jr.': 'akari-mimejr', 'scottie|pikachu': 'scottie-pikachu',
  'rosa (academy)|deerling': 'rosa-deerling', 'red (1996)|pikachu': 'red-1996-pikachu', 'leaf|eevee': 'leaf-eevee', 'eve (poké kid)|eevee': 'eve-eevee',
  'lance|dragonite': 'lance-dragonite', 'arc suit lance|dragonite': 'lance-arc-dragonite',
};
const pairs = [
  { trainer: 'Leon (Alt)', pokemon: 'Dragapult' }, { trainer: 'Professor Sycamore (Holiday 2023)', pokemon: 'Gogoat' }, { trainer: "Bea", pokemon: "Sirfetch'd" },
  { trainer: 'Hop', pokemon: 'Zacian ' }, { trainer: 'Red (Classic)', pokemon: 'Snorlax' }, { trainer: 'Kris', pokemon: 'Igglybuff' }, { trainer: 'Akari', pokemon: 'Mime Jr' },
  { trainer: 'Player', pokemon: 'Pikachu' }, { trainer: 'Rosa', pokemon: 'Deerling' }, { trainer: 'Rosa', pokemon: 'Deerling' },   // two tracker pairs, one Dex file
  { trainer: 'Red (1996)', pokemon: 'Pikachu' }, { trainer: 'Eve', pokemon: 'Eevee' }, { trainer: 'Leaf', pokemon: 'Eevee' },
  { trainer: 'Lance', pokemon: 'Dragonite' }, { trainer: 'Lance (Arc Suit)', pokemon: 'Dragonite' },
];
const find = makeDexLookup(map, pairs), id = (t, p) => find({ trainer: t, pokemon: p });
assert.equal(id('Red (1996)', 'Pikachu'), 'red-1996-pikachu', 'an exact name');
assert.equal(id('Leon (Alt)', 'Dragapult'), 'leon-alt-dragapult', 'a full stop on one side only');
assert.equal(id('Professor Sycamore (Holiday 2023)', 'Gogoat'), 'syc-gogoat', 'Professor on one side only');
assert.equal(id('Bea', "Sirfetch'd"), 'bea-sirfetchd', 'another apostrophe');
assert.equal(id('Hop', 'Zacian '), 'hop-zacian', 'a trailing space');
assert.equal(id('Akari', 'Mime Jr'), 'akari-mimejr', 'a full stop in the Pokémon name');
assert.equal(id('Player', 'Pikachu'), 'scottie-pikachu', 'the player character');
assert.equal(id('Red (Classic)', 'Snorlax'), 'red-snorlax', 'an outfit written on one side only, one pair on both sides');
assert.equal(id('Kris', 'Igglybuff'), 'kris-igglybuff');
assert.equal(id('Eve', 'Eevee'), 'eve-eevee', 'the tracker leaves out "(Poké Kid)"');
assert.equal(id('Rosa', 'Deerling'), null, 'two tracker pairs and one file: not chosen');
assert.equal(id('Lance', 'Dragonite'), 'lance-dragonite', 'an exact name always wins');
assert.equal(id('Lance (Arc Suit)', 'Dragonite'), null, 'an outfit that is not in the Dex is not borrowed from another outfit');
assert.equal(id('Nobody', 'Mew'), null);
assert.equal(tidy("Sirfetch’d "), 'sirfetchd');
console.log('pair matching: all passed');
