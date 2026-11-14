// Page module (split out of main.js). Registers its own listeners when imported.
import { $, esc, fmtD, img, S, hooks } from '../core.js';
import { t } from '../i18n.js';
import { PAIRS } from '../catalog.js';

const REGIONS = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Paldea', 'Pasio'];
const CAT_ORDER = ['Pokémon', 'Places', 'Hobbies', 'Friends', 'Fashion', 'Items', 'Other'];
const CAT_COLOR = { 'Pokémon': '#e0584f', Places: '#2f9e6b', Hobbies: '#e08a2c', Friends: '#d2569a', Fashion: '#8a5bd6', Items: '#2f86d6', Other: '#7a8494' };
const catOf = c => CAT_ORDER.includes(c) ? c : 'Other';
const baseName = n => String(n || '').toLowerCase().replace(/\s*\(.*\)/, '').trim();
function regionOf(name) { const k = baseName(name); return PAIRS().find(p => baseName(p.trainerName) === k && p.region)?.region || ''; }

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
    <div class="seg">${[['trainer', 'By trainer'], ['region', 'By region']].map(([k, l]) => `<button class="${ls.mode === k ? 'on' : ''}" data-lodge-mode="${k}">${t(l)}</button>`).join('')}</div></div>
  <p class="muted">${t('Topics each Sync Pair likes: 10 points is the best, 5 the least. The daily Hot Topic is not listed here.')}
    ${t('Source')}: <a href="${esc(d.source)}" target="_blank" rel="noopener noreferrer">Serebii</a> · ${t('copied on {d}', { d: fmtD(d.fetched) })}${age > 90 ? ` · <b>${t('may be out of date')}</b>` : ''}</p>
  <div class="card pad filters-row"><input id="lodge-q" placeholder="${t('Search a trainer…')}" value="${esc(ls.q)}">
    <select data-lodge-cat><option value="">${t('All categories')}</option>${cats.map(c => `<option ${ls.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>`;
  const topicLine = (x, cat) => !cat || x[1] === cat;
  const list = d.trainers.filter(x => !q || x.name.toLowerCase().includes(q));
  const cur = d.trainers.find(x => x.id === ls.trainer) || (q && list.length === 1 ? list[0] : null);
  const btn = x => `<button class="lodge-t ${cur?.id === x.id ? 'on' : ''}" data-lodge-trainer="${x.id}"><img src="${esc(x.icon)}" alt="" loading="lazy" width="48" height="48"><small>${esc(x.name)}</small></button>`;
  let picker;
  if (ls.mode === 'region') {
    const groups = REGIONS.map(r => [r, list.filter(x => regionOf(x.name) === r)]);
    const rest = list.filter(x => !REGIONS.includes(regionOf(x.name)));
    if (rest.length) groups.push(['Other', rest]);
    picker = groups.filter(([, l]) => l.length).map(([r, l]) => `<h3 class="lodge-reg">${t(r)} <small class="muted">${l.length}</small></h3><div class="lodge-pick">${l.map(btn).join('')}</div>`).join('');
  } else picker = `<div class="lodge-pick">${list.map(btn).join('')}</div>`;
  if (!list.length) picker = `<p class="muted">${t('No trainer matches.')}</p>`;
  return head + picker + (cur ? `<section class="card pad"><h2 class="title"><img src="${esc(cur.icon)}" alt="" width="40" height="40" style="vertical-align:middle"> ${esc(cur.name)}</h2>
      <div class="lodge-cols">${LODGE_PTS.map(p => { const items = cur.topics[p].filter(x => topicLine(x, ls.cat)).sort((a, b) => CAT_ORDER.indexOf(catOf(a[1])) - CAT_ORDER.indexOf(catOf(b[1])));
        return `<div><h3>${p} ${t('points')} <small class="muted">${items.length}</small></h3>${items.map(([topic, c]) => `<div class="lodge-topic" style="--c:${CAT_COLOR[catOf(c)]}"><span>${esc(topic)}</span><small class="chip">${esc(c)}</small></div>`).join('') || `<p class="muted">—</p>`}</div>`; }).join('')}</div></section>`
      : `<p class="muted">${t('Pick a sync pair to see its topics.')}</p>`);
}
document.addEventListener('input', e => { if (e.target.id === 'lodge-q') { lodgeState.q = e.target.value; const pos = e.target.selectionStart; hooks.route(); const el = $('#lodge-q'); el?.focus(); el?.setSelectionRange(pos, pos); } });
document.addEventListener('change', e => { if (e.target.dataset?.lodgeCat !== undefined) { lodgeState.cat = e.target.value; hooks.route(); } });
document.addEventListener('click', e => {
  const m = e.target.closest('[data-lodge-mode]'), tr = e.target.closest('[data-lodge-trainer]');
  if (m) { lodgeState.mode = m.dataset.lodgeMode; lodgeState.q = ''; hooks.route(); }
  if (tr) { lodgeState.trainer = tr.dataset.lodgeTrainer; hooks.route(); }
});

