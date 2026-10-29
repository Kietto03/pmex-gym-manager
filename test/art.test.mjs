import assert from 'node:assert/strict';
import { trainerArt, pokeArt, formStem, ART, trainerBackup, pokeBackup, artKind, SEREBII } from '../src/art.js';

assert.equal(ART, 'https://pmrandom.dpdns.org/');
assert.equal(trainerArt({ iTrainer: 'ch0302_00_chiri' }), 'https://pmrandom.dpdns.org/static/data/chara/ch0302_00_chiri_1024.png');
assert.equal(trainerArt({ iTrainer: 'ch0000_00_red' }, true), 'https://pmrandom.dpdns.org/static/data/chara/ch0000_00_red_expose_1024.png');
assert.equal(trainerArt({ iTrainer: '' }), '');
assert.equal(trainerArt(null), '');
assert.equal(pokeArt('pm0006_00_lizardon'), 'https://pmrandom.dpdns.org/static/data/pkmn/pm0006_00_lizardon_256.png');
assert.equal(pokeArt(''), '');

const pkmn = {
  '0006': [['00', 'lizardon', 'Charizard'], ['51', 'megalizardonX', 'Mega Charizard X'], ['52', 'megalizardonY', 'Mega Charizard Y'], ['71', '15_lizardon', 'Charizard']],
  '0094': [['00', 'gangar', 'Gengar'], ['71', '14_gangar', 'Gengar']],
  '0849': [['11', '00_strinder', 'Toxtricity'], ['12', '00_strinder', 'Toxtricity']],
  '0681': [['00', 'girugarudo', 'Aegislash'], ['01', 'girugarudo', 'Aegislash']],
  '0386': [['11', 'deoxys', 'Deoxys'], ['12', 'deoxys', 'Deoxys'], ['13', 'deoxys', 'Deoxys']],
};
const base = 'pm0006_00_lizardon';
assert.equal(formStem({ kind: 'base' }, base, pkmn), base);
assert.equal(formStem({ kind: 'tera', teraType: 'Dragon' }, base, pkmn), 'pm0006_71_15_lizardon', 'Tera wears its crystal');
assert.equal(formStem({ kind: 'tera', teraType: 'Fire' }, base, pkmn), base, 'a Tera type the site has no picture of: the normal form');
assert.equal(formStem({ kind: 'tera', teraType: 'Ghost' }, 'pm0094_00_gangar', pkmn), 'pm0094_71_14_gangar');
assert.equal(formStem({ kind: 'tera' }, base, pkmn), base);
assert.equal(formStem({ kind: 'dynamax' }, base, pkmn), base);
assert.equal(formStem({ kind: 'mega', label: 'Mega Charizard X' }, base, pkmn), 'pm0006_51_megalizardonX');
assert.equal(formStem({ kind: 'mega', label: 'Mega Charizard Y · extra' }, base, pkmn), 'pm0006_52_megalizardonY');
assert.equal(formStem({ kind: 'mega', label: 'Mega Charizard' }, base, pkmn), '', 'an ambiguous Mega name is not guessed');
assert.equal(formStem({ kind: 'gigantamax', label: 'Charizard' }, base, pkmn), base, 'no Gigantamax art on the site: the normal form, never the Tera one');
assert.equal(formStem({ kind: 'form', label: 'Blade Forme' }, 'pm0681_00_girugarudo', pkmn), 'pm0681_01_girugarudo', 'the one other form');
assert.equal(formStem({ kind: 'form', label: 'x' }, 'pm0386_11_deoxys', pkmn), '', 'two other forms: not guessed');
assert.equal(formStem({ kind: 'form', label: 'x' }, 'pm0849_11_00_strinder', pkmn), 'pm0849_12_00_strinder');
assert.equal(formStem({ kind: 'form', rawLabel: 'Primal Groudon' }, 'pm0383_00_groudon', { '0383': [['00', 'groudon', 'Groudon'], ['51', 'groudonsp', 'Primal Groudon']] }), 'pm0383_51_groudonsp');
assert.equal(formStem({ kind: 'weird' }, base, pkmn), '');
assert.equal(formStem({ kind: 'base' }, '', pkmn), '');
assert.equal(formStem({ kind: 'mega', label: 'Mega Charizard X' }, base, null), '', 'no index yet: nothing guessed');
// backups: Serebii's pictures, and what kind of picture an address is
assert.equal(SEREBII, 'https://www.serebii.net/pokemonmasters/');
assert.equal(trainerBackup('hau-arcsuit'), 'https://www.serebii.net/pokemonmasters/syncpairs/hau-arcsuit.png');
assert.equal(pokeBackup('892-r'), 'https://www.serebii.net/pokemonmasters/pokemon/892-r.png');
assert.equal(trainerBackup(''), '');
assert.equal(artKind(trainerBackup('hau-arcsuit')), 'sb', 'Serebii trainer art is tall');
assert.equal(artKind(pokeBackup('857')), '', 'a Pokémon render looks like the pmrandom one');
assert.equal(artKind('https://kietto03.github.io/pmex-supez-dex/assets/trainers/cyrus.png'), 'fb', 'a Dex sprite is small pixel art');
assert.equal(artKind(trainerArt({ iTrainer: 'ch0302_00_chiri' })), '');
console.log('game art: all passed');
