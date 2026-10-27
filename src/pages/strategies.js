// Page module (split out of main.js). Registers its own listeners when imported.
import { $, esc, pairIcon, ownIcon, typeTag, toast, act, api, S, isStaff, profile, nameOf, season, owned, ownedPair, hooks } from '../core.js';
import { ico } from '../icons.js';
import { t } from '../i18n.js';
import { PAIRS, pairById, pairName, TYPES } from '../catalog.js';

// ═══════════════════════════════════════════════════════════════
//  STRATEGIES: a library of team strategies with a review workflow
//  draft → pending review → published (or "changes requested"); editing a published
//  strategy opens a new revision and the published one stays until the new one is approved.
// ═══════════════════════════════════════════════════════════════
const STRAT_MODES = ['GvG', 'DC 3v1', 'DC 3v3'];
const ST_STATUS = { draft: ['', 'Draft'], pending: ['gold', 'Waiting for review'], published: ['good', 'Published'], changes_requested: ['bad', 'Changes requested'], superseded: ['', 'Replaced'] };
let stratView = 'library', stratOpen = null, stratEdit = null;
const stratFilter = { mode: '', type: '', q: '' };
const revsOf = sid => S.strats.revisions.filter(r => r.strategy_id === sid).sort((a, b) => b.rev_no - a.rev_no);
const stratById = id => S.strats.strategies.find(x => x.id === id);
const publishedOf = st => S.strats.revisions.find(r => r.id === st.published_rev);
// A video URL → how to show it. Only providers that allow embedding are embedded; the link to open it is always there.
function videoInfo(url) {
  try {
    const u = new URL(url), h = u.hostname.replace(/^www\./, '');
    let id = '';
    if (h === 'youtu.be') id = u.pathname.slice(1);
    else if (/(^|\.)youtube\.com$/.test(h)) id = u.searchParams.get('v') || (/^\/(embed|shorts)\//.test(u.pathname) ? u.pathname.split('/')[2] : '');
    if (/^[\w-]{11}$/.test(id)) return { provider: 'YouTube', embed: `https://www.youtube-nocookie.com/embed/${id}` };
    return { provider: h, embed: '' };
  } catch { return null; }
}
const stratTeam = (team, uid) => (team || []).map(x => {
  const p = pairById(x.pair_id), mp = uid && ownedPair(uid, x.pair_id);
  return p ? `<span class="st-pair ${uid && !mp ? 'missing' : ''}" title="${esc(pairName(p))}${uid ? (mp ? '' : ` — ${t('you do not own this pair')}`) : ''}">${mp ? ownIcon(p, mp, 'sm') : pairIcon(p, 'sm')}<small>${esc(p.pokemon)}</small></span>` : '';
}).join('');

export function renderStrategies() {
  const staff = isStaff(), f = stratFilter, q = f.q.trim().toLowerCase();
  const pending = S.strats.revisions.filter(r => r.status === 'pending');
  const mine = S.strats.revisions.filter(r => r.author_id === S.me && !['superseded'].includes(r.status) && !(r.status === 'published' && false));
  const tabs = [['library', 'Library'], ['mine', `My strategies (${mine.length})`], ...(staff ? [['review', `To review (${pending.length})`]] : [])];
  if (stratView === 'review' && !staff) stratView = 'library';
  const matches = r => (!f.mode || stratById(r.strategy_id)?.mode === f.mode) && (!f.type || r.weakness === f.type)
    && (!q || `${r.title} ${r.boss} ${r.season_label} ${r.conditions} ${r.rotation}`.toLowerCase().includes(q));
  const card = (r, st) => `<article class="card pad strat" data-strat-open="${r.id}" tabindex="0">
    <div class="res-top"><span class="badge">${esc(st.mode)}</span>${r.weakness ? typeTag(r.weakness) : ''}<span class="badge ${ST_STATUS[r.status][0]}">${t(ST_STATUS[r.status][1])}</span>${st.published_rev && r.status !== 'published' ? `<span class="badge">${t('revision {n}', { n: r.rev_no })}</span>` : ''}</div>
    <h3>${esc(r.title)}</h3><small class="muted">${[r.boss, r.season_label].filter(Boolean).map(esc).join(' · ')}</small>
    <div class="team">${stratTeam(r.team, S.me)}</div>${r.video_url ? `<small class="muted">${ico('flag')} ${t('Video')}</small>` : ''}</article>`;
  let list;
  if (stratView === 'mine') list = mine.filter(matches).map(r => card(r, stratById(r.strategy_id)));
  else if (stratView === 'review') list = pending.filter(matches).map(r => card(r, stratById(r.strategy_id)));
  else list = S.strats.strategies.filter(st => !st.archived).map(st => publishedOf(st)).filter(r => r && matches(r)).map(r => card(r, stratById(r.strategy_id)));
  return `<div class="toolbar"><h1>${t('Strategies')} <small>${t('{n} published', { n: S.strats.strategies.filter(x => !x.archived && x.published_rev).length })}</small></h1>
    <button class="btn primary" data-strat-new>${ico('plus')} ${t('New strategy')}</button></div>
  <p class="muted">${t('Team strategies for GvG and D.C. Everyone can write one; a mod or the admin approves it before it appears in the library.')}</p>
  ${stratEdit ? stratEditor() : ''}${stratOpen && !stratEdit ? stratDetail() : ''}
  <div class="seg" style="margin:10px 0">${tabs.map(([k, l]) => `<button class="${stratView === k ? 'on' : ''}" data-strat-view="${k}">${t(l.replace(/ \(\d+\)$/, ''))}${/\((\d+)\)$/.exec(l) ? ` (${/\((\d+)\)$/.exec(l)[1]})` : ''}</button>`).join('')}</div>
  <div class="card pad filters-row"><input id="strat-q" placeholder="${t('Search title, boss, rotation…')}" value="${esc(f.q)}">
    <select data-strat-f="mode"><option value="">${t('All modes')}</option>${STRAT_MODES.map(m => `<option ${f.mode === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
    <select data-strat-f="type"><option value="">${t('Any weakness')}</option>${TYPES.map(ty => `<option value="${ty}" ${f.type === ty ? 'selected' : ''}>${t(ty)}</option>`).join('')}</select></div>
  <div class="res-grid">${list.join('') || `<p class="muted">${stratView === 'review' ? t('Nothing is waiting for review.') : t('No strategies match.')}</p>`}</div>`;
}

function stratDetail() {
  const r = S.strats.revisions.find(x => x.id === stratOpen), st = r && stratById(r.strategy_id);
  if (!r) return '';
  const staff = isStaff(), mineRev = r.author_id === S.me, v = r.video_url && videoInfo(r.video_url);
  const missing = (r.team || []).filter(x => !ownedPair(S.me, x.pair_id)).map(x => pairById(x.pair_id)).filter(Boolean);
  const open = revsOf(st.id).find(x => ['draft', 'pending', 'changes_requested'].includes(x.status));
  const s = season();
  return `<section class="card pad strat-detail"><div class="row"><h2 class="title">${esc(r.title)}</h2><span class="spacer"></span><button class="btn sm ghost" data-strat-close>${ico('x')}</button></div>
    <div class="res-top"><span class="badge">${esc(st.mode)}</span>${r.weakness ? typeTag(r.weakness) : ''}<span class="badge ${ST_STATUS[r.status][0]}">${t(ST_STATUS[r.status][1])}</span><span class="badge">${t('revision {n}', { n: r.rev_no })}</span>
      <small class="muted">${t('by {n}', { n: esc(nameOf(profile(r.author_id)) || '—') })}</small></div>
    ${r.review_note ? `<p class="notice">${ico('note')} ${esc(r.review_note)}</p>` : ''}
    <dl class="kv">${[['Boss', r.boss], ['Season or version', r.season_label], ['Conditions', r.conditions]].filter(x => x[1]).map(([k, x]) => `<dt>${t(k)}</dt><dd>${esc(x)}</dd>`).join('')}</dl>
    <h3>${t('Team')}</h3><div class="team">${stratTeam(r.team, S.me) || `<span class="muted">${t('No team listed.')}</span>`}</div>
    ${missing.length ? `<p class="muted">${t('You are missing: {p}', { p: missing.map(p => esc(pairName(p))).join(', ') })}</p>` : ''}
    ${r.grid_note ? `<h3>${t('Grid notes')}</h3><p class="pre">${esc(r.grid_note)}</p>` : ''}
    <h3>${t('Rotation')}</h3><p class="pre">${esc(r.rotation) || `<span class="muted">—</span>`}</p>
    ${v ? `<h3>${t('Video')}</h3>${v.embed ? `<div class="video"><iframe src="${esc(v.embed)}" loading="lazy" allowfullscreen referrerpolicy="no-referrer"></iframe></div>` : ''}<a class="btn sm" href="${esc(r.video_url)}" target="_blank" rel="noopener noreferrer">${t('Open on {p}', { p: esc(v.provider) })}</a>` : ''}
    <div class="row" style="margin-top:12px">
      ${r.status === 'published' && !open ? `<button class="btn" data-strat-revise="${r.id}">${ico('edit')} ${t('Suggest a change')}</button>` : ''}
      ${mineRev && ['draft', 'changes_requested'].includes(r.status) ? `<button class="btn" data-strat-edit="${r.id}">${ico('edit')} ${t('Edit')}</button><button class="btn primary" data-strat-submit="${r.id}">${t('Submit for review')}</button>` : ''}
      ${mineRev && r.status === 'pending' ? `<button class="btn ghost" data-strat-withdraw="${r.id}">${t('Take back')}</button>` : ''}
      ${mineRev && r.status === 'draft' ? `<button class="btn ghost" data-strat-del="${r.id}">${t('Delete draft')}</button>` : ''}
      ${staff && r.status === 'published' ? `<button class="btn ghost" data-strat-archive="${st.id}">${t('Archive')}</button>` : ''}</div>
    ${staff && r.status === 'pending' ? `<div class="card pad" style="margin-top:12px"><b>${t('Review')}</b>
      <label>${t('What needs to change (required to ask for changes)')}<textarea id="strat-note" rows="2"></textarea></label>
      <div class="row"><button class="btn primary" data-strat-approve="${r.id}">${ico('check')} ${t('Publish')}</button><button class="btn" data-strat-changes="${r.id}">${t('Ask for changes')}</button></div></div>` : ''}
    ${staff && r.status === 'published' && s ? `<div class="card pad" style="margin-top:12px"><b>${t('Use in this season’s plan')}</b>
      <p class="muted">${t('Copies the team into the member’s plan for a Gym Leader. Only pairs the member owns are added (at most 3).')}</p>
      <div class="row"><select id="apply-leader">${s.leaders.map(l => `<option ${l.name === r.boss ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>
      <select id="apply-member">${S.profiles.map(p => `<option value="${p.id}">${esc(nameOf(p))}</option>`).join('')}</select>
      <button class="btn" data-strat-apply="${r.id}">${t('Apply')}</button></div></div>` : ''}</section>`;
}

function stratEditor() {
  const e = stratEdit, st = e.strategy_id && stratById(e.strategy_id);
  return `<form class="card pad form" id="strat-form"><h2 class="title">${e.id ? t('Edit strategy') : e.strategy_id ? t('Suggest a change') : t('New strategy')}</h2>
    ${e.review_note ? `<p class="notice">${ico('note')} ${esc(e.review_note)}</p>` : ''}
    <div class="grid3"><label>${t('Title')}<input name="title" value="${esc(e.title)}" required></label>
      <label>${t('Mode')}<select name="mode" ${st ? 'disabled' : ''}>${STRAT_MODES.map(m => `<option ${(st?.mode || e.mode) === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label>${t('Weakness of the boss')}<select name="weakness"><option value="">—</option>${TYPES.map(ty => `<option value="${ty}" ${e.weakness === ty ? 'selected' : ''}>${t(ty)}</option>`).join('')}</select></label></div>
    <div class="grid3"><label>${t('Boss')}<input name="boss" value="${esc(e.boss)}"></label><label>${t('Season or version')}<input name="season_label" value="${esc(e.season_label)}"></label>
      <label>${t('Video link')}<input name="video_url" type="url" value="${esc(e.video_url)}" placeholder="https://"></label></div>
    <label>${t('Conditions')}<textarea name="conditions" rows="2">${esc(e.conditions)}</textarea></label>
    <div class="field"><span>${t('Team (up to 6 sync pairs)')}</span><div class="team">${stratTeam(e.team, null)}${(e.team || []).map((x, i) => `<button type="button" class="x" data-strat-drop="${i}" aria-label="${t('Remove')}">${ico('x')}</button>`).join('')}</div>
      ${(e.team || []).length < 6 ? `<div class="search-box"><input id="strat-pair-q" placeholder="${t('Search sync pairs…')}" autocomplete="off"><div class="results" id="strat-pair-results"></div></div>` : ''}</div>
    <label>${t('Grid notes')}<textarea name="grid_note" rows="2">${esc(e.grid_note)}</textarea></label>
    <label>${t('Rotation')}<textarea name="rotation" rows="4">${esc(e.rotation)}</textarea></label>
    <div class="row"><button class="btn" data-save="draft">${t('Save draft')}</button><button class="btn primary" data-save="pending">${t('Submit for review')}</button><button type="button" class="btn ghost" data-strat-cancel>${t('Cancel')}</button><p class="form-err" id="strat-err"></p></div></form>`;
}

const stratRefresh = async () => { S.strats = await api.strategies(); hooks.route(); };
const stratFields = f => ({ title: f.title.trim(), boss: f.boss.trim(), weakness: f.weakness || '', season_label: f.season_label.trim(), conditions: f.conditions.trim(), team: stratEdit.team || [],
  grid_note: f.grid_note.trim(), rotation: f.rotation.trim(), video_url: f.video_url.trim() });
const blankStrat = () => ({ mode: 'GvG', title: '', boss: '', weakness: '', season_label: season()?.name || '', conditions: '', team: [], grid_note: '', rotation: '', video_url: '' });
const readStratForm = () => { const f = Object.fromEntries(new FormData($('#strat-form'))); Object.assign(stratEdit, stratFields({ ...stratEdit, ...f })); return f; };

document.addEventListener('input', e => {
  if (e.target.id === 'strat-q') { stratFilter.q = e.target.value; const pos = e.target.selectionStart; hooks.route(); const el = $('#strat-q'); el?.focus(); el?.setSelectionRange(pos, pos); }
  if (e.target.id === 'strat-pair-q') {
    const q = e.target.value.trim().toLowerCase(), have = new Set((stratEdit.team || []).map(x => x.pair_id));
    $('#strat-pair-results').innerHTML = (q ? PAIRS().filter(p => !have.has(p.id) && `${p.trainer} ${p.pokemon}`.toLowerCase().includes(q)).slice(0, 12) : [])
      .map(p => `<button type="button" data-strat-add="${p.id}">${pairIcon(p, 'xs')}<span>${esc(pairName(p))}</span>${typeTag(p.type)}</button>`).join('') || `<p class="muted">${t('No sync pair found.')}</p>`;
  }
});
document.addEventListener('change', e => { const k = e.target.dataset?.stratF; if (k) { stratFilter[k] = e.target.value; hooks.route(); } });
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-strat-open],[data-strat-new],[data-strat-view],[data-strat-close],[data-strat-cancel],[data-strat-edit],[data-strat-revise],[data-strat-submit],[data-strat-withdraw],[data-strat-del],[data-strat-archive],[data-strat-approve],[data-strat-changes],[data-strat-apply],[data-strat-add],[data-strat-drop],[data-save]');
  if (!el) return;
  const d = el.dataset, rev = id => S.strats.revisions.find(x => x.id === +id);
  if (d.stratOpen) { stratOpen = +d.stratOpen; stratEdit = null; hooks.route(); window.scrollTo({ top: 0 }); }
  else if ('stratNew' in d) { stratEdit = blankStrat(); stratOpen = null; hooks.route(); }
  else if (d.stratView) { stratView = d.stratView; hooks.route(); }
  else if ('stratClose' in d) { stratOpen = null; hooks.route(); }
  else if ('stratCancel' in d) { stratEdit = null; hooks.route(); }
  else if (d.stratEdit) { stratEdit = { ...rev(d.stratEdit), team: (rev(d.stratEdit).team || []).map(x => ({ ...x })) }; hooks.route(); }
  else if (d.stratRevise) {   // a new revision starts as a copy of the published one
    const r = rev(d.stratRevise);
    stratEdit = { ...r, id: null, strategy_id: r.strategy_id, review_note: '', team: (r.team || []).map(x => ({ ...x })) }; hooks.route();
  }
  else if (d.stratAdd) { readStratForm(); stratEdit.team.push({ pair_id: d.stratAdd }); hooks.route(); }
  else if (d.stratDrop !== undefined) { readStratForm(); stratEdit.team.splice(+d.stratDrop, 1); hooks.route(); }
  else if (d.save) {
    e.preventDefault();
    const f = readStratForm(), body = { ...stratFields({ ...stratEdit, ...f }), status: d.save };
    if (!body.title) { $('#strat-err').textContent = t('Give it a title.'); return; }
    const done = stratEdit.id ? await act(() => api.saveRevision(stratEdit.id, body), t('Saved.'))
      : stratEdit.strategy_id ? await act(() => api.addRevision(stratEdit.strategy_id, body), t('Saved.'))
      : await act(() => api.createStrategy(f.mode || stratEdit.mode, S.me, body), t('Saved.'));
    if (done) { stratEdit = null; stratView = 'mine'; await stratRefresh(); }
  }
  else if (d.stratSubmit) { if (await act(() => api.saveRevision(+d.stratSubmit, { status: 'pending' }), t('Submitted for review.'))) await stratRefresh(); }
  else if (d.stratWithdraw) { if (await act(() => api.saveRevision(+d.stratWithdraw, { status: 'draft' }), t('Taken back.'))) await stratRefresh(); }
  else if (d.stratDel) { if (confirm(t('Delete this draft?')) && await act(() => api.deleteRevision(+d.stratDel), t('Draft deleted.'))) { stratOpen = null; await stratRefresh(); } }
  else if (d.stratArchive) { if (confirm(t('Archive this strategy? It leaves the library.')) && await act(() => api.archiveStrategy(+d.stratArchive, true), t('Archived.'))) { stratOpen = null; await stratRefresh(); } }
  else if (d.stratApprove) { if (await act(() => api.saveRevision(+d.stratApprove, { status: 'published', review_note: ($('#strat-note')?.value || '').trim() }), t('Published.'))) { stratView = 'library'; await stratRefresh(); } }
  else if (d.stratChanges) { if (await act(() => api.saveRevision(+d.stratChanges, { status: 'changes_requested', review_note: ($('#strat-note')?.value || '').trim() }), t('Sent back to the author.'))) await stratRefresh(); }
  else if (d.stratApply) {
    const r = rev(d.stratApply), uid = $('#apply-member').value, leader = $('#apply-leader').value;
    const mine = (r.team || []).filter(x => ownedPair(uid, x.pair_id)).map(x => x.pair_id), team = mine.slice(0, 3);
    const lack = (r.team || []).filter(x => !ownedPair(uid, x.pair_id)).map(x => pairName(pairById(x.pair_id)));
    if (!team.length) { toast(t('{n} owns none of these pairs.', { n: nameOf(profile(uid)) }), true); return; }
    const note = `${t('From strategy')}: ${r.title} (r${r.rev_no})`;
    if (!confirm(`${t('Put {k} pairs in the plan of {n} for {l}?', { k: team.length, n: nameOf(profile(uid)), l: leader })}${lack.length ? `\n${t('Not owned, left out: {p}', { p: lack.join(', ') })}` : ''}${mine.length > 3 ? `\n${t('Only the first 3 owned pairs fit in a team.')}` : ''}`)) return;
    if (await act(() => api.saveAssignment({ season_id: S.sid, leader, user_id: uid, team, note, strategy_rev: r.id, updated_by: S.me }), t('Plan updated.'))) { S.asg = await api.assignments(S.sid); }
  }
});

