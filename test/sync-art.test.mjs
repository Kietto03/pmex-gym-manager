import assert from 'node:assert/strict';
import { parseArt } from '../tools/build-art.mjs';

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
console.log('art index: all passed');
