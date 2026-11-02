import assert from 'node:assert/strict';
import { parseArt, parseStems, addShiny, serebiiTrainerSlugs, serebiiPokemonNames, parseIds } from '../tools/build-art.mjs';

const html = `<script type="application/json" id="lb-anims">{"x":{"stems":["pm0006_00_lizardon","pm0006_51_megalizardonX","pm0006_71_15_lizardon","pm0679_00_hitomoshi","pm0006_00_lizardon"],"sections":[]}}</script>`;
const prev = { '0006': [['00', 'lizardon', 'Charizard', 1], ['51', 'megalizardonX', 'Mega Charizard X']] };
const a = parseArt(html, prev);
assert.deepEqual(Object.keys(a), ['0006', '0679']);
assert.deepEqual(a['0006'].slice(0, 2), [['00', 'lizardon', 'Charizard', 1], ['51', 'megalizardonX', 'Mega Charizard X']], 'names and the shiny flag of a known picture are kept');
assert.deepEqual(a['0006'][2], ['71', '15_lizardon', 'Lizardon'], 'a new picture gets a name made from its file name');
assert.equal(a['0679'][0][1], 'hitomoshi');
assert.deepEqual(parseArt('<html>nothing</html>'), {});
assert.deepEqual(parseStems('"pm0001_00_fushigidane","pm0001_00_fushigidane","ch0001_00_x"'), ['pm0001_00_fushigidane'], 'each picture once, trainers apart');
const asked = [];
const withShiny = await addShiny(parseArt(html, prev), prev, async url => { asked.push(url); return /hitomoshi/.test(url); });
assert.equal(asked.length, 2, 'only the pictures that are new are asked about their shiny twin');
assert.equal(withShiny['0679'][0][3], 1); assert.equal(withShiny['0006'][2][3], undefined);
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
assert.deepEqual(serebiiPokemonNames({ internalPokemonName: 'pm0857_00_00_tebrim_rare' }), [], 'Serebii has no shiny pictures');
assert.deepEqual([...parseIds('"ch0098_00_hau","ch0099_01_x"', /"(ch\d{4}_\d\d_[A-Za-z0-9]+)"/g)], ['ch0098_00_hau', 'ch0099_01_x']);
console.log('art index: all passed');
{
  const { pool } = await import('../tools/build-art.mjs');
  let running = 0, peak = 0;
  const got = await pool([1, 2, 3, 4, 5, 6, 7], 3, async x => { running++; peak = Math.max(peak, running); await new Promise(r => setTimeout(r, 5)); running--; return x * 2; });
  assert.equal(peak, 3, 'at most n at a time'); assert.deepEqual([...got.values()].sort((a, b) => a - b), [2, 4, 6, 8, 10, 12, 14]);
  console.log('pool: all passed');
}
