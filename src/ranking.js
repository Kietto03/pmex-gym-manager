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
