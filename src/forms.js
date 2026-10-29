/* ═══════════════════════════════════════════════════════════════
   The forms of a sync pair (Mega, Tera, Dynamax…), composed the way the game's pair screen shows them.
   The datamine stores a form's moves and passives slot by slot: `null` = same as the normal form, an object = the one that
   replaces it. Tera moves, Max moves and extra moves are listed on their own. This module merges them into complete
   movesets so a form never shows only the move that changed. Same rules as the Dex (pmex-supez-dex, site/app.js formView).
   ═══════════════════════════════════════════════════════════════ */

export const MECH = {
  base: { short: 'BASE', name: 'Normal form', note: '' },
  mega: { short: 'MEGA', name: 'Mega Evolution', note: 'Stats rise. Moves and passives marked MEGA only exist while Mega Evolved.' },
  tera: { short: 'TERA', name: 'Terastal', note: 'Sync Terastallize: the Pokémon changes type and gains a Tera Move and its own passives.' },
  dynamax: { short: 'D-MAX', name: 'Dynamax', note: 'Dynamax: the Pokémon’s moves become their Max Moves (shown with the move each one comes from).' },
  gigantamax: { short: 'G-MAX', name: 'Gigantamax', note: 'Gigantamax: the Pokémon’s moves become G-Max or Max Moves (shown with the move each one comes from).' },
  eternamax: { short: 'E-MAX', name: 'Eternamax', note: 'Eternamax: the Pokémon’s moves become Max Moves (shown with the move each one comes from).' },
  form: { short: 'FORM', name: 'Form change in battle', note: 'Form change in battle: moves and passives marked FORM only exist in this form.' },
};
export const mechOf = f => {
  if (!f || !f.kind || f.kind === 'base') return { ...MECH.base, key: 'base' };
  if (f.kind === 'form' && /^Primal /.test(f.label || '')) return { ...MECH.form, key: 'form', name: 'Primal Reversion' };
  if (/^Eternamax/.test(f.label || '')) return { ...MECH.eternamax, key: 'eternamax' };
  return MECH[f.kind] ? { ...MECH[f.kind], key: f.kind } : { ...MECH.form, key: 'form' };
};
// "Tera Type: X" in a form's label is only the Tera marker, already shown by the TERA badge
export const formText = s => String(s || '').replace(/\s*\(Tera Type:\s*\w+\)|^Tera Type:\s*\w+$/g, '').trim();

const named = x => x && typeof x === 'object';
// A form's slots laid over the normal form's: what it changes is marked, and remembers the move it replaces
function overlay(base, over) {
  if (!over) return base.filter(named);
  const merged = base.map((b, i) => (named(over[i]) ? { ...over[i], changed: true, replaces: b?.name || '' } : b));
  const added = over.slice(base.length).filter(named).map(x => ({ ...x, changed: true }));
  return [...merged, ...added].filter(named);
}

// One entry per form: the normal form first, then every alt form of the pair
export function formViews(d) {
  const alts = d.altSprites || [];
  const has = k => alts.some(a => a.kind === k);
  const views = [{ alt: null, kind: 'base' }, ...alts.map(alt => ({ alt, kind: alt.kind || 'form' }))];
  return views.map(({ alt, kind }) => {
    let moves = overlay(d.moves || [], alt?.moves);
    let sync = alt?.syncMove ? { ...alt.syncMove, changed: true, replaces: d.syncMove?.name || '' } : (d.syncMove || null);
    let extra = [];
    if (kind === 'dynamax' || kind === 'gigantamax' || /^Eternamax/.test(alt?.label || '')) {
      // Each Max Move takes the slot of the move it comes from; the sync move is not part of this form
      moves = [...moves];
      for (const mx of alt.maxMoves || []) {
        const at = mx.fromSlot ? moves.findIndex(m => m.slot === mx.fromSlot) : -1;
        if (at > -1) moves[at] = { ...mx, changed: true, replaces: mx.from || moves[at].name };
        else extra.push({ ...mx, changed: true, replaces: mx.from || '' });
      }
      sync = null;
    }
    if (kind === 'tera') extra = (alt.teraMoves?.length ? alt.teraMoves : d.teraMoves || []).map(m => ({ ...m, changed: true }));
    if (kind === 'base' && !has('tera')) extra = d.teraMoves || [];
    if (alt?.extraMoves) extra = alt.extraMoves.map(m => ({ ...m, changed: true }));
    if (kind === 'base' && !has('mega')) extra = [...extra, ...(d.megaMoves || [])];

    let passives = overlay(d.passives || [], alt?.passives);
    let extraPassives = [];
    // The datamine lists Tera passives by slot number
    const dmTera = (d.teraPassives || []).filter(x => typeof x.slot === 'number');
    if (kind === 'tera' && !alt.passives && dmTera.length) {
      passives = passives.map(x => { const t = dmTera.find(p => p.slot === x.slot); return t ? { ...t, changed: true, replaces: x.name } : x; });
      extraPassives = dmTera.filter(p => !passives.some(x => x.slot === p.slot)).map(x => ({ ...x, changed: true }));
    }
    if (kind === 'base' && !has('tera')) extraPassives = d.teraPassives || [];

    const mech = alt ? mechOf(alt) : mechOf(null);
    return {
      kind, mech, sprite: alt ? alt.sprite : d.pokeSprite, teraType: alt?.teraType || '',
      label: alt ? (formText(alt.label) || mech.name) : d.pokemon,
      stats: alt?.stats || d.stats || {},
      moves, sync, extra, passives, extraPassives,
    };
  });
}

// Every move name across all forms: a grid tile "Glorious Thunder: Power ↑ 5" belongs to a move of any form
export const allMoveNames = views => [...new Set(views.flatMap(v => [...v.moves, v.sync, ...v.extra].filter(named).map(m => m.name).filter(Boolean)))].sort((a, b) => b.length - a.length);
