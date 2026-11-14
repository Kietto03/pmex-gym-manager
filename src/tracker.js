/* ═══════════════════════════════════════════════════════════════
   Import a SyncPairsTracker backup (pomasters.github.io/SyncPairsTracker → Export).
   The backup is JSON: { "<dexNumber>|<pokemonNumber>": "level|image|star|fav|roleEX|grid", … }
   and only lists the pairs the person ticked (= owns).
     level   0–9   → move level 1/5 … 10/5 (6–10 = Superawakened)
     image   index into the pair's images → its star tier; the _EX image means 6★ EX
     roleEX  0 / 1 → EX Role unlocked
     fav, grid     hearts and grid progress: not used here
   ═══════════════════════════════════════════════════════════════ */

export function parseTrackerBackup(text) {
  let json;
  try { json = JSON.parse(String(text || '').trim()); } catch { return { error: 'json' }; }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { error: 'shape' };
  const entries = [];
  let skipped = 0;
  for (const [key, value] of Object.entries(json)) {
    const [level, image, star, fav, roleEX] = String(value).split('|');
    if (!/^\d+\|\d+(\|\d+)*$/.test(key) || [level, image, roleEX].some(v => v === undefined || isNaN(+v))) { skipped++; continue; }
    entries.push({ key, level: +level, image: +image, roleEX: +roleEX });
  }
  return entries.length ? { entries, skipped } : { error: 'empty' };
}

// Turn entries into member_pairs fields. `byKey` maps a tracker key to a catalog pair.
export function trackerRows(entries, byKey) {
  const rows = [], unknown = [];
  for (const e of entries) {
    const p = byKey(e.key);
    if (!p) { unknown.push(e.key); continue; }
    const img = p.images[e.image] || '';
    const ex = /_EX\.png$/i.test(img);
    const tier = +(img.match(/_(\d)\.png$/i)?.[1] || 0);
    rows.push({
      pair_id: p.id,
      level: Math.max(1, Math.min(p.maxBonus, e.level + 1)),
      stars: ex ? 5 : Math.max(p.rarity, Math.min(5, tier || p.rarity)),
      ex,
      ex_role: !!p.exRole && e.roleEX === 1,
    });
  }
  return { rows, unknown };
}
