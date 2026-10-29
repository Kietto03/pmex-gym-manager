/* ═══════════════════════════════════════════════════════════════
   Which Dex pair file belongs to a pair of the tracker. The two name things a little differently ("Leon (Alt)" and
   "leon (alt.)", "Sirfetch'd" with another apostrophe, "Professor Sycamore (Holiday 2023)" and "sycamore (holiday 2023)",
   a trailing space, an outfit written on one side only), so a pair is matched in steps, each one stricter about being sure:
     1. the exact name           2. the Player character ("Player" of the tracker is "Scottie" of the Dex)
     3. the same name, tidied    4. the same trainer and Pokémon, outfit ignored: only when that is the one pair on BOTH sides
   Never a guess: when two pairs could fit, none is chosen.
   ═══════════════════════════════════════════════════════════════ */
const DEX_TRAINER = { player: 'scottie' };
export const tidy = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`']/g, '').replace(/\./g, '').replace(/\s+/g, ' ').trim().replace(/^professor /, '');
const base = trainer => tidy(String(trainer ?? '').replace(/\s*\(.*\)\s*$/, ''));
const push = (m, k, v) => { (m.get(k) || m.set(k, []).get(k)).push(v); };

// map: the Dex's "<trainer>|<pokémon>" → pair file id; pairs: the tracker's pairs ({ trainer, pokemon }) — for the "only one on both sides" rule
export function makeDexLookup(map, pairs = []) {
  const exact = new Map(Object.entries(map)), tidied = new Map(), byBase = new Map(), pairsPerBase = new Map();
  for (const [k, id] of Object.entries(map)) {
    const [trainer, pokemon] = k.split('|');
    push(tidied, `${tidy(trainer)}|${tidy(pokemon)}`, id);
    push(byBase, `${base(trainer)}|${tidy(pokemon)}`, id);
  }
  for (const p of pairs) { const k = `${base(p.trainer)}|${tidy(p.pokemon)}`; pairsPerBase.set(k, (pairsPerBase.get(k) || 0) + 1); }
  const only = list => (list && new Set(list).size === 1 ? list[0] : null);
  return p => {
    const direct = `${p.trainer}|${p.pokemon}`.toLowerCase();
    if (exact.has(direct)) return exact.get(direct);
    const alias = DEX_TRAINER[String(p.trainer).toLowerCase()];
    if (alias && exact.has(`${alias}|${p.pokemon}`.toLowerCase())) return exact.get(`${alias}|${p.pokemon}`.toLowerCase());
    const t = only(tidied.get(`${tidy(p.trainer)}|${tidy(p.pokemon)}`));
    if (t) return t;
    const b = `${base(p.trainer)}|${tidy(p.pokemon)}`;
    return pairsPerBase.get(b) === 1 ? only(byBase.get(b)) : null;
  };
}
