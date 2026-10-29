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
// The banners of the scouts, from brybry's schedule page (named like the event id). data/events.json says which events have one.
export const BANNERS = (CFG.bannerUrl || 'https://pokemon.brybry.ch/masters/data/banner/scout/').replace(/\/?$/, '/');
export const eventBanner = id => (id ? `${BANNERS}${id}.png` : '');
export const trainerArt = (p, ex = false) => (p?.iTrainer ? `${ART}static/data/chara/${p.iTrainer}${ex ? '_expose' : ''}_1024.png` : '');
export const pokeArt = stem => (stem ? `${ART}static/data/pkmn/${stem}_256.png` : '');

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// pmrandom names a Terastal picture pm<number>_7<n>_<type index>_<name>: the type index follows the game's own order
const TYPE_INDEX = { Normal: 1, Fire: 2, Water: 3, Electric: 4, Grass: 5, Ice: 6, Fighting: 7, Poison: 8, Ground: 9, Flying: 10, Psychic: 11, Bug: 12, Rock: 13, Ghost: 14, Dragon: 15, Dark: 16, Steel: 17, Fairy: 18 };
// Forms the site names only by a code (pm<number>_<code>_<name>). What each code is, was checked against the pictures:
//   Deoxys 11 normal, 12 attack, 13 defense, 14 speed · Terapagos 11 normal, 12 Terastal, 13 Stellar
//   Zygarde's complete forme (zygarde100) and Ultra Necrozma (prismdragon) are pictures of their own name
//   Silvally 11 normal and 12–28 one per type. Thirteen types are listed; Poison and Ghost (14, 18) and Flying and Steel (19, 25)
//   have two pictures of nearly the same colour, so they are left to the Dex sprite until someone confirms which is which.
const FORM_CODES = [
  [/_deoxys$/, /Normal/i, 11], [/_deoxys$/, /Attack/i, 12], [/_deoxys$/, /Defen[cs]e/i, 13], [/_deoxys$/, /Speed/i, 14],
  [/_terapagos$/, /Terastal/i, 12], [/_terapagos$/, /Stellar/i, 13],
  [/_pokemonZ$/, /Complete/i, null, 'zygarde100'], [/_prism(sun|moon)$/, /Ultra/i, null, 'prismdragon'],
];
const SILVALLY = { Fire: 12, Water: 13, Ground: 15, Rock: 16, Bug: 17, Fighting: 20, Ice: 21, Grass: 22, Electric: 23, Psychic: 24, Dragon: 26, Dark: 27, Fairy: 28 };
const formName = view => String(view.rawLabel ?? view.label ?? '').split(' · ').slice(1).join(' ') || String(view.rawLabel ?? view.label ?? '');
// Some Pokémon sit under another number in one place than in another (Greninja is 0725, its Mega 0658): Mega and Primal are found by name in the whole index
const named = (pkmn, want) => Object.entries(pkmn || {}).flatMap(([num, l]) => l.filter(([c, , n]) => c[0] === '5' && norm(n) === want).map(e => [num, ...e]));

// The picture stem (pm<number>_<form>_<name>) of a form of the pair, or '' when it cannot be told for sure.
//   (a shiny pair keeps its colours: see formStem below)
//   base, Dynamax and Gigantamax look like the normal form (the site has no art of its own for them);
//   Tera wears its crystal when the site has that Tera type for this Pokémon, else the normal form;
//   Mega and Primal are found by their name; the forms named in FORM_CODES by their code; another form only when the Pokémon
//   has exactly one other in-battle form (same name part, another code).
function plainFormStem(view, baseStem, pkmn) {
  if (!baseStem || !/^pm\d{4}_\d\d_/.test(baseStem)) return '';
  const num = baseStem.slice(2, 6), baseCode = baseStem.slice(7, 9), baseName = baseStem.slice(10), list = pkmn?.[num] || [];
  const full = ([c, s]) => `pm${num}_${c}_${s}`;
  const only = hits => (hits.length === 1 ? full(hits[0]) : '');
  const byCode = (code, name = baseName) => only(list.filter(([c, s]) => (code == null ? c !== baseCode : +c === code) && s === name));
  if (view.kind === 'base' || view.kind === 'dynamax' || view.kind === 'gigantamax') return baseStem;
  const label = formName(view);
  if (view.kind === 'form' || view.kind === 'tera') {
    const rule = FORM_CODES.find(([b, l]) => b.test(baseStem) && l.test(label));
    if (rule) return byCode(rule[2], rule[3]);
    if (baseName === 'gryps2') { const t = /Type Change:\s*(\w+)/i.exec(label)?.[1]; return t && SILVALLY[t] ? byCode(SILVALLY[t]) : ''; }
  }
  switch (view.kind) {
    case 'tera': return only(list.filter(([c, s]) => c[0] === '7' && TYPE_INDEX[view.teraType] && +s.slice(0, 2) === TYPE_INDEX[view.teraType])) || baseStem;
    case 'mega': { const hits = named(pkmn, norm(String(view.rawLabel ?? view.label).split(' · ')[0])); return hits.length === 1 ? `pm${hits[0][0]}_${hits[0][1]}_${hits[0][2]}` : ''; }
    case 'form': {
      const hits = named(pkmn, norm(String(view.rawLabel ?? view.label).split(' · ')[0]));
      if (hits.length === 1) return `pm${hits[0][0]}_${hits[0][1]}_${hits[0][2]}`;   // "Primal Groudon"
      return only(list.filter(([c, s]) => c !== baseCode && s === baseName && !'567'.includes(c[0])));
    }
    default: return '';
  }
}

// A shiny pair (its picture ends in _rare) shows every form as shiny too. pmrandom has the shiny twin of most forms; where it has none the
// answer is '' so that the page falls back to the Dex sprite of that form, which is shiny as well — never to the normal colours.
export function formStem(view, baseStem, pkmn) {
  const shiny = /_rare$/.test(baseStem || ''), plain = shiny ? baseStem.slice(0, -5) : baseStem;
  const stem = plainFormStem(view, plain, pkmn);
  if (!stem || !shiny) return stem;
  if (stem === plain) return baseStem;
  const [, num, code, name] = /^pm(\d{4})_(\d\d)_(.+)$/.exec(stem) || [];
  const entry = (pkmn?.[num] || []).find(e => e[0] === code && e[1] === name);
  return entry?.[3] ? `${stem}_rare` : '';
}
