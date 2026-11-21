// Page module (split out of main.js). Registers its own listeners when imported.
import { $, esc, fmtD, act, api, S, isStaff, hooks } from '../core.js';
import { ico } from '../icons.js';
import { t } from '../i18n.js';

// ═══════════════════════════════════════════════════════════════
//  RESOURCES: a library of links (tier lists, trackers, sheets, guides)
// ═══════════════════════════════════════════════════════════════
const RES_CATS = [['tier_cn', 'Tier list (China)'], ['tier_spark', 'Spark tier list'], ['tier_jp', 'Tier list (Japan)'], ['tracker', 'Trackers and tools'], ['sheet', 'Sheets'], ['guide', 'Guides'], ['other', 'Other']];
const RES_LANG = { en: 'English', vi: 'Tiếng Việt', zh: '中文', ja: '日本語' };
const resFilter = { cat: '', lang: '', q: '' };
let resEdit = null;   // null = closed, {} = new, {id…} = editing
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const resStatus = r => r.status === 'broken' ? ['bad', 'Link broken'] : r.status === 'ok' ? ['good', 'Works'] : ['', 'Not checked'];
export function renderResources() {
  const f = resFilter, q = f.q.trim().toLowerCase();
  const list = S.resources.filter(r => (!f.cat || r.category === f.cat) && (!f.lang || r.language === f.lang)
    && (!q || `${r.title} ${r.scope} ${r.source} ${r.author}`.toLowerCase().includes(q)));
  const langs = [...new Set(S.resources.map(r => r.language).filter(Boolean))];
  return `<div class="toolbar"><h1>${t('Resources')} <small>${t('{n} links', { n: S.resources.length })}</small></h1>
    ${isStaff() ? `<button class="btn primary" data-res-new>${ico('plus')} ${t('Add a link')}</button>` : ''}</div>
  <p class="muted">${t('Tier lists and tools kept by the gym. They are references: the app does not copy their rankings.')}</p>
  ${resEdit ? resForm() : ''}
  <div class="card pad filters-row"><input id="res-q" placeholder="${t('Search title, role, source…')}" value="${esc(f.q)}">
    <button class="pill ${!f.cat ? 'on' : ''}" data-res-cat="">${t('All')}</button>${RES_CATS.filter(([k]) => S.resources.some(r => r.category === k)).map(([k, l]) => `<button class="pill ${f.cat === k ? 'on' : ''}" data-res-cat="${k}">${t(l)}</button>`).join('')}
    ${langs.length > 1 ? `<select data-res-lang><option value="">${t('Any language')}</option>${langs.map(l => `<option value="${l}" ${f.lang === l ? 'selected' : ''}>${esc(RES_LANG[l] || l)}</option>`).join('')}</select>` : ''}</div>
  <div class="res-grid">${list.map(r => { const [cls, label] = resStatus(r);
    return `<article class="card pad res"><div class="res-top"><span class="badge">${t(RES_CATS.find(c => c[0] === r.category)?.[1] || r.category)}</span><span class="badge ${cls}">${t(label)}</span></div>
      <h3><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a></h3>
      <small class="muted">${esc(hostOf(r.url))}${r.language ? ` · ${esc(RES_LANG[r.language] || r.language)}` : ''}</small>
      ${r.scope ? `<p>${esc(r.scope)}</p>` : ''}
      <small class="muted">${[r.source && `${t('Source')}: ${esc(r.source)}`, r.author && `${t('Author')}: ${esc(r.author)}`, r.version && `${t('Version')}: ${esc(r.version)}`, r.effective && `${t('Valid from')} ${fmtD(r.effective)}`, r.checked_at && `${t('Checked')} ${fmtD(r.checked_at)}`].filter(Boolean).join(' · ')}</small>
      ${r.note ? `<p class="muted">${esc(r.note)}</p>` : ''}
      <div class="row"><a class="btn sm" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${t('Open')}</a>
        ${isStaff() ? `<button class="btn sm ghost" data-res-edit="${r.id}">${t('Edit')}</button><button class="btn sm ghost" data-res-ok="${r.id}">${t('Mark checked')}</button><button class="btn sm ghost" data-res-bad="${r.id}">${t('Mark broken')}</button><button class="btn sm ghost" data-res-del="${r.id}" aria-label="${t('Delete')}">${ico('x')}</button>` : ''}</div></article>`;
  }).join('') || `<p class="muted">${t('No links match.')}</p>`}</div>`;
}
function resForm() {
  const r = resEdit, o = (k, d = '') => esc(r[k] ?? d);
  return `<form class="card pad form" id="res-form"><h2 class="title">${r.id ? t('Edit link') : t('Add a link')}</h2>
    <div class="grid3"><label>${t('Title')}<input name="title" value="${o('title')}" required></label>
      <label>${t('Category')}<select name="category">${RES_CATS.map(([k, l]) => `<option value="${k}" ${(r.category || 'other') === k ? 'selected' : ''}>${t(l)}</option>`).join('')}</select></label>
      <label>${t('Language')}<input name="language" value="${o('language')}" placeholder="en, vi, zh, ja"></label></div>
    <label>URL<input name="url" type="url" value="${o('url')}" placeholder="https://" required></label>
    <div class="grid3"><label>${t('Role or mode')}<input name="scope" value="${o('scope')}"></label><label>${t('Source')}<input name="source" value="${o('source')}"></label><label>${t('Author')}<input name="author" value="${o('author')}"></label></div>
    <div class="grid3"><label>${t('Version')}<input name="version" value="${o('version')}"></label><label>${t('Valid from')}<input name="effective" type="date" value="${o('effective')}"></label></div>
    <label>${t('Note')}<input name="note" value="${o('note')}"></label>
    <div class="row"><button class="btn primary">${t('Save')}</button><button type="button" class="btn ghost" data-res-close>${t('Cancel')}</button><p class="form-err" id="res-err"></p></div></form>`;
}
document.addEventListener('input', e => { if (e.target.id === 'res-q') { resFilter.q = e.target.value; const pos = e.target.selectionStart; hooks.route(); const el = $('#res-q'); el?.focus(); el?.setSelectionRange(pos, pos); } });
document.addEventListener('change', e => { if (e.target.dataset?.resLang !== undefined) { resFilter.lang = e.target.value; hooks.route(); } });
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-res-cat],[data-res-new],[data-res-edit],[data-res-close],[data-res-ok],[data-res-bad],[data-res-del]');
  if (!el) return;
  const d = el.dataset, byId = id => S.resources.find(x => x.id === +id);
  const refresh = async () => { S.resources = await api.resources(); hooks.route(); };
  if ('resCat' in d) { resFilter.cat = d.resCat; hooks.route(); }
  else if ('resNew' in d) { resEdit = {}; hooks.route(); }
  else if (d.resEdit) { resEdit = { ...byId(d.resEdit) }; hooks.route(); window.scrollTo({ top: 0 }); }
  else if ('resClose' in d) { resEdit = null; hooks.route(); }
  else if (d.resOk || d.resBad) {
    const r = byId(d.resOk || d.resBad);
    if (await act(() => api.saveResource({ id: r.id, status: d.resOk ? 'ok' : 'broken', checked_at: new Date().toISOString() }), t('Saved.'))) await refresh();
  } else if (d.resDel) {
    const r = byId(d.resDel);
    if (confirm(t('Delete the link “{t}”?', { t: r.title })) && await act(() => api.deleteResource(r.id), t('Link deleted.'))) await refresh();
  }
});
document.addEventListener('submit', async e => {
  if (e.target.id !== 'res-form') return;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const row = { ...f, title: f.title.trim(), url: f.url.trim(), effective: f.effective || null, created_by: resEdit.id ? undefined : S.me };
  if (resEdit.id) row.id = resEdit.id;
  Object.keys(row).forEach(k => row[k] === undefined && delete row[k]);
  if (await act(() => api.saveResource(row), t('Saved.'))) { resEdit = null; S.resources = await api.resources(); hooks.route(); }
});

