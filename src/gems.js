/* ═══════════════════════════════════════════════════════════════
   Free Gems projection (no DOM). Dates are "server days" as 'YYYY-MM-DD'.
   · daily    every day of a range
   · on_date  one named day
   · window   a one-off claimable on any day of a range: never placed on a made-up day,
              listed apart and counted once
   A reward whose amount is unknown is listed as incomplete and adds nothing.
   ═══════════════════════════════════════════════════════════════ */
const DAY = 864e5;
const toMs = d => Date.parse(`${d}T00:00:00Z`);
const fromMs = ms => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d, n) => fromMs(toMs(d) + n * DAY);
export const monthEnd = d => { const [y, m] = d.split('-').map(Number); return fromMs(Date.UTC(y, m, 0)); };

// The server day it is right now: the calendar day in the reset zone, counting from the reset hour
export function serverToday(settings, now = Date.now()) {
  const tz = settings?.reset_timezone || 'UTC', h = settings?.reset_hour || 0;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' })
    .formatToParts(new Date(now)).filter(x => x.type !== 'literal').map(x => [x.type, +x.value]));
  const day = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  return p.hour < h ? addDays(day, -1) : day;
}

export function project(rewards, from, to, today = from) {
  const days = new Map(), windows = [], incomplete = [], past = [];
  const put = (d, r) => { (days.get(d) || days.set(d, []).get(d)).push({ reward: r, gems: r.free_gems }); };
  for (const r of rewards) {
    if (r.free_gems == null) { if (r.end_date >= from && r.start_date <= to) incomplete.push(r); continue; }
    if (r.end_date < from) { past.push(r); continue; }
    if (r.start_date > to) continue;
    if (r.kind === 'window') windows.push({ reward: r, state: r.end_date < today ? 'closed' : r.start_date <= today ? 'open' : 'upcoming' });
    else for (let d = r.start_date < from ? from : r.start_date; d <= (r.end_date > to ? to : r.end_date); d = addDays(d, 1)) put(d, r);
  }
  let run = 0;
  const rows = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const items = days.get(d) || [], total = items.reduce((a, x) => a + x.gems, 0);
    run += total;
    rows.push({ date: d, items, total, cumulative: run, past: d < today });
  }
  for (const r of rows) r.left = run - r.cumulative;   // what is still to come after that day, to the end of the month (rewards claimable any day are not in it)
  const fixed = run, oneOff = windows.reduce((a, w) => a + w.reward.free_gems, 0), earned = rows.filter(r => r.past).reduce((a, r) => a + r.total, 0);
  return { rows, windows, incomplete, past, totals: { days: fixed, windows: oneOff, all: fixed + oneOff, earned, ahead: fixed - earned + oneOff } };
}

// ── Events of one month, the way the game's schedule reads: by the moment they start ──
// Events that began before the month and still run into it come first; the rest are grouped by their start (day and time).
// Each event: { start: 'YYYY-MM-DD', startAt?: 'YYYY-MM-DDTHH:MM' (UTC), end, endAt?, open? (no end date) }
export function groupEvents(events, first, last) {
  const running = events.filter(e => e.start < first);
  const by = new Map();
  for (const e of events.filter(x => x.start >= first && x.start <= last)) { const k = e.startAt || e.start; (by.get(k) || by.set(k, []).get(k)).push(e); }
  const groups = [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, list]) => ({ key, date: key.slice(0, 10), time: key.length > 10 ? key.slice(11, 16) : '', events: list }));
  return { running, groups };
}
// Where an event stands now: upcoming (ms until it starts), running (ms until it ends; null without an end date) or ended
export function eventStatus(e, now = Date.now()) {
  const at = (iso, endOfDay) => Date.parse(iso.length > 10 ? `${iso}Z` : `${iso}T${endOfDay ? '23:59:59' : '00:00:00'}Z`);
  const start = at(e.startAt || e.start, false), end = e.open ? null : at(e.endAt || e.end, !e.endAt);
  if (now < start) return { state: 'upcoming', ms: start - now };
  if (end != null && now > end) return { state: 'ended', ms: now - end };
  return { state: 'running', ms: end == null ? null : end - now };
}
