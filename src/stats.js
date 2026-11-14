// A pair's stats with a grid build (no DOM): the level's base stats plus every stat tile that is switched on.
export const STATS = ['HP', 'Attack', 'Defense', 'Sp. Atk', 'Sp. Def', 'Speed'];
// "Sp. Atk +10", "HP +10", "Speed 5" (the plus is sometimes missing) … → { stat, n }; anything else (a move boost, a passive) is not a stat tile
export function tileStat(c) {
  const m = /^(HP|Attack|Defense|Sp\. ?Atk|Sp\. ?Def|Speed)\s*\+?\s*(\d+)$/i.exec(String(c?.title || '').trim());
  if (!m) return null;
  const k = STATS.find(s => s.replace(/\W/g, '').toLowerCase() === m[1].replace(/\W/g, '').toLowerCase());
  return k ? { stat: k, n: +m[2] } : null;
}
export function gridBonus(ix, active) {
  const out = Object.fromEntries(STATS.map(s => [s, 0]));
  for (const n of active) { const x = tileStat(ix.byN.get(n)); if (x) out[x.stat] += x.n; }
  return out;
}
// base: { HP: 671, … } at the chosen level; extra: bonuses typed by hand (EX, EX role) — the datamine does not list them
export function totalStats(base, bonus, extra = {}) {
  return Object.fromEntries(STATS.map(s => [s, (+base?.[s] || 0) + bonus[s] + (+extra[s] || 0)]));
}
