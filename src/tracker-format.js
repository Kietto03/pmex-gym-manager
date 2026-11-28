// The Sync Pairs Tracker's syncpairs.json, read the same way whatever its age. On 2026-11-25 ("Misc", still
// VERSION v2.74.0) the tracker renamed internalTrainerName → trainerActorId and internalPokemonName → pokemonActorId,
// and wrote releaseDate as Unix seconds instead of "YYYY-MM-DD". Everything here reads the old names, so a pair
// keeps its id (a clash of names is told apart by the Pokémon's internal name) and its pictures.
const day = v => (typeof v === 'number' && Number.isFinite(v) ? new Date(v * 1000).toISOString().slice(0, 10) : typeof v === 'string' ? v : '');
export const fromTracker = p => ({
  ...p,
  internalTrainerName: p.internalTrainerName || p.trainerActorId || '',
  internalPokemonName: p.internalPokemonName || p.pokemonActorId || '',
  releaseDate: day(p.releaseDate),
  pokemonForm: Array.isArray(p.pokemonForm) ? p.pokemonForm : p.pokemonForm ? [p.pokemonForm] : [],
});

// "Sygna Suit (Alt.)" + "Lysandre" → "Sygna Suit Lysandre (Alt.)"; "Champion" + "Lyra" → "Lyra (Champion)"
export function trainerLabel(name, alt) {
  if (!alt) return name;
  const m = alt.match(/^((?:Sygna|Arc) Suit)(?:\s*\((.+)\))?$/);
  if (m) return `${m[1]} ${name}${m[2] ? ` (${m[2]})` : ''}`;
  return `${name} (${alt.replace(/^\((.*)\)$/, '$1')})`;
}
