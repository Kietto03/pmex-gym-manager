// Free Gems: what was earned (history), the year in numbers (overview) and the event calendar.
// All three read the community Gems sheet (data/gems-sheet.json) and, for the calendar, the scouts of the Dex (data/events.json).
import { esc, fmtN, fmtD, fmtDT, fmtLeft, img, pairIcon, S, hooks } from '../core.js';
import { t, locale } from '../i18n.js';
import { addDays, monthEnd, groupEvents, eventStatus } from '../gems.js';
import { eventBanner } from '../art.js';
import { PAIRS, typeIcon } from '../catalog.js';

const ui = { period: '', cal: '' };
const day = d => new Date(`${d}T00:00:00Z`).toLocaleDateString(locale(), { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
const sheet = () => S.gemSheet;
const none = () => `<p class="muted">${t('The Gems sheet is not available yet.')}</p>`;
const periodLabel = m => `${t('Month')} ${m.month} · ${m.start.slice(5).split('-').reverse().join('/')} → ${m.end.slice(5).split('-').reverse().join('/')}`;
const sum = (rows, k) => rows.reduce((a, r) => a + (r[k] ?? 0), 0);

// ── History: every day of a game month, with where the gems came from ──
export function gemHistory(today) {
  const sh = sheet(); if (!sh?.months?.length) return none();
  const periods = sh.months.filter(m => m.start && m.start <= today).reverse();   // the sheet's months run from about the 29th to the 28th
  const cur = periods.find(m => m.start <= today && today <= m.end) || periods[0];
  const m = periods.find(x => String(x.month) === ui.period) || cur;
  const days = sh.days.filter(d => d.date >= m.start && d.date <= m.end), max = Math.max(1, ...days.map(d => d.gems));
  const done = days.filter(d => d.date <= today), earned = sum(done, 'gems');
  return `<div class="card pad filters-row"><label>${t('Month')} <select data-gx-period>${periods.map(x => `<option value="${x.month}" ${x === m ? 'selected' : ''}>${esc(periodLabel(x))}</option>`).join('')}</select></label></div>
  <div class="kpis"><div class="card kpi"><small>${t('Earned up to today')}</small><b>${fmtN(earned)}</b><span>${t('{n} days', { n: done.length })}</span></div>
    <div class="card kpi"><small>${t('Whole month')}</small><b>${fmtN(m.total ?? sum(days, 'gems'))}</b><span>${t('daily {a} · Gym {b} · other {c}', { a: fmtN(m.daily ?? sum(days.map(d => d.parts || {}), 'daily')), b: fmtN(m.gym ?? sum(days.map(d => d.parts || {}), 'gym')), c: fmtN(m.other ?? 0) })}</span></div>
    <div class="card kpi"><small>${t('Best day')}</small><b>${fmtN(Math.max(0, ...done.map(d => d.gems)))}</b><span>${esc(day((done.find(d => d.gems === Math.max(...done.map(x => x.gems))) || {}).date || today))}</span></div></div>
  <div class="card scroll"><table class="table"><thead><tr><th>${t('Day')}</th><th>${t('Daily gems')}</th><th>${t('Gym Battle')}</th><th>${t('Other')}</th><th class="num">${t('Gems')}</th><th></th></tr></thead>
    <tbody>${days.map(d => `<tr class="${d.date > today ? 'dim' : ''}"><td class="nowrap"><b>${esc(day(d.date))}</b>${d.date > today ? ` <small class="muted">${t('planned')}</small>` : ''}</td>
      <td class="num">${fmtN((d.parts?.daily ?? 0) + (d.parts?.regional ?? 0))}</td><td class="num">${fmtN(d.parts?.gym ?? d.parts?.stadium ?? 0)}</td><td class="num">${fmtN((d.parts?.other ?? 0))}</td><td class="num"><b>${fmtN(d.gems)}</b></td>
      <td class="gx-bar"><i style="width:${d.gems / max * 100}%"></i></td></tr>`).join('') || `<tr><td colspan="6" class="muted pad">${t('No days in this month.')}</td></tr>`}</tbody></table></div>`;
}

// ── Overview: the months of the year and their average ──
export function gemOverview(today) {
  const sh = sheet(); if (!sh?.months?.length) return none();
  const all = sh.months.filter(m => m.total != null), done = all.filter(m => m.end < today && m.total > 0), enough = done.length >= 3;
  const avg = k => Math.round(sum(done, k) / Math.max(1, done.length)), top = Math.max(1, ...all.map(m => m.total)), mean = enough ? avg('total') : 0;
  const best = [...done].sort((a, b) => b.total - a.total)[0], low = [...done].sort((a, b) => a.total - b.total)[0];
  return `${enough ? `<div class="kpis"><div class="card kpi" style="--kc:var(--gold)"><small>${t('Average per month')}</small><b>${fmtN(mean)}</b><span>${t('over {n} finished months', { n: done.length })}</span></div>
    <div class="card kpi"><small>${t('Average per day')}</small><b>${fmtN(Math.round(sum(done, 'total') / Math.max(1, done.reduce((a, m) => a + (Date.parse(m.end) - Date.parse(m.start)) / 864e5 + 1, 0))))}</b><span>${t('daily {a} · Gym {b} · other {c}', { a: fmtN(avg('daily')), b: fmtN(avg('gym')), c: fmtN(avg('other')) })}</span></div>
    <div class="card kpi"><small>${t('Best and lowest month')}</small><b>${fmtN(best.total)}</b><span>${t('Month')} ${best.month} · ${t('lowest')} ${fmtN(low.total)} (${t('Month')} ${low.month})</span></div>
    <div class="card kpi"><small>${t('This year so far')}</small><b>${fmtN(sum(all, 'total'))}</b><span>${t('{n} months', { n: all.length })}</span></div></div>`
    : `<p class="muted">${t('The average needs at least 3 finished months; the sheet has {n} so far.', { n: done.length })}</p>`}
  <h2 class="section">${t('Month by month')}</h2><div class="card pad gx-months">${all.map(m => `<div class="gx-m ${m.end >= today ? 'cur' : ''}" title="${esc(periodLabel(m))}"><span class="gx-v">${fmtN(m.total)}</span>
    <div class="gx-col"><i style="height:${m.total / top * 100}%"></i>${enough ? `<u style="bottom:${mean / top * 100}%"></u>` : ''}</div><b>${m.month}</b></div>`).join('')}</div>
  ${enough ? `<p class="muted">${t('The line is the average of the finished months.')}</p>` : ''}
  <div class="card scroll"><table class="table"><thead><tr><th>${t('Month')}</th><th>${t('Period')}</th><th class="num">${t('Daily gems')}</th><th class="num">${t('Gym Battle')}</th><th class="num">${t('Other')}</th><th class="num">${t('Gems')}</th></tr></thead>
    <tbody>${all.map(m => `<tr><td><b>${m.month}</b></td><td class="muted nowrap">${esc(m.start)} → ${esc(m.end)}</td><td class="num">${fmtN(m.daily ?? 0)}</td><td class="num">${fmtN(m.gym ?? 0)}</td><td class="num">${fmtN(m.other ?? 0)}</td><td class="num"><b>${fmtN(m.total)}</b></td></tr>`).join('')}</tbody></table></div>
  <p class="muted">${t('Not counted: Pasio Tower, GvG ranking gems, lucky draws, compensation and one-off gifts. Source: the community Gems sheet.')}</p>`;
}

// ── Calendar: one month, the gems of each day and the scouts running ──
const EVENT_COLORS = ['#e8741f', '#3c8de8', '#3ca06e', '#b45bd6', '#d6384f', '#c9a000'];
function monthEvents(from, to) {
  const scouts = (S.events?.events || []).map(e => ({ id: e.id, banner: e.banner === 1, title: e.title, type: e.type, start: e.start.slice(0, 10), startAt: e.start.length > 10 ? e.start : undefined, end: (e.end || e.start).slice(0, 10), endAt: e.end && e.end.length > 10 ? e.end : undefined, open: !e.end, rateUp: e.rateUp }));
  const firstScout = scouts[0]?.start || '9999';
  const banners = (sheet()?.banners || []).filter(b => b.start < firstScout).map(b => ({ title: b.name, type: b.type, start: b.start, end: b.end || b.start, rateUp: [] }));   // the sheet fills the months before the datamine's scouts
  return [...banners, ...scouts].filter(e => e.end >= from && e.start <= to).sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}
const pairOf = r => PAIRS().find(p => p.trainer.toLowerCase() === r.trainer.toLowerCase() && p.pokemon.toLowerCase() === r.pokemon.toLowerCase());
// ── The event list: grouped by the moment events start, with the banner, a clear start time and where each one stands ──
const startText = e => (e.startAt ? fmtDT(`${e.startAt}Z`) : day(e.start));
const endText = e => (e.open ? t('no end date') : e.endAt ? fmtDT(`${e.endAt}Z`) : day(e.end));
function statusChip(e) {
  const st = eventStatus(e);
  return st.state === 'running' ? `<span class="ev-st running">${t('Running')}${st.ms != null ? ` · ${t('ends in {t}', { t: fmtLeft(st.ms) })}` : ''}</span>`
    : st.state === 'upcoming' ? `<span class="ev-st soon">${t('Starts in {t}', { t: fmtLeft(st.ms) })}</span>` : `<span class="ev-st ended">${t('Ended')}</span>`;
}
function eventCard(e, colorOf, i) {
  const pairs = (e.rateUp || []).map(r => pairOf(r)).filter(Boolean);
  return `<article class="ev" style="--c:${colorOf(i)}">${e.banner ? `<img class="ev-banner" src="${esc(eventBanner(e.id))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
    <div class="ev-body"><div class="ev-top"><span class="chip">${esc(e.type)}</span>${statusChip(e)}</div>
      <h4>${esc(e.title)}</h4>
      <p class="ev-when"><b>${t('Starts')} ${esc(startText(e))}</b><span>${t('Ends')} ${esc(endText(e))}</span></p>
      ${pairs.length ? `<div class="ev-pairs">${pairs.slice(0, 4).map(p => `<span title="${esc(`${p.trainer} & ${p.pokemon}`)}">${pairIcon(p, 'xs')}<small>${esc(p.trainer.replace(/\s*\(.*\)/, ''))}</small></span>`).join('')}${pairs.length > 4 ? `<small class="muted">+${pairs.length - 4}</small>` : ''}</div>` : ''}</div></article>`;
}
function eventList(events, first, last, title, colorOf) {
  const { running, groups } = groupEvents(events, first, last), idx = new Map(events.map((e, i) => [e, i]));
  const runLine = e => `<div class="ev-run"><i style="background:${colorOf(idx.get(e))}"></i><b>${esc(e.title)}</b><small class="muted">${esc(e.type)} · ${t('Ends')} ${esc(endText(e))}</small></div>`;
  return `<h2 class="section">${t('Events in {m}', { m: title })} <small>${events.length}</small></h2>
  ${events.length ? '' : `<p class="muted pad">${t('No events listed for this month.')}</p>`}
  ${running.length ? `<details class="ev-day running"><summary><h3><b>${t('Already running at the start of the month')}</b><small>${running.length}</small></h3></summary><div class="card list">${running.map(runLine).join('')}</div></details>` : ''}
  ${groups.map(g => `<section class="ev-day"><h3><b>${esc(g.events[0].startAt ? fmtDT(`${g.events[0].startAt}Z`) : day(g.date))}</b><small>${t('{n} events', { n: g.events.length })}</small></h3>
    <div class="ev-grid">${g.events.map(e => eventCard(e, colorOf, idx.get(e))).join('')}</div></section>`).join('')}`;
}
export function gemCalendar(today) {
  const month = ui.cal || today.slice(0, 7), first = `${month}-01`, last = monthEnd(first), sh = sheet(), byDate = new Map((sh?.days || []).map(d => [d.date, d]));
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7, cells = [...Array(lead).fill(null), ...Array.from({ length: +last.slice(8) }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  const events = monthEvents(first, last), colorOf = i => EVENT_COLORS[i % EVENT_COLORS.length];
  const title = new Date(`${first}T00:00:00Z`).toLocaleDateString(locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const wd = [...Array(7)].map((_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(locale(), { weekday: 'short', timeZone: 'UTC' }));
  return `<div class="toolbar"><div class="seg"><button data-gx-cal="${addDays(first, -1).slice(0, 7)}">‹</button><button class="on" disabled>${esc(title)}</button><button data-gx-cal="${addDays(last, 1).slice(0, 7)}">›</button></div>
    <button class="btn sm ghost" data-gx-cal="${today.slice(0, 7)}">${t('Today')}</button></div>
  <div class="gx-cal">${wd.map(w => `<b class="gx-wd">${esc(w)}</b>`).join('')}${cells.map(d => {
    if (!d) return '<i class="gx-blank"></i>';
    const g = byDate.get(d), starts = events.map((e, i) => [e, i]).filter(([e]) => e.start === d), running = events.filter(e => e.start < d && d <= e.end).length;
    return `<div class="gx-d ${d === today ? 'today' : ''} ${d < today ? 'past' : ''}"><div class="top"><span class="n">${+d.slice(8)}</span>${g ? `<span class="g ${d > today ? 'plan' : ''}" title="${t('Free Gems')}">${fmtN(g.gems)}</span>` : ''}</div>
      <div class="evs">${starts.slice(0, 2).map(([e, i]) => `<em style="--c:${colorOf(i)}" title="${esc(e.title)}">${esc(e.title.replace(/ ?(Scout|Tiered|One-Time-Only|5★-Guaranteed)/g, '').trim().slice(0, 22))}</em>`).join('')}${starts.length > 2 ? `<small class="muted">+${starts.length - 2}</small>` : ''}${running && !starts.length ? `<small class="muted">${t('{n} running', { n: running })}</small>` : ''}</div></div>`;
  }).join('')}</div>
  ${eventList(events, first, last, title, colorOf)}
  <p class="muted">${t('Gems per day come from the community Gems sheet (planned days are in italics). Scouts come from the datamine; the months before it come from the sheet’s banner list.')}</p>`;
}

document.addEventListener('change', e => { if (e.target.dataset?.gxPeriod !== undefined) { ui.period = e.target.value; hooks.route(); } });
document.addEventListener('click', e => { const b = e.target.closest('[data-gx-cal]'); if (b) { ui.cal = b.dataset.gxCal; hooks.route(); } });
