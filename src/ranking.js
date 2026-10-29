/* ═══════════════════════════════════════════════════════════════
   Match the names a ranking sheet uses ("Gloria (Anni)", "Red 1996", "Hilbert (Var)") to sync pairs of the catalog.
   The type narrows it down. When more than one pair fits equally well the answer is null: the page then shows the
   name as text instead of guessing a picture.
   ═══════════════════════════════════════════════════════════════ */
const ALIAS = { anni: ['anniversary'], var: ['variety'], ss: ['sygna', 'ss'], alt: ['alt'], arc: ['arc'], hol: ['holiday'], ny: ['new'] };
const words = s => String(s).toLowerCase().replace(/[()'.,]/g, ' ').split(/\s+/).filter(Boolean);

export function matchUnit(unitName, type, pairs) {
  const toks = words(unitName);
  if (!toks.length) return null;
  const scored = [];
  for (const p of pairs) {
    if (type && p.type !== type) continue;
    const label = words(p.trainer);
    const hit = tok => label.some(l => l === tok || (tok.length >= 2 && l.startsWith(tok)) || (ALIAS[tok] || []).some(a => l.startsWith(a)));
    if (!toks.every(hit)) continue;
    scored.push({ p, extra: label.length - toks.length });
  }
  if (!scored.length) return null;
  const best = Math.min(...scored.map(x => x.extra)), top = scored.filter(x => x.extra === best);
  return top.length === 1 ? top[0].p : null;
}

/* ═══════════════════════════════════════════════════════════════
   resolveUnit: the clear sheets write a pair the way players say it — "Hilbert (Var)", "C.Lucas", "Koriana (Arc)", "Lacey".
   The name is matched to a trainer (typos allowed), the bracket narrows the costume, and when several pairs still fit
   the strongest recent one is chosen and flagged `approx`, so the page can show a picture without claiming certainty.
   ═══════════════════════════════════════════════════════════════ */
const TYPOS = { koriana: 'korrina', volvo: 'volo', carmie: 'carmine', holliday: 'holiday', academi: 'academy', variaty: 'variety' };
const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
// qualifier → does this pair satisfy it? (label = "Sygna Suit Lysandre (Alt.)", acq = how it was obtained)
const QUAL = {
  anni: p => /anniversary/i.test(p.trainer), var: p => /variety/i.test(p.trainer) || /Variety/i.test(p.acquisition || ''), arc: p => /arc suit/i.test(p.trainer) || /Arc Suit/i.test(p.acquisition || ''),
  ss: p => /sygna/i.test(p.trainer), sygna: p => /sygna/i.test(p.trainer), alt: p => /alt/i.test(p.trainer), champion: p => /champion/i.test(p.trainer), holiday: p => /holiday/i.test(p.trainer),
  academy: p => /academy/i.test(p.trainer), summer: p => /summer/i.test(p.trainer), fall: p => /fall/i.test(p.trainer), sc: p => /special costume/i.test(p.trainer) || /Special Costume/i.test(p.acquisition || ''),
  af: p => /Arc Suit Fair/i.test(p.acquisition || ''), '1996': p => /1996/.test(p.trainer),
};
const ALIAS_Q = { anniversary: 'anni', variety: 'var', holliday: 'holiday', costume: 'sc' };
const trainerKey = p => String(p.trainerName || p.trainer).toLowerCase().replace(/\s*\(.*\)/, '').trim();
export function resolveUnit(unit, pairs) {
  let raw = String(unit?.name || unit || '').toLowerCase().replace(/^c\./, 'champion ').trim();
  const m = /^([^(]+?)\s*(?:\((.*)\))?\s*$/.exec(raw); if (!m) return null;
  let [, who, qual = ''] = m;
  if (/^(champion|c)\s/.test(who)) { qual += ' champion'; who = who.replace(/^(champion|c)\s+/, ''); }
  if (/^ss[.\s]/.test(who)) { qual += ' ss'; who = who.replace(/^ss[.\s]+/, ''); }
  const names = [...new Set(pairs.map(trainerKey))];
  if (!names.includes(who.trim())) { const bits = who.trim().split(/\s+/); who = bits[0]; if (bits.length > 1) qual += ` ${bits.slice(1).join(' ')}`; }   // "Ball Guy" is a trainer; "Gloria Anni" is Gloria with a costume
  who = TYPOS[who.trim()] || who.trim();
  const best = names.map(n => [n, n === who ? 0 : lev(n, who)]).sort((a, b) => a[1] - b[1])[0];
  if (!best || best[1] > (who.length > 5 ? 2 : 1)) return null;
  const quals = qual.split(/[\s.,]+/).filter(Boolean).map(q => TYPOS[q] || ALIAS_Q[q] || q).filter(q => QUAL[q] || /^\d{4}$/.test(q));
  let cands = pairs.filter(p => trainerKey(p) === best[0]), exact = best[1] === 0;
  for (const q of quals) { const f = cands.filter(p => (QUAL[q] || (() => false))(p)); if (f.length) cands = f; else exact = false; }
  const score = p => (p.exRole ? 4 : 0) + (p.rarity >= 5 ? 2 : 0) + (p.release ? Date.parse(p.release) / 1e13 : 0) + (quals.length || /\bpl[a-z]*\b/.test(p.trainer) ? 0 : (/\(/.test(p.trainer) ? -1 : 1));
  cands = [...cands].sort((a, b) => score(b) - score(a));
  return cands.length ? { pair: cands[0], approx: !(exact && (cands.length === 1 || quals.length > 0 && cands.length <= 2)), candidates: cands.length } : null;
}

/* ═══════════════════════════════════════════════════════════════
   The meta of the clears: which weakness type scores highest and with which team, and which pairs turn up most in the best teams.
   ═══════════════════════════════════════════════════════════════ */
// One row per weakness type, the strongest first: how many clears there are, the best one and the best `top`.
export function metaByType(clears, { mode = '', top = 5 } = {}) {
  const by = new Map();
  for (const x of clears) { if ((mode && x.mode !== mode) || !x.type) continue; (by.get(x.type) || by.set(x.type, []).get(x.type)).push(x); }
  const rows = [...by.entries()].map(([type, list]) => {
    const sorted = [...list].sort((a, b) => b.score - a.score), best = sorted.slice(0, top);
    return { type, count: list.length, best: sorted[0], top: best, avgTop: Math.round(best.reduce((a, x) => a + x.score, 0) / best.length) };
  }).sort((a, b) => b.best.score - a.best.score || a.type.localeCompare(b.type));
  return { rows, max: rows[0]?.best.score || 0 };
}
// The units that appear in the top clears of the types, most often first (a unit counts once per clear). `key` names a unit (a pair id).
export function metaPairs(rows, key, limit = 12) {
  const m = new Map();
  for (const r of rows) for (const x of r.top) {
    const seen = new Set();
    for (const u of x.units) { const k = key(u); if (!k || seen.has(k)) continue; seen.add(k); const e = m.get(k) || { key: k, count: 0, types: new Set(), unit: u }; e.count++; e.types.add(r.type); m.set(k, e); }
  }
  return [...m.values()].sort((a, b) => b.count - a.count || b.types.size - a.types.size || String(a.key).localeCompare(String(b.key))).slice(0, limit).map(e => ({ key: e.key, unit: e.unit, count: e.count, types: e.types.size }));
}
