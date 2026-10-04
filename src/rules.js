/* ═══════════════════════════════════════════════════════════════
   Gym Battle rules — the same checks as public.check_run() in the
   database, run in the browser first so mistakes show up instantly.
   No DOM, no network.
   ═══════════════════════════════════════════════════════════════ */
import { t } from './i18n.js';

export const TOWER_TOP = 40;
const DAY = 864e5;

// ─── Circuits ───────────────────────────────────────────────
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
export const roundShort = label => String(label).replace(/^Circuit (\d+)/, 'C$1').replace(/^Extra Battle (\d+).*/, 'EX$1');

// ─── Tickets ────────────────────────────────────────────────
// day1 when Battle opens, +daily every 24 h until Battle ends, capped per member
export function ticketsGranted(season, now = Date.now()) {
  const start = Date.parse(season.battle_start), end = Date.parse(season.battle_end);
  if (!(now >= start)) return 0;
  // +daily every 24 h, and the last daily allotment is in hand for the whole final day, so a full
  // 7-day Battle hits the per-member cap of 30 (12 on day 1, +3 a day; the event log shows members using all 30)
  const days = Math.ceil((end - start) / DAY);
  const passed = Math.floor((Math.min(now, end) - start) / DAY) + (now >= end - DAY ? 1 : 0);
  return Math.min(season.ticket_cap, season.tickets_day1 + season.tickets_daily * Math.min(passed, days));
}

// ─── Season state, recomputed from the raw run log ──────────
export function seasonState(season, runs, seasonMembers = [], now = Date.now()) {
  const leaders = (season.leaders || []).map(l => l.name);
  const banned = new Set(seasonMembers.filter(m => m.banned).map(m => m.user_id));
  const pts = {};            // pts[round][leader]
  const perMember = {};
  let gymUsed = 0, combined = 0, maxRound = 0;
  for (const r of runs) {
    ((pts[r.round] ||= {})[r.leader] = (pts[r.round][r.leader] || 0) + r.score);
    const key = r.user_id || `name:${r.member_name}`;
    const m = (perMember[key] ||= { key, user_id: r.user_id, name: r.member_name, score: 0, tickets: 0, runs: 0, excluded: false });
    m.score += r.score; m.tickets += r.tickets; m.runs++;
    if (r.excluded) m.excluded = true;
    gymUsed += r.tickets;
    if (!banned.has(r.user_id) && !r.excluded) combined += r.score;
    maxRound = Math.max(maxRound, r.round);
  }
  // The first round where not every Gym Leader is at the cap is the one open for new runs
  let active = null;
  for (let n = 1; n < 500; n++) {
    const c = circuitAt(season, n);
    if (!c) break;
    if (!leaders.every(l => (pts[n]?.[l] || 0) >= c.pts)) { active = n; break; }
  }
  const start = Date.parse(season.battle_start), end = Date.parse(season.battle_end);
  const phase = now < start ? 'upcoming' : now >= end ? 'ended' : 'battle';
  return { leaders, pts, perMember, banned, gymUsed, combined, active, finished: active == null, maxRound,
    granted: ticketsGranted(season, now), phase, start, end };
}

export const pointsIn = (st, round, leader) => st.pts[round]?.[leader] || 0;

// ─── Run validation (mirror of check_run); returns a message or null ───
export function validateRun(season, st, run, { editing = null, isStaff = false } = {}) {
  if (!Number.isInteger(run.tickets) || run.tickets < 1 || run.tickets > 3) return t('Tickets must be 1, 2 or 3.');
  if (!Number.isInteger(run.score) || run.score < 0) return t('Score must be a whole number, 0 or more.');
  if (!st.leaders.includes(run.leader)) return t('Pick a Gym Leader.');
  const c = circuitAt(season, run.round);
  if (!c) return t('That round does not exist in this season.');
  if (c.fixed && run.tickets !== c.fixed) return t('{round} always costs {n} tickets per run (1–3 tickets only from Extra Battles).', { round: c.label, n: c.fixed });
  if (!run.user_id) return t('Pick a member.');
  if (st.banned.has(run.user_id) && (!editing || editing.user_id !== run.user_id)) return t('This member is locked for the season and cannot log new runs.');
  if (!editing && !isStaff && run.round !== st.active) return t('Runs can only be logged for the open round ({round}).', { round: st.active ? circuitAt(season, st.active).label : '—' });

  const used = (st.perMember[run.user_id]?.tickets || 0) - (editing?.user_id === run.user_id ? editing.tickets : 0);
  if (used + run.tickets > st.granted) return t('Not enough tickets: {used} used, {granted} handed out so far.', { used, granted: st.granted });
  const gymLeft = season.gym_ticket_cap - st.gymUsed + (editing ? editing.tickets : 0);
  if (run.tickets > gymLeft) return t('The gym can only use {cap} tickets — {left} left.', { cap: season.gym_ticket_cap, left: Math.max(gymLeft, 0) });
  const have = pointsIn(st, run.round, run.leader) - (editing && editing.round === run.round && editing.leader === run.leader ? editing.score : 0);
  if (have + run.score > c.pts) return t('Over the cap: {leader} in {round} only needs {n} more points.', { leader: run.leader, round: c.label, n: (c.pts - have).toLocaleString('en-US') });

  const ids = (run.team || []).map(x => x.pair_id);
  if (ids.length > 3) return t('A team has at most 3 sync pairs.');
  if (new Set(ids).size !== ids.length) return t('The same sync pair is in the team twice.');
  if (!editing && !isStaff && !ids.length) return t('Add at least one sync pair to the team.');
  return null;
}

// ─── Member strength for a type ─────────────────────────────
// Pair weight: level (1–10) + 2 if 6★ EX + 1 if EX Role − 1 per missing star. Fit for a type = best three
// owned pairs of that type + a quarter of the tower floors cleared.
export const pairWeight = mp => (mp.level || 1) + (mp.ex ? 2 : 0) + (mp.ex_role ? 1 : 0) - (5 - (mp.stars || 5));

export function readiness(ownedPairs, towerFloor, type, pairById) {
  const mine = ownedPairs
    .map(mp => ({ ...mp, pair: pairById(mp.pair_id) }))
    .filter(x => x.pair?.type === type)
    .sort((a, b) => pairWeight(b) - pairWeight(a));
  const top = mine.slice(0, 3).reduce((a, x) => a + pairWeight(x), 0);
  return { pairs: mine, count: mine.length, top, floor: towerFloor || 0, score: top + (towerFloor || 0) / 4 };
}

// A starting team for a Gym Leader from one member's roster: the strongest attacker of a
// weakness type, the strongest support, then the next best pair of a weakness type.
// Only a suggestion — staff adjust it on the Plan page.
const ATTACK = /Strike|Tech|Sprint|Multi/, HELP = /Support|Field/;
export function suggestTeam(ownedPairs, weakTypes, pairById) {
  const all = ownedPairs.map(mp => ({ ...mp, pair: pairById(mp.pair_id) })).filter(x => x.pair)
    .sort((a, b) => pairWeight(b) - pairWeight(a));
  const weak = x => weakTypes.includes(x.pair.type);
  const team = [];
  const take = x => { if (x && team.length < 3 && !team.includes(x)) team.push(x); };
  take(all.find(x => weak(x) && ATTACK.test(x.pair.role)));
  take(all.find(x => HELP.test(x.pair.role) && weak(x)) || all.find(x => HELP.test(x.pair.role)));
  take(all.find(x => weak(x) && !team.includes(x)));
  return team;
}

export const levelLabel = lv => `${lv}/5`;
