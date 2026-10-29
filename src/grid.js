/* ═══════════════════════════════════════════════════════════════
   Sync Grid rules (no DOM). A grid is a hex board in cube coordinates (q + r + s = 0). The pair sits at
   the centre (0,0,0), which is always active. A tile can be activated when
     · one or more of its six neighbours is active (the centre counts), and
     · its own requirements hold ("Move level must be N or higher"), and
     · the energy cap, if the player gave one, is not exceeded.
   The energy cap is deliberately an input, not a constant: it depends on game data this app does not hold.
   ═══════════════════════════════════════════════════════════════ */
const DIRS = [[1, 0, -1], [1, -1, 0], [0, -1, 1], [-1, 0, 1], [-1, 1, 0], [0, 1, -1]];
const key = (q, r) => `${q},${r}`;

export const COLORS = { blue: ['Stat', '#779EFF'], green: ['Move boost', '#47D147'], red: ['Move effect', '#FF0066'], yellow: ['Passive', '#FFC266'], rainbow: ['Sync move', '#BF80FF'] };

export function indexGrid(grid) {
  const byPos = new Map(grid.map(c => [key(c.q, c.r), c]));
  const byN = new Map(grid.map(c => [c.n, c]));
  return { grid, byPos, byN };
}
export const neighbors = (ix, c) => DIRS.map(([dq, dr]) => ix.byPos.get(key(c.q + dq, c.r + dr))).filter(Boolean);

// The level a tile asks for, if its requirements say so (the datamine writes "Move level must be N or higher")
export const levelNeeded = c => Math.max(0, ...(c.req || []).map(r => +(/level must be (\d+)/i.exec(r)?.[1] || 0)));
// Requirements this app cannot check (anything but a move level) — shown to the player, never silently ignored
export const otherReqs = c => (c.req || []).filter(r => !/level must be \d+/i.test(r));

// Is a tile next to the centre? (the six tiles around (0,0,0))
const nextToCentre = c => Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(-c.q - c.r)) === 1;

export const totals = (ix, active) => {
  const out = { energy: 0, orbs: 0, tiles: 0, byColor: {} };
  for (const n of active) { const c = ix.byN.get(n); if (!c) continue; out.energy += c.energy; out.orbs += c.orbs; out.tiles++; out.byColor[c.color] = (out.byColor[c.color] || 0) + 1; }
  return out;
};

// Which tiles are connected to the centre through active tiles
function connected(ix, active) {
  const seen = new Set(), stack = ix.grid.filter(c => nextToCentre(c) && active.has(c.n));
  stack.forEach(c => seen.add(c.n));
  while (stack.length) {
    const c = stack.pop();
    for (const x of neighbors(ix, c)) if (active.has(x.n) && !seen.has(x.n)) { seen.add(x.n); stack.push(x); }
  }
  return seen;
}

// Can tile `c` be switched on now? → null when yes, else a reason code
export function whyNot(ix, active, c, opts = {}) {
  if (active.has(c.n)) return null;
  if (!(nextToCentre(c) || neighbors(ix, c).some(x => active.has(x.n)))) return 'not-adjacent';
  if (levelNeeded(c) > (opts.moveLevel || 1)) return 'move-level';
  if (opts.energyCap != null && totals(ix, active).energy + c.energy > opts.energyCap) return 'energy';
  return null;
}
// Can tile `c` be switched off? Every other active tile must stay connected to the centre.
export function canRemove(ix, active, c) {
  const rest = new Set(active); rest.delete(c.n);
  return connected(ix, rest).size === rest.size;
}
// A saved build checked as a whole: [] means valid, else a list of { n, code }
export function validate(ix, nodes, opts = {}) {
  const problems = [], active = new Set(nodes);
  for (const n of nodes) if (!ix.byN.has(n)) problems.push({ n, code: 'unknown' });
  const ok = new Set([...active].filter(n => ix.byN.has(n)));
  const conn = connected(ix, ok);
  for (const n of ok) {
    const c = ix.byN.get(n);
    if (!conn.has(n)) problems.push({ n, code: 'not-adjacent' });
    if (levelNeeded(c) > (opts.moveLevel || 1)) problems.push({ n, code: 'move-level' });
  }
  if (opts.energyCap != null && totals(ix, ok).energy > opts.energyCap) problems.push({ n: 0, code: 'energy' });
  return problems;
}
// A short fingerprint of a pair's grid, to notice when the game data changed under a saved build
export function gridHash(grid) {
  let h = 5381;
  for (const c of grid) for (const ch of `${c.n}|${c.q}|${c.r}|${c.energy}|${c.orbs}|${c.title}|${(c.req || []).join('+')};`) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}
// Pixel position of a tile (pointy-top hexes)
// Where a tile sits on screen. The game draws its grid with flat-topped hexagons (a tile straight above and below the centre).
// The datamine's axial (q, r) are laid out as: q to the right, r up and to the left, so the six tiles around the centre
// (n = 1…6) run clockwise from the upper right. Checked against a screenshot of the game (the player's Pikachu grid): the
// 12 tiles of the second ring and 11 of the third land where the game shows them (the other orientation that also fits the
// second ring gets 5 of those 11 wrong).
export const hexXY = (c, size) => ({ x: size * 1.5 * c.q, y: -size * Math.sqrt(3) * (c.r + c.q / 2) });
