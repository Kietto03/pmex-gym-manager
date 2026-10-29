import assert from 'node:assert/strict';
import { parseArt, serebiiTrainerSlugs, serebiiPokemonNames, parseIds } from '../tools/build-art.mjs';

const html = `
<div class="image-item"><a href="x"><img id="normal_pm0006_00_lizardon" data-src="static/data/pkmn/pm0006_00_lizardon_256.png" alt="Charizard"></a>
<a><img id="shiny_pm0006_00_lizardon" data-src="static/data/pkmn/pm0006_00_lizardon_rare_256.png" alt="Shiny Charizard" class="shiny-img"></a></div>
<div class="image-item"><a><img id="normal_pm0006_51_megalizardonX" data-src="static/data/pkmn/pm0006_51_megalizardonX_256.png" alt="Mega Charizard X"></a></div>
<div class="image-item"><a><img id="normal_pm0006_71_15_lizardon" data-src="static/data/pkmn/pm0006_71_15_lizardon_256.png" alt="Charizard"></a></div>
<div class="image-item"><a><img id="normal_pm0679_00_hitomoshi" data-src="static/data/pkmn/pm0679_00_hitomoshi_256.png" alt="Honedge &amp; Co"></a></div>`;
const a = parseArt(html);
assert.deepEqual(Object.keys(a), ['0006', '0679']);
assert.deepEqual(a['0006'], [['00', 'lizardon', 'Charizard'], ['51', 'megalizardonX', 'Mega Charizard X'], ['71', '15_lizardon', 'Charizard']]);   // shiny twins are not listed
assert.equal(a['0679'][0][2], 'Honedge & Co');
assert.deepEqual(parseArt('<html>nothing</html>'), {});
// Serebii backups: the names a picture could have there
assert.deepEqual(serebiiTrainerSlugs({ trainerName: 'Hau', trainerAlt: 'Arc Suit' }), ['hau-arcsuit']);
assert.deepEqual(serebiiTrainerSlugs({ trainerName: 'Hau', trainerAlt: 'Sygna Suit' }), ['hau-sygnasuit', 'hau-sygna']);
assert.deepEqual(serebiiTrainerSlugs({ trainerName: 'Bea', trainerAlt: 'Alt. 2' }), ['bea-alt2']);
assert.deepEqual(serebiiTrainerSlugs({ trainerName: 'Dendra', trainerAlt: '' }), ['dendra'], 'no outfit: the plain picture');
assert.deepEqual(serebiiTrainerSlugs({ trainerName: 'Lt. Surge' }), ['ltsurge']);
assert.deepEqual(serebiiTrainerSlugs({ trainerName: 'Player' }), [], 'the player has no picture there');
assert.deepEqual(serebiiPokemonNames({ internalPokemonName: 'pm0857_00_00_tebrim' }), ['857']);
assert.deepEqual(serebiiPokemonNames({ internalPokemonName: 'pm0026_00_raichu' }), ['026']);
assert.deepEqual(serebiiPokemonNames({ internalPokemonName: 'pm0892_11_00_wulaosu' }), ['892']);
assert.deepEqual(serebiiPokemonNames({ internalPokemonName: 'pm0892_12_00_wulaosu' }), ['892-r']);
assert.deepEqual(serebiiPokemonNames({ internalPokemonName: 'pm0026_61_araichu' }), [], 'a form that cannot be named for sure is not guessed');
assert.deepEqual(serebiiPokemonNames({ internalPokemonName: '' }), []);
assert.deepEqual([...parseIds('static/data/chara/ch0098_00_hau_1024.png static/data/chara/ch0098_00_hau_expose_1024.png', /static\/data\/chara\/(ch\d{4}_\d\d_[A-Za-z0-9]+)_1024\.png/g)], ['ch0098_00_hau']);
console.log('art index: all passed');
