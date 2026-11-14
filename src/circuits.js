/* Circuits of a Gym Battle season: what each round is worth. No DOM, no network. */
// Round n of a season. Past the last circuit, an "… and onward" circuit repeats
// (Extra Battle 12, 13, …); anything else ends the season.
export function circuitAt(season, n) {
  const C = season.circuits || [];
  const last = C[C.length - 1];
  const onward = last && /and onward/i.test(last.name);
  const from = onward ? +(last.name.match(/(\d+)/)?.[1] || 0) : 0;
  const regular = c => /^regular/i.test(c.kind || '');
  if (n >= 1 && n <= C.length) {
    const c = C[n - 1];
    return { ...c, n, fixed: regular(c) ? 3 : null, label: onward && n === C.length ? `Extra Battle ${from}` : c.name };
  }
  if (onward && n > C.length) return { ...last, n, fixed: regular(last) ? 3 : null, repeat: true, label: `Extra Battle ${from + n - C.length}` };
  return null;
}
// The road through the circuits: what each round is worth per leader, what clearing every leader of the round gives, the running total, and
// the round where the season's target score is reached. Rounds past the last circuit repeat ("… and onward") until the target is passed.
export function circuitGuide(season, { leaders = (season.leaders || []).length, target = +season.target_score || 0, max = 40 } = {}) {
  const rows = []; let cumulative = 0, reachedAt = null;
  for (let n = 1; n <= max; n++) {
    const c = circuitAt(season, n);
    if (!c || (c.repeat && !target)) break;           // the circuits of the season; repeats only matter on the way to a target
    const total = (+c.pts || 0) * leaders;
    cumulative += total;
    const hit = target > 0 && reachedAt == null && cumulative >= target;
    if (hit) reachedAt = n;
    rows.push({ n, label: c.label, kind: c.kind || '', pts: +c.pts || 0, total, cumulative, reached: hit, left: target > 0 ? Math.max(0, target - cumulative) : null });
    if (reachedAt != null && n > reachedAt) break;    // one row past the target shows how much room there is
  }
  return { rows, reachedAt, target, leaders };
}
export const roundShort = label => String(label).replace(/^Circuit (\d+)/, 'C$1').replace(/^Extra Battle (\d+).*/, 'EX$1');

