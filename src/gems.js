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
  const fixed = run, oneOff = windows.reduce((a, w) => a + w.reward.free_gems, 0), earned = rows.filter(r => r.past).reduce((a, r) => a + r.total, 0);
  return { rows, windows, incomplete, past, totals: { days: fixed, windows: oneOff, all: fixed + oneOff, earned, ahead: fixed - earned + oneOff } };
}
