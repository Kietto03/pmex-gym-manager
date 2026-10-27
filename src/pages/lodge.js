// Page module (split out of main.js). Registers its own listeners when imported.
import { $, esc, fmtD, img, S, hooks } from '../core.js';
import { t } from '../i18n.js';

// ═══════════════════════════════════════════════════════════════
//  TRAINER LODGE: which topics each Sync Pair likes (static lookup, copied from Serebii with the date)
// ═══════════════════════════════════════════════════════════════
const lodgeState = { mode: 'trainer', q: '', trainer: '', cat: '' };
const LODGE_PTS = ['10', '7', '5'];
async function loadLodge() {
  if (S.lodge) return;
  try { const r = await fetch('data/lodge.json'); if (r.ok) S.lodge = await r.json(); } catch { /* shown as unavailable */ }
}
export function renderLodge() {
  const d = S.lodge, ls = lodgeState;
  if (!d) { loadLodge().then(() => { if (S.lodge && location.hash.startsWith('#/lodge')) hooks.route(); }); return `<div class="toolbar"><h1>${t('Trainer Lodge')}</h1></div><p class="muted">${t('Loading…')}</p>`; }
  const age = Math.floor((Date.now() - Date.parse(d.fetched)) / 864e5);
  const q = ls.q.trim().toLowerCase();
  const cats = [...new Set(d.trainers.flatMap(x => Object.values(x.topics).flat().map(y => y[1])).filter(Boolean))].sort();
  const head = `<div class="toolbar"><h1>${t('Trainer Lodge')} <small>${t('{n} sync pairs', { n: d.trainers.length })}</small></h1>
    <div class="seg">${[['trainer', 'By trainer'], ['topic', 'By topic']].map(([k, l]) => `<button class="${ls.mode === k ? 'on' : ''}" data-lodge-mode="${k}">${t(l)}</button>`).join('')}</div></div>
  <p class="muted">${t('Topics each Sync Pair likes: 10 points is the best, 5 the least. The daily Hot Topic is not listed here.')}
    ${t('Source')}: <a href="${esc(d.source)}" target="_blank" rel="noopener noreferrer">Serebii</a> · ${t('copied on {d}', { d: fmtD(d.fetched) })}${age > 90 ? ` · <b>${t('may be out of date')}</b>` : ''}</p>
  <div class="card pad filters-row"><input id="lodge-q" placeholder="${ls.mode === 'trainer' ? t('Search a trainer…') : t('Search a topic, e.g. Ghost types…')}" value="${esc(ls.q)}">
    <select data-lodge-cat><option value="">${t('All categories')}</option>${cats.map(c => `<option ${ls.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>`;
  const topicLine = (x, cat) => !cat || x[1] === cat;
  if (ls.mode === 'topic') {
    const hits = new Map();   // topic → { cat, pts: { '10': [names] } }
    if (q.length >= 2) for (const tr of d.trainers) for (const p of LODGE_PTS) for (const [topic, c] of tr.topics[p] || [])
      if (topic.toLowerCase().includes(q) && (!ls.cat || c === ls.cat)) { const h = hits.get(topic) || hits.set(topic, { cat: c, pts: {} }).get(topic); (h.pts[p] ||= []).push(tr.name); }
    const rows = [...hits.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return head + (q.length < 2 ? `<p class="muted">${t('Type at least 2 letters of a topic.')}</p>` : `<div class="card scroll"><table class="table"><thead><tr><th>${t('Topic')}</th>${LODGE_PTS.map(p => `<th>${p} ${t('points')}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(([topic, h]) => `<tr><td><b>${esc(topic)}</b><br><small class="muted">${esc(h.cat)}</small></td>${LODGE_PTS.map(p => `<td>${(h.pts[p] || []).map(esc).join(', ') || '<span class="muted">—</span>'}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="4" class="muted pad">${t('No topic matches.')}</td></tr>`}</tbody></table></div>`);
  }
  const list = d.trainers.filter(x => !q || x.name.toLowerCase().includes(q));
  const cur = d.trainers.find(x => x.id === ls.trainer) || (q && list.length === 1 ? list[0] : null);
  return head + `<div class="lodge-pick">${list.map(x => `<button class="lodge-t ${cur?.id === x.id ? 'on' : ''}" data-lodge-trainer="${x.id}"><img src="${esc(x.icon)}" alt="" loading="lazy" width="48" height="48"><small>${esc(x.name)}</small></button>`).join('') || `<p class="muted">${t('No trainer matches.')}</p>`}</div>
    ${cur ? `<section class="card pad"><h2 class="title"><img src="${esc(cur.icon)}" alt="" width="40" height="40" style="vertical-align:middle"> ${esc(cur.name)}</h2>
      <div class="lodge-cols">${LODGE_PTS.map(p => { const items = cur.topics[p].filter(x => topicLine(x, ls.cat));
        return `<div><h3>${p} ${t('points')} <small class="muted">${items.length}</small></h3>${items.map(([topic, c]) => `<div class="lodge-topic"><span>${esc(topic)}</span><small class="chip">${esc(c)}</small></div>`).join('') || `<p class="muted">—</p>`}</div>`; }).join('')}</div></section>`
      : `<p class="muted">${t('Pick a sync pair to see its topics.')}</p>`}`;
}
document.addEventListener('input', e => { if (e.target.id === 'lodge-q') { lodgeState.q = e.target.value; const pos = e.target.selectionStart; hooks.route(); const el = $('#lodge-q'); el?.focus(); el?.setSelectionRange(pos, pos); } });
document.addEventListener('change', e => { if (e.target.dataset?.lodgeCat !== undefined) { lodgeState.cat = e.target.value; hooks.route(); } });
document.addEventListener('click', e => {
  const m = e.target.closest('[data-lodge-mode]'), tr = e.target.closest('[data-lodge-trainer]');
  if (m) { lodgeState.mode = m.dataset.lodgeMode; lodgeState.q = ''; hooks.route(); }
  if (tr) { lodgeState.trainer = tr.dataset.lodgeTrainer; hooks.route(); }
});

