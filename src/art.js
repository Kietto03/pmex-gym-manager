/* ═══════════════════════════════════════════════════════════════
   The game's own pictures, from pmrandom.dpdns.org (nothing is copied into this repo):
   · trainers: the 2D art of the pair's trainer, static/data/chara/<internalTrainerName>_1024.png (_expose = the EX pose)
   · Pokémon: the 3D render, static/data/pkmn/<internalPokemonName>_256.png, and the same for each Mega / Gigantamax / other form
   The names come from the Sync Pairs Tracker (internalTrainerName, internalPokemonName). Where a picture cannot be found with
   confidence, the callers fall back to the Dex sprite, never to a guess.
   ═══════════════════════════════════════════════════════════════ */
const CFG = (typeof window !== 'undefined' && window.GYM_CONFIG) || {};
export const ART = (CFG.artUrl || 'https://pmrandom.dpdns.org/').replace(/\/?$/, '/');

// Backup: Serebii has the same pictures (2D trainer art, 256 px Pokémon renders), often before pmrandom. tools/build-art.mjs finds which ones exist.
export const SEREBII = (CFG.backupArtUrl || 'https://www.serebii.net/pokemonmasters/').replace(/\/?$/, '/');
export const trainerBackup = slug => (slug ? `${SEREBII}syncpairs/${slug}.png` : '');
export const pokeBackup = name => (name ? `${SEREBII}pokemon/${name}.png` : '');
// What kind of picture an address is: Serebii's trainer art is tall and framed differently ('sb'); a Dex pixel sprite is small ('fb')
export const artKind = url => (/\/syncpairs\/[^/]+\.png$/.test(url) ? 'sb' : /\/assets\//.test(url) ? 'fb' : '');
export const trainerArt = (p, ex = false) => (p?.iTrainer ? `${ART}static/data/chara/${p.iTrainer}${ex ? '_expose' : ''}_1024.png` : '');
export const pokeArt = stem => (stem ? `${ART}static/data/pkmn/${stem}_256.png` : '');

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// pmrandom names a Terastal picture pm<number>_7<n>_<type index>_<name>: the type index follows the game's own order
const TYPE_INDEX = { Normal: 1, Fire: 2, Water: 3, Electric: 4, Grass: 5, Ice: 6, Fighting: 7, Poison: 8, Ground: 9, Flying: 10, Psychic: 11, Bug: 12, Rock: 13, Ghost: 14, Dragon: 15, Dark: 16, Steel: 17, Fairy: 18 };
// The picture stem (pm<number>_<form>_<name>) of a form of the pair, or '' when it cannot be told for sure.
//   base, Dynamax and Gigantamax look like the normal form (the site has no art of its own for them);
//   Tera wears its crystal when the site has that Tera type for this Pokémon, else the normal form;
//   Mega is found by its name; another form only when the Pokémon has exactly one other in-battle form.
export function formStem(view, baseStem, pkmn) {
  if (!baseStem || !/^pm\d{4}_\d\d_/.test(baseStem)) return '';
  const num = baseStem.slice(2, 6), baseCode = baseStem.slice(7, 9), list = pkmn?.[num] || [];
  const full = ([c, s]) => `pm${num}_${c}_${s}`;
  const only = hits => (hits.length === 1 ? full(hits[0]) : '');
  switch (view.kind) {
    case 'base': case 'dynamax': case 'gigantamax': return baseStem;
    case 'tera': return only(list.filter(([c, s]) => c[0] === '7' && TYPE_INDEX[view.teraType] && +s.slice(0, 2) === TYPE_INDEX[view.teraType])) || baseStem;
    case 'mega': { const want = norm(String(view.rawLabel ?? view.label).split(' · ')[0]); return only(list.filter(([c, , n]) => c[0] === '5' && norm(n) === want)); }
    case 'form': {   // a named one first ("Primal Groudon"), else the only other in-battle form
      const want = norm(String(view.rawLabel ?? view.label).split(' · ')[0]);
      return only(list.filter(([c, , n]) => c[0] === '5' && norm(n) === want)) || only(list.filter(([c]) => c !== baseCode && !'567'.includes(c[0])));
    }
    default: return '';
  }
}
