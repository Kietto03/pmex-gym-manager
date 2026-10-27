// Page module (split out of main.js). Registers its own listeners when imported.
import { $, esc, fmtN, act, api, S, isStaff, hooks } from '../core.js';
import { ico } from '../icons.js';
import { t, locale } from '../i18n.js';
import { project as projectGems, serverToday, monthEnd, addDays } from '../gems.js';
import { allTimezones } from '../time.js';

// ═══════════════════════════════════════════════════════════════
//  FREE GEMS: what is still to be earned until the end of the month (Free Gems only, a projection)
// ═══════════════════════════════════════════════════════════════
const gemUi = { tab: 'projection', month: 0, edit: null, evEdit: null };
const GEM_KINDS = [['daily', 'Every day'], ['on_date', 'One day'], ['window', 'Once, any day in the range']];
const fmtServerDay = d => new Date(`${d}T00:00:00Z`).toLocaleDateString(locale(), { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
export function renderGems() {
  const g = S.gems, today = serverToday(g.settings), staff = isStaff();
  const from = gemUi.month ? addDays(monthEnd(today), 1) : today, to = monthEnd(from);
  const tabs = [['projection', 'Projection'], ...(staff ? [['manage', 'Manage rewards']] : [])];
  if (gemUi.tab === 'manage' && !staff) gemUi.tab = 'projection';
  return `<div class="toolbar"><h1>${t('Free Gems')} <small>${t('server day {d}', { d: today })}</small></h1>
    <div class="seg">${tabs.map(([k, l]) => `<button class="${gemUi.tab === k ? 'on' : ''}" data-gem-tab="${k}">${t(l)}</button>`).join('')}</div></div>
  <p class="muted">${t('Only Free Gems. This is a projection from the rewards staff entered, not a promise of what your account will receive. Days are server days, so changing your time zone does not move a reward.')}</p>
  ${gemUi.tab === 'manage' ? gemManage(g) : gemProjection(g, from, to)}`;
}
function gemProjection(g, from, to) {
  const p = projectGems(g.rewards, from, to), eventOf = r => g.events.find(e => e.id === r.event_id);
  const seg = `<div class="seg" style="margin-bottom:10px">${[[0, 'This month'], [1, 'Next month']].map(([k, l]) => `<button class="${gemUi.month === k ? 'on' : ''}" data-gem-month="${k}">${t(l)}</button>`).join('')}</div>`;
  if (!g.rewards.length) return `${seg}<p class="muted">${t('No rewards have been entered yet.')}${isStaff() ? ` ${t('Add them under “Manage rewards”.')}` : ''}</p>`;
  const label = r => `${esc(r.label)}${eventOf(r) ? ` <small class="muted">· ${esc(eventOf(r).name)}</small>` : ''}${r.certainty === 'estimated' ? ` <span class="badge gold">${t('estimated')}</span>` : ''}`;
  return `${seg}<div class="kpis">
    <div class="card kpi" style="--kc:var(--gold)"><small>${t('Free Gems until {d}', { d: fmtServerDay(to) })}</small><b>${fmtN(p.totals.all)}</b><span>${t('{a} on set days + {b} claimable once', { a: fmtN(p.totals.days), b: fmtN(p.totals.windows) })}</span></div>
    <div class="card kpi"><small>${t('On set days')}</small><b>${fmtN(p.totals.days)}</b><span>${t('{n} days', { n: p.rows.filter(r => r.total).length })}</span></div>
    <div class="card kpi"><small>${t('Claimable once, any day')}</small><b>${fmtN(p.totals.windows)}</b><span>${t('{n} rewards', { n: p.windows.length })}</span></div></div>
  ${p.windows.length ? `<h2 class="section">${t('Claim any day in the range')} <small>${t('not placed on a day')}</small></h2><div class="card list">${p.windows.map(w => `<div class="run"><div><b>${label(w.reward)}</b>
    <small class="muted">${fmtServerDay(w.reward.start_date)} → ${fmtServerDay(w.reward.end_date)}${w.reward.condition ? ` · ${esc(w.reward.condition)}` : ''}</small></div>
    <span class="badge ${w.state === 'open' ? 'good' : ''}">${w.state === 'open' ? t('available now') : t('upcoming')}</span><b class="num">${fmtN(w.reward.free_gems)}</b></div>`).join('')}</div>` : ''}
  <h2 class="section">${t('Day by day')}</h2><div class="card scroll"><table class="table"><thead><tr><th>${t('Day')}</th><th>${t('From')}</th><th class="num">${t('Gems')}</th><th class="num">${t('Total so far')}</th></tr></thead>
    <tbody>${p.rows.map(r => `<tr class="${r.total ? '' : 'dim'}"><td class="nowrap"><b>${fmtServerDay(r.date)}</b></td><td>${r.items.map(x => `${label(x.reward)} <small class="muted">+${fmtN(x.gems)}</small>`).join('<br>') || '<span class="muted">—</span>'}</td>
      <td class="num">${r.total ? `<b>${fmtN(r.total)}</b>` : '—'}</td><td class="num muted">${fmtN(r.cumulative)}</td></tr>`).join('')}</tbody></table></div>
  ${p.incomplete.length ? `<h2 class="section">${t('Not enough data')}</h2><div class="card list">${p.incomplete.map(r => `<div class="run"><div><b>${label(r)}</b><small class="muted">${fmtServerDay(r.start_date)}${r.end_date !== r.start_date ? ` → ${fmtServerDay(r.end_date)}` : ''}</small></div><span class="badge">${t('amount unknown')}</span></div>`).join('')}</div>
    <p class="muted">${t('These are not counted in any total.')}</p>` : ''}`;
}
function gemManage(g) {
  const e = gemUi.edit, ev = gemUi.evEdit, o = (k, d = '') => esc(e?.[k] ?? d);
  return `<div class="card pad form"><h2 class="title">${t('Server day')}</h2><div class="grid3">
    <label>${t('Reset time zone')}<select id="gem-tz">${[...new Set([g.settings.reset_timezone, 'UTC', ...allTimezones()])].map(z => `<option ${z === g.settings.reset_timezone ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></label>
    <label>${t('Reset hour (0–23)')}<input id="gem-hour" type="number" min="0" max="23" value="${g.settings.reset_hour}"></label></div>
    <small class="muted">${t('The game’s day changes at this hour in this zone. Rewards are placed on these days.')}</small></div>
  ${e ? `<form class="card pad form" id="gem-form"><h2 class="title">${e.id ? t('Edit reward') : t('Add a reward')}</h2>
    <div class="grid3"><label>${t('Name')}<input name="label" value="${o('label')}" required></label>
      <label>${t('Kind')}<select name="kind">${GEM_KINDS.map(([k, l]) => `<option value="${k}" ${(e.kind || 'daily') === k ? 'selected' : ''}>${t(l)}</option>`).join('')}</select></label>
      <label>${t('Free Gems')}<input name="free_gems" type="number" min="0" value="${e.free_gems ?? ''}" placeholder="${t('unknown')}"></label></div>
    <div class="grid3"><label>${t('From')}<input name="start_date" type="date" value="${o('start_date')}" required></label><label>${t('To')}<input name="end_date" type="date" value="${o('end_date')}"></label>
      <label>${t('Event')}<select name="event_id"><option value="">—</option>${g.events.map(x => `<option value="${x.id}" ${e.event_id === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label></div>
    <div class="grid3"><label>${t('How sure')}<select name="certainty"><option value="confirmed" ${e.certainty !== 'estimated' ? 'selected' : ''}>${t('confirmed')}</option><option value="estimated" ${e.certainty === 'estimated' ? 'selected' : ''}>${t('estimated')}</option></select></label>
      <label>${t('Condition')}<input name="condition" value="${o('condition')}"></label><label>${t('Source')}<input name="source" value="${o('source')}"></label></div>
    <div class="row"><button class="btn primary">${t('Save')}</button><button type="button" class="btn ghost" data-gem-cancel>${t('Cancel')}</button><p class="form-err" id="gem-err"></p></div></form>` : `<div class="row" style="margin:10px 0"><button class="btn primary" data-gem-new>${ico('plus')} ${t('Add a reward')}</button><button class="btn" data-gem-ev-new>${ico('plus')} ${t('Add an event')}</button></div>`}
  ${ev ? `<form class="card pad form" id="gem-ev-form"><h2 class="title">${t('Add an event')}</h2><div class="grid3"><label>${t('Name')}<input name="name" required></label><label>${t('From')}<input name="start_date" type="date" required></label><label>${t('To')}<input name="end_date" type="date" required></label></div>
    <label>${t('Source')}<input name="source"></label><div class="row"><button class="btn primary">${t('Save')}</button><button type="button" class="btn ghost" data-gem-cancel>${t('Cancel')}</button></div></form>` : ''}
  <div class="card scroll"><table class="table"><thead><tr><th>${t('Reward')}</th><th>${t('Kind')}</th><th>${t('Dates')}</th><th class="num">${t('Gems')}</th><th></th></tr></thead>
    <tbody>${g.rewards.map(r => `<tr><td><b>${esc(r.label)}</b>${r.event_id ? `<br><small class="muted">${esc(g.events.find(x => x.id === r.event_id)?.name || '')}</small>` : ''}</td><td>${t(GEM_KINDS.find(k => k[0] === r.kind)?.[1] || r.kind)}</td>
      <td class="nowrap">${r.start_date}${r.end_date !== r.start_date ? ` → ${r.end_date}` : ''}</td><td class="num">${r.free_gems == null ? `<span class="muted">?</span>` : fmtN(r.free_gems)}</td>
      <td class="acts"><button class="btn sm ghost" data-gem-edit="${r.id}">${t('Edit')}</button><button class="btn sm ghost" data-gem-del="${r.id}" aria-label="${t('Delete')}">${ico('x')}</button></td></tr>`).join('') || `<tr><td colspan="5" class="muted pad">${t('No rewards have been entered yet.')}</td></tr>`}</tbody></table></div>
  ${g.events.length ? `<h2 class="section">${t('Events')}</h2><div class="card list">${g.events.map(x => `<div class="run"><div><b>${esc(x.name)}</b><small class="muted">${x.start_date} → ${x.end_date}${x.source ? ` · ${esc(x.source)}` : ''}</small></div><button class="btn sm ghost" data-gem-ev-del="${x.id}" aria-label="${t('Delete')}">${ico('x')}</button></div>`).join('')}</div>` : ''}`;
}
document.addEventListener('change', async e => {
  if (e.target.id === 'gem-tz' || e.target.id === 'gem-hour') {
    const patch = { reset_timezone: $('#gem-tz').value, reset_hour: Math.min(23, Math.max(0, +$('#gem-hour').value || 0)) };
    if (await act(() => api.saveGemSettings(patch), t('Saved.'))) { S.gems = await api.gems(); hooks.route(); }
  }
});
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-gem-tab],[data-gem-month],[data-gem-new],[data-gem-ev-new],[data-gem-cancel],[data-gem-edit],[data-gem-del],[data-gem-ev-del]');
  if (!el) return;
  const d = el.dataset, refresh = async () => { S.gems = await api.gems(); hooks.route(); };
  if (d.gemTab) { gemUi.tab = d.gemTab; hooks.route(); }
  else if (d.gemMonth !== undefined) { gemUi.month = +d.gemMonth; hooks.route(); }
  else if ('gemNew' in d) { gemUi.edit = { kind: 'daily' }; gemUi.evEdit = null; hooks.route(); }
  else if ('gemEvNew' in d) { gemUi.evEdit = {}; gemUi.edit = null; hooks.route(); }
  else if ('gemCancel' in d) { gemUi.edit = gemUi.evEdit = null; hooks.route(); }
  else if (d.gemEdit) { gemUi.edit = { ...S.gems.rewards.find(r => r.id === +d.gemEdit) }; hooks.route(); window.scrollTo({ top: 0 }); }
  else if (d.gemDel) { if (confirm(t('Delete this reward?')) && await act(() => api.deleteGemReward(+d.gemDel), t('Reward deleted.'))) await refresh(); }
  else if (d.gemEvDel) { if (confirm(t('Delete this event and its rewards?')) && await act(() => api.deleteGemEvent(+d.gemEvDel), t('Event deleted.'))) await refresh(); }
});
document.addEventListener('submit', async e => {
  if (e.target.id === 'gem-form') {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const row = { label: f.label.trim(), kind: f.kind, start_date: f.start_date, end_date: f.kind === 'on_date' || !f.end_date ? f.start_date : f.end_date, free_gems: f.free_gems === '' ? null : +f.free_gems,
      event_id: f.event_id ? +f.event_id : null, certainty: f.certainty, condition: f.condition.trim(), source: f.source.trim() };
    if (gemUi.edit.id) row.id = gemUi.edit.id;
    if (await act(() => api.saveGemReward(row), t('Saved.'))) { gemUi.edit = null; S.gems = await api.gems(); hooks.route(); }
  }
  if (e.target.id === 'gem-ev-form') {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (await act(() => api.saveGemEvent({ name: f.name.trim(), start_date: f.start_date, end_date: f.end_date, source: f.source.trim(), created_by: S.me }), t('Saved.'))) { gemUi.evEdit = null; S.gems = await api.gems(); hooks.route(); }
  }
});

