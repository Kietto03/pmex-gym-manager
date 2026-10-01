/* ═══════════════════════════════════════════════════════════════
   The Roster sheet: one sheet per type, one row per member. Each slot holds
   one of the member's own pairs, picked by hand (the suggestions below only
   help fill it). Gloria and R96 are fixed pairs that are broken for every
   type, so their cells just show whether / how the member has them.
   ═══════════════════════════════════════════════════════════════ */
import { PAIRS, pairById, wtzScore, rebuffs } from './catalog.js';
import { pairWeight } from './rules.js';

const fixedPair = (name, alt) => PAIRS().find(p => p.trainerName === name && alt.test(p.alt))?.id;

export const SHEET_SLOTS = [
  { k: 'special', label: 'Special', hint: 'Special striker of this type', fits: (p, ty) => p.type === ty && p.role === 'Strike (Special)' },
  { k: 'physical', label: 'Physical', hint: 'Physical striker of this type', fits: (p, ty) => p.type === ty && p.role === 'Strike (Physical)' },
  { k: 'wtz', label: 'EX WTZ', hint: 'Sets the (EX) weather, terrain or zone for this type', fits: (p, ty) => wtzScore(p, ty) >= 2, rank: (p, ty) => wtzScore(p, ty) },
  { k: 'rebuff', label: 'Rebuff', hint: 'Lowers the opponents’ Type Rebuff for this type', fits: (p, ty) => rebuffs(p, ty) },
  { k: 'gloria', label: 'Gloria', fixed: () => fixedPair('Gloria', /Anniversary/) },
  { k: 'red', label: 'R96', fixed: () => fixedPair('Red', /1996/) },
  { k: 'support', label: 'Support', hint: 'Support of this type', fits: (p, ty) => p.type === ty && p.role === 'Support' },
  { k: 'other1', label: 'Other 1', hint: 'Any other pair of this type', fits: (p, ty) => p.type === ty },
  { k: 'other2', label: 'Other 2', hint: 'Any other pair of this type', fits: (p, ty) => p.type === ty },
  { k: 'other3', label: 'Other 3', hint: 'Any other pair of this type', fits: (p, ty) => p.type === ty },
];
export const fixedIds = () => SHEET_SLOTS.filter(s => s.fixed).map(s => s.fixed()).filter(Boolean);

// Owned pairs (with .pair) ranked for a slot: fitting ones first, strongest first
export function rankForSlot(mine, ty, slot) {
  const rank = x => (slot.rank ? slot.rank(x.pair, ty) : 0);
  return mine.filter(x => slot.fits(x.pair, ty)).sort((a, b) => rank(b) - rank(a) || pairWeight(b) - pairWeight(a));
}

// A starting facilitator team from one member's roster: pairs that lower the opponent's Type Rebuff for the
// Gym Leader's weakness types first, then the strongest Support / Tech pairs (stat drops and status effects
// are not tagged in the data, so those are a guess the staff adjust).
export function suggestFacilitator(ownedRows, weakTypes) {
  const all = ownedRows.map(x => ({ ...x, pair: x.pair || pairById(x.pair_id) })).filter(x => x.pair)
    .sort((a, b) => pairWeight(b) - pairWeight(a));
  const team = [];
  const take = x => { if (x && team.length < 3 && !team.includes(x)) team.push(x); };
  for (const ty of weakTypes) take(all.find(x => !team.includes(x) && rebuffs(x.pair, ty)));
  for (const x of all) if (team.length < 3 && /Support|Tech/.test(x.pair.role)) take(x);
  return team;
}

// Fill the empty slots of one member's row. `cells` maps slot → pair id (null = marked none).
export function autoFill(ownedRows, ty, cells = {}) {
  const mine = ownedRows.map(x => ({ ...x, pair: x.pair || pairById(x.pair_id) })).filter(x => x.pair);
  const used = new Set([...fixedIds(), ...Object.values(cells).filter(Boolean)]);
  const out = {};
  for (const slot of SHEET_SLOTS) {
    if (slot.fixed || slot.k in cells) continue;
    const x = rankForSlot(mine, ty, slot).find(y => !used.has(y.pair_id));
    if (x) { out[slot.k] = x.pair_id; used.add(x.pair_id); }
  }
  return out;
}
