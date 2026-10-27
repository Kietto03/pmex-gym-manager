// The D.C. and GvG libraries: every clear listed in the community sheets, filtered by the weakness of the stage.
// The data is copied into data/clears.json by tools/sync-clears.mjs.
import { $, esc, fmtN, fmtD, img, pairIcon, typeTag, S, ownedPair } from '../core.js';
import { t } from '../i18n.js';
import { PAIRS, pairName, typeIcon, TYPES, TYPE_COLORS } from '../catalog.js';
import { resolveUnit } from '../ranking.js';

const F = { dc: { q: '', type: '', mode: '3v3', can: false, sort: 'score' }, gvg: { q: '', type: '', season: '', tickets: '', can: false, sort: 'season' } };
const resolved = new Map();
const unitPair = u => { const k = u.name; if (!resolved.has(k)) resolved.set(k, resolveUnit(u, PAIRS())); return resolved.get(k); };
// A video link → a thumbnail (YouTube only; other sites just get the Watch button)
const thumb = url => { const m = /(?:youtu\.be\/|[?&]v=|shorts\/)([\w-]{11})/.exec(url || ''); return m ? `https://img.youtube.com/vi/${m[1]}/mqdefault.jpg` : ''; };
const seasonNo = s => +(/SS(\d+)/.exec(s)?.[1] || 0);

function unitHtml(u) {
  const r = unitPair(u), own = r && ownedPair(S.me, r.pair.id);
  return `<span class="cl-u ${r?.approx ? 'approx' : ''} ${own ? 'own' : ''}" title="${esc(r ? `${pairName(r.pair)}${r.approx ? ` — ${t('best guess')}` : ''}` : u.name)}">
    ${r ? pairIcon(r.pair, 'sm', u.ex) : `<span class="cl-ph">${esc(u.name[0] || '?')}</span>`}
    <b>${esc(u.name)}</b><small class="muted">${u.level ? `${u.level}${u.ex ? ' EX' : ''}${u.exr ? ' R' : ''}` : ''}${own ? ` · ✓` : ''}</small></span>`;
}
const canBuild = x => x.units.every(u => { const r = unitPair(u); return r && ownedPair(S.me, r.pair.id); });
function card(x, kind) {
  const th = thumb(x.video);
  return `<article class="card cl-card" style="--tc:${TYPE_COLORS[x.type] || '#888'}">
    <header>${typeTag(x.type)}<b class="cl-score">${fmtN(x.score)}</b><span class="cl-meta">${kind === 'dc' ? esc(x.mode) : `${esc(x.season)} · ${esc(x.round)}${x.tickets ? ` · ×${x.tickets}` : ''}`}</span></header>
    ${kind === 'gvg' && x.rules ? `<div class="chips-l">${x.rules.split(',').map(r => `<span class="chip">${esc(r.trim())}</span>`).join('')}</div>` : ''}
    <div class="cl-team">${x.units.map(unitHtml).join('')}</div>
    ${x.video ? `<a class="cl-video ${th ? '' : 'plain'}" href="${esc(x.video)}" target="_blank" rel="noopener noreferrer">${th ? `<img src="${esc(th)}" alt="" loading="lazy"><span class="play">▶</span>` : ''}<span class="btn sm">${t('Watch')}</span></a>` : `<small class="muted">${t('No video')}</small>`}
  </article>`;
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
  <div class="card pad filters-row"><input data-cl-q="${kind}" placeholder="${t('Search a pair or a rule…')}" value="${esc(f.q)}" autocomplete="off">
    ${kind === 'dc' ? opts('mode', f.mode, [['3v3', '3v3'], ['3v1', '3v1']], 'All modes') : `${opts('season', f.season, seasons.map(x => [x, x]), 'All seasons')}${opts('tickets', f.tickets, tickets.map(x => [x, `${x} ${t('tickets')}`]), 'Any tickets')}`}
    <select data-cl="${kind}:sort">${(kind === 'dc' ? [['score', 'Highest score'], ['type', 'By type']] : [['season', 'Newest season'], ['score', 'Highest score'], ['type', 'By type']]).map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${t(l)}</option>`).join('')}</select>
    <label class="chk"><input type="checkbox" data-cl-can="${kind}" ${f.can ? 'checked' : ''}> ${t('I own all three')}</label></div>
  <div id="cl-results">${results(kind)}</div>`;
}
const redraw = kind => { const r = $('#cl-results'); if (r) r.innerHTML = results(kind); };
document.addEventListener('input', e => { const k = e.target.dataset?.clQ; if (k) { F[k].q = e.target.value; redraw(k); } });
document.addEventListener('change', e => {
  const sel = e.target.dataset?.cl, can = e.target.dataset?.clCan;
  if (sel) { const [k, key] = sel.split(':'); F[k][key] = e.target.value; redraw(k); }
  if (can) { F[can].can = e.target.checked; redraw(can); }
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-cl-type]'); if (!b) return;
  const [k, ty] = b.dataset.clType.split(':'); F[k].type = ty;
  document.querySelectorAll('.cl-types .tchip').forEach(x => x.classList.toggle('on', x === b)); redraw(k);
});
