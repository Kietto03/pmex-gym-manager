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
// forms the site tells apart only by a code
const dx = { '0386': [['11', 'deoxys', 'Deoxys'], ['12', 'deoxys', 'Deoxys'], ['13', 'deoxys', 'Deoxys'], ['14', 'deoxys', 'Deoxys']] };
const deo = l => formStem({ kind: 'form', rawLabel: l }, 'pm0386_11_deoxys', dx);
assert.equal(deo('Deoxys · Attack Forme'), 'pm0386_12_deoxys');
assert.equal(deo('Deoxys · Defense Forme'), 'pm0386_13_deoxys');
assert.equal(deo('Deoxys · Speed Forme'), 'pm0386_14_deoxys');
assert.equal(deo('Deoxys · Normal Forme (After “Try This!”)'), 'pm0386_11_deoxys');
assert.equal(deo('Deoxys · Mystery'), '', 'a Deoxys form that is not named is not guessed');
const tp = { '1024': [['11', '00_terapagos', 'Terapagos'], ['12', '00_terapagos', 'Terapagos'], ['13', '00_terapagos', 'Terapagos']] };
assert.equal(formStem({ kind: 'form', rawLabel: 'Terapagos · Terastal Form' }, 'pm1024_11_00_terapagos', tp), 'pm1024_12_00_terapagos');
assert.equal(formStem({ kind: 'tera', rawLabel: 'Terapagos · Tera Stellar', teraType: 'Stellar' }, 'pm1024_11_00_terapagos', tp), 'pm1024_13_00_terapagos', 'Stellar is its own picture, not the normal form');
const sv = { '0862': [['11', 'gryps2', 'Silvally'], ['12', 'gryps2', 'Silvally'], ['13', 'gryps2', 'Silvally'], ['14', 'gryps2', 'Silvally'], ['26', 'gryps2', 'Silvally'], ['00', '31_tachifusaguma', 'Other']] };
assert.equal(formStem({ kind: 'form', rawLabel: 'Silvally · Type Change: Fire' }, 'pm0862_11_gryps2', sv), 'pm0862_12_gryps2');
assert.equal(formStem({ kind: 'form', rawLabel: 'Silvally · Type Change: Dragon' }, 'pm0862_11_gryps2', sv), 'pm0862_26_gryps2');
assert.equal(formStem({ kind: 'form', rawLabel: 'Silvally · Type Change: Poison' }, 'pm0862_11_gryps2', sv), '', 'two pictures of the same colour: left to the Dex sprite');
const nz = { '0865': [['12', 'prismsun', 'Necrozma'], ['14', 'prismdragon', 'Necrozma']] };
assert.equal(formStem({ kind: 'form', rawLabel: 'Necrozma · Ultra Necrozma' }, 'pm0865_12_prismsun', nz), 'pm0865_14_prismdragon');
const zg = { '0770': [['00', 'pokemonZ', 'Zygarde'], ['15', 'zygarde100', 'Zygarde']] };
assert.equal(formStem({ kind: 'form', rawLabel: 'Zygarde · Complete Forme' }, 'pm0770_00_pokemonZ', zg), 'pm0770_15_zygarde100');
const mm = { '0819': [['11', 'horror', 'Mimikyu'], ['12', 'horror', 'Mimikyu'], ['00', '00_hoshigarisu', 'Other']] };
assert.equal(formStem({ kind: 'form', rawLabel: 'Mimikyu · Busted Form' }, 'pm0819_11_horror', mm), 'pm0819_12_horror', 'another Pokémon under the same number does not count');
// a Mega that the site keeps under another number than the base
const gr = { '0725': [['00', 'frog3', 'Greninja']], '0658': [['51', '00_megagekkouga', 'Mega Greninja']] };
assert.equal(formStem({ kind: 'mega', rawLabel: 'Mega Greninja' }, 'pm0725_00_frog3', gr), 'pm0658_51_00_megagekkouga');
assert.equal(formStem({ kind: 'form', rawLabel: 'Greninja · Sync Move: Dark' }, 'pm0725_00_frog3', gr), '', 'looks like the normal form: the page falls back to it');

// a shiny pair keeps its colours in every form
const sh = { '0383': [['00', 'groudon', 'Groudon', 1], ['51', 'groudonsp', 'Primal Groudon', 1]], '0865': [['12', 'prismsun', 'Necrozma', 1], ['14', 'prismdragon', 'Necrozma']],
  '0248': [['00', 'bangiras', 'Tyranitar', 1], ['51', 'megabangiras', 'Mega Tyranitar', 1]], '0006': [['00', 'lizardon', 'Charizard', 1], ['51', 'megalizardonX', 'Mega Charizard X']] };
assert.equal(formStem({ kind: 'base' }, 'pm0383_00_groudon_rare', sh), 'pm0383_00_groudon_rare');
assert.equal(formStem({ kind: 'form', rawLabel: 'Primal Groudon' }, 'pm0383_00_groudon_rare', sh), 'pm0383_51_groudonsp_rare', 'the shiny Primal form');
assert.equal(formStem({ kind: 'mega', rawLabel: 'Mega Tyranitar' }, 'pm0248_00_bangiras_rare', sh), 'pm0248_51_megabangiras_rare');
assert.equal(formStem({ kind: 'mega', rawLabel: 'Mega Charizard X' }, 'pm0006_00_lizardon_rare', sh), '', 'no shiny twin on the site: the Dex sprite (shiny too), never the normal colours');
assert.equal(formStem({ kind: 'form', rawLabel: 'Necrozma · Ultra Necrozma' }, 'pm0865_12_prismsun_rare', sh), '', 'Ultra Necrozma has no shiny twin');
assert.equal(formStem({ kind: 'mega', rawLabel: 'Mega Charizard X' }, 'pm0006_00_lizardon', sh), 'pm0006_51_megalizardonX', 'a normal pair is unchanged');
assert.equal(formStem({ kind: 'tera', teraType: 'Fire' }, 'pm0383_00_groudon_rare', sh), 'pm0383_00_groudon_rare', 'Tera that looks like the normal form keeps the shiny colours');

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
