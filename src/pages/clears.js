// The D.C. and GvG libraries: every clear listed in the community sheets, filtered by the weakness of the stage.
// The data is copied into data/clears.json by tools/sync-clears.mjs.
import { $, esc, fmtN, fmtD, img, pairIcon, typeTag, S, ownedPair } from '../core.js';
import { ico } from '../icons.js';
import { t } from '../i18n.js';
import { PAIRS, pairName, typeIcon, TYPES, TYPE_COLORS } from '../catalog.js';
import { resolveUnit, metaByType, metaPairs } from '../ranking.js';

const F = { dc: { q: '', type: '', mode: '3v3', can: false, sort: 'score' }, gvg: { q: '', type: '', season: '', tickets: '', can: false, sort: 'season' } };
let metaAll = false;   // the meta board shows the strongest 8 types until asked for all
const META_ROWS = 8;
const resolved = new Map();
const unitPair = u => { const k = u.name; if (!resolved.has(k)) resolved.set(k, resolveUnit(u, PAIRS())); return resolved.get(k); };
// A video is only a link (no picture cut from it): the site it opens is named so the link can be trusted at a glance
const videoHost = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const seasonNo = s => +(/SS(\d+)/.exec(s)?.[1] || 0);

function unitHtml(u) {
  const r = unitPair(u), own = r && ownedPair(S.me, r.pair.id);
  return `<span class="cl-u ${r?.approx ? 'approx' : ''} ${own ? 'own' : ''}" title="${esc(r ? `${pairName(r.pair)}${r.approx ? ` — ${t('best guess')}` : ''}` : u.name)}">
    ${r ? pairIcon(r.pair, 'sm', u.ex) : `<span class="cl-ph">${esc(u.name[0] || '?')}</span>`}
    <b>${esc(u.name)}</b><small class="muted">${u.level ? `${u.level}${u.ex ? ' EX' : ''}${u.exr ? ' R' : ''}` : ''}${own ? ` · ✓` : ''}</small></span>`;
}
const canBuild = x => x.units.every(u => { const r = unitPair(u); return r && ownedPair(S.me, r.pair.id); });
function card(x, kind) {
  return `<article class="card cl-card" style="--tc:${TYPE_COLORS[x.type] || '#888'}">
    <header>${typeTag(x.type)}<b class="cl-score">${fmtN(x.score)}</b><span class="cl-meta">${kind === 'dc' ? esc(x.mode) : `${esc(x.season)} · ${esc(x.round)}${x.tickets ? ` · ×${x.tickets}` : ''}`}</span></header>
    ${kind === 'gvg' && x.rules ? `<div class="chips-l">${x.rules.split(',').map(r => `<span class="chip">${esc(r.trim())}</span>`).join('')}</div>` : ''}
    <div class="cl-team">${x.units.map(unitHtml).join('')}</div>
    <footer>${x.video ? `<a class="cl-watch" href="${esc(x.video)}" target="_blank" rel="noopener noreferrer">${ico('play')} ${t('Watch the video')} <small>${esc(videoHost(x.video))}</small></a>` : `<small class="muted">${t('No video')}</small>`}</footer>
  </article>`;
}
// ── Meta: which weakness type scores highest, with which team, and which pairs turn up in the best teams (D.C. only) ──
function metaBoard() {
  const f = F.dc, { rows, max } = metaByType(S.clears?.dc || [], { mode: f.mode, top: 5 });
  if (!rows.length) return '';
  const pairs = metaPairs(rows, u => unitPair(u)?.pair.id || '', 12);
  return `<details class="card pad cl-metabox" open><summary><h2>${t('Meta by weakness type')} <small>${t('best {m} clears · the top 5 of each type', { m: f.mode || t('all') })}</small></h2></summary>
    <div class="meta-rows" role="list">${(metaAll ? rows : rows.slice(0, META_ROWS)).map(r => `<button class="meta-row ${f.type === r.type ? 'on' : ''}" role="listitem" data-cl-type="dc:${r.type}" style="--tc:${TYPE_COLORS[r.type] || '#888'}" title="${t('Show the {n} clears of this type', { n: r.count })}">
      <span class="meta-type">${img(typeIcon(r.type), 'ti', r.type)}<b>${esc(t(r.type))}</b></span>
      <span class="meta-bar"><i style="width:${Math.max(4, r.best.score / max * 100)}%"></i></span>
      <b class="meta-score">${fmtN(r.best.score)}</b>
      <span class="meta-team">${r.best.units.map(u => { const p = unitPair(u); return `<span title="${esc(p ? pairName(p.pair) : u.name)}">${p ? pairIcon(p.pair, 'xs', u.ex) : `<span class="cl-ph sm">${esc(u.name[0] || '?')}</span>`}</span>`; }).join('')}</span>
      <small class="meta-n">${t('{n} clears', { n: r.count })}</small></button>`).join('')}</div>
    ${rows.length > META_ROWS ? `<button type="button" class="btn sm ghost meta-more" data-cl-meta-more>${metaAll ? t('Show the strongest {n} only', { n: META_ROWS }) : t('Show all {n} types', { n: rows.length })}</button>` : ''}
    ${pairs.length ? `<h3 class="meta-h">${t('Pairs in the best teams')}</h3><div class="meta-pairs">${pairs.map(p => { const r = unitPair(p.unit); return `<span class="meta-pair" title="${esc(`${pairName(r.pair)} — ${t('in {n} of the best teams, across {k} types', { n: p.count, k: p.types })}`)}">${pairIcon(r.pair, 'xs', p.unit.ex)}<span>${esc(r.pair.trainer.replace(/\\s*\\(.*\\)/, ''))}</span><b>×${p.count}</b></span>`; }).join('')}</div>` : ''}</details>`;
}
function list(kind) {
  const f = F[kind], q = f.q.trim().toLowerCase(), all = S.clears?.[kind] || [];
  const rows = all.filter(x => (!f.type || x.type === f.type) && (kind === 'dc' ? (!f.mode || x.mode === f.mode) : ((!f.season || x.season === f.season) && (!f.tickets || String(x.tickets) === f.tickets)))
    && (!q || x.units.some(u => u.name.toLowerCase().includes(q) || (unitPair(u) && pairName(unitPair(u).pair).toLowerCase().includes(q))) || (x.rules || '').toLowerCase().includes(q)) && (!f.can || canBuild(x)));
  const by = { score: (a, b) => b.score - a.score, season: (a, b) => seasonNo(b.season) - seasonNo(a.season) || b.score - a.score, type: (a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || b.score - a.score };
  return { rows: rows.sort(by[f.sort] || by.score), total: all.length };
}
function results(kind) {
  const { rows, total } = list(kind);
  return `<p class="muted">${t('{n} of {m} clears', { n: rows.length, m: total })}</p><div class="cl-grid">${rows.slice(0, 60).map(x => card(x, kind)).join('') || `<p class="muted">${t('No clear matches.')}</p>`}</div>
    ${rows.length > 60 ? `<p class="muted">${t('Showing the first 60: narrow the filters to see the rest.')}</p>` : ''}`;
}
export function clearsView(kind) {
  const d = S.clears;
  if (!d) return `<p class="muted">${t('The clear library is not available yet.')}</p>`;
  const f = F[kind], all = d[kind] || [], types = TYPES.filter(ty => all.some(x => x.type === ty)), age = Math.floor((Date.now() - Date.parse(d.fetched)) / 864e5);
  const seasons = [...new Set(all.map(x => x.season).filter(Boolean))].sort((a, b) => seasonNo(b) - seasonNo(a)), tickets = [...new Set(all.map(x => x.tickets).filter(Boolean))].sort();
  const opts = (key, val, items, any) => `<select data-cl="${kind}:${key}"><option value="">${t(any)}</option>${items.map(([v, l]) => `<option value="${esc(v)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  return `<p class="muted">${kind === 'dc' ? t('Best D.C. clears of the community, by the weakness of the stage.') : t('GvG clears of the community, by the weakness of the Gym Leader.')} ${t('Source')}: <a href="${esc(d.sources?.[kind])}" target="_blank" rel="noopener noreferrer">${t('community sheet')}</a> · ${t('copied on {d}', { d: fmtD(d.fetched) })}${age > 30 ? ` · <b>${t('may be out of date')}</b>` : ''} · ${t('Pictures are matched by name; a dotted frame is a best guess.')}</p>
  <div class="cl-types"><button class="tchip ${!f.type ? 'on' : ''}" data-cl-type="${kind}:">${t('All')}</button>${types.map(ty => `<button class="tchip ${f.type === ty ? 'on' : ''}" data-cl-type="${kind}:${ty}" style="--tc:${TYPE_COLORS[ty]}" title="${t(ty)}">${img(typeIcon(ty), 'ti', ty)}${esc(t(ty))}</button>`).join('')}</div>
  ${kind === 'dc' ? `<div id="cl-meta">${metaBoard()}</div>` : ''}
  <div class="card pad filters-row"><input data-cl-q="${kind}" placeholder="${t('Search a pair or a rule…')}" value="${esc(f.q)}" autocomplete="off">
    ${kind === 'dc' ? opts('mode', f.mode, [['3v3', '3v3'], ['3v1', '3v1']], 'All modes') : `${opts('season', f.season, seasons.map(x => [x, x]), 'All seasons')}${opts('tickets', f.tickets, tickets.map(x => [x, `${x} ${t('tickets')}`]), 'Any tickets')}`}
    <select data-cl="${kind}:sort">${(kind === 'dc' ? [['score', 'Highest score'], ['type', 'By type']] : [['season', 'Newest season'], ['score', 'Highest score'], ['type', 'By type']]).map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${t(l)}</option>`).join('')}</select>
    <label class="chk"><input type="checkbox" data-cl-can="${kind}" ${f.can ? 'checked' : ''}> ${t('I own all three')}</label></div>
  <div id="cl-results">${results(kind)}</div>`;
}
const redraw = kind => { const r = $('#cl-results'); if (r) r.innerHTML = results(kind); const m = $('#cl-meta'); if (m && kind === 'dc') { const open = m.querySelector('details')?.open ?? true; m.innerHTML = metaBoard(); const d = m.querySelector('details'); if (d) d.open = open; } };
document.addEventListener('input', e => { const k = e.target.dataset?.clQ; if (k) { F[k].q = e.target.value; redraw(k); } });
document.addEventListener('change', e => {
  const sel = e.target.dataset?.cl, can = e.target.dataset?.clCan;
  if (sel) { const [k, key] = sel.split(':'); F[k][key] = e.target.value; redraw(k); }
  if (can) { F[can].can = e.target.checked; redraw(can); }
});
document.addEventListener('click', e => {
  if (e.target.closest('[data-cl-meta-more]')) { metaAll = !metaAll; redraw('dc'); return; }
  const b = e.target.closest('[data-cl-type]'); if (!b) return;
  const [k, ty] = b.dataset.clType.split(':'); F[k].type = ty;
  document.querySelectorAll('.cl-types .tchip').forEach(x => x.classList.toggle('on', x.dataset.clType === b.dataset.clType)); redraw(k);
  if (b.classList.contains('meta-row')) $('#cl-results')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
});
