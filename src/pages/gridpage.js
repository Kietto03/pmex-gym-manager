// Page module (split out of main.js). Registers its own listeners when imported.
import { $, esc, fmtN, img, pairIcon, typeTag, act, api, S, profile, nameOf, ownedPair, hooks } from '../core.js';
import { ico } from '../icons.js';
import { t } from '../i18n.js';
import { indexGrid, whyNot, canRemove, validate, totals, levelNeeded, otherReqs, gridHash, hexXY, COLORS } from '../grid.js';
import { PAIRS, loadPairDetail, dexIdOf, pairById, pairName } from '../catalog.js';

// ═══════════════════════════════════════════════════════════════
//  SYNC GRID: moves and passives of a pair, and a grid builder (rules in grid.js)
// ═══════════════════════════════════════════════════════════════
const G = { pairId: '', detail: null, err: '', ix: null, active: new Set(), moveLevel: 5, energyCap: null, sel: null, tab: 'grid', buildId: null,
  name: '', purpose: '', visibility: 'private', saved: null, hash: '', msg: '' };
const gridZoom = () => { try { return +localStorage.getItem('gym-grid-zoom') || 1; } catch { return 1; } };
const BUILD_WHY = { 'not-adjacent': 'next to no active tile', 'move-level': 'needs a higher move level', energy: 'over the energy limit', unknown: 'tile no longer exists' };
let gridQuery = '';

export function renderGrid(pairId = '', buildId = '') {
  if (!pairId) return gridHome();
  if (G.pairId !== pairId || (buildId && G.buildId !== +buildId)) {
    Object.assign(G, { pairId, detail: null, err: '', ix: null, active: new Set(), sel: null, tab: 'grid', buildId: null, name: '', purpose: '', visibility: 'private', saved: null, msg: '', moveLevel: 5, energyCap: null });
    const mine = ownedPair(S.me, pairId);
    if (mine) G.moveLevel = Math.min(5, mine.level || 5);
    const b = buildId && S.builds.find(x => x.id === +buildId);
    if (b) Object.assign(G, { buildId: b.id, name: b.name, purpose: b.purpose, visibility: b.visibility, moveLevel: b.move_level, energyCap: b.energy_cap, active: new Set(b.nodes), saved: b });
    const dexId = pairById(pairId) && dexIdOf(pairById(pairId));
    (dexId ? loadPairDetail(dexId) : Promise.reject(new Error('unmapped'))).then(d => { G.detail = d; G.ix = indexGrid(d.grid || []); G.hash = gridHash(d.grid || []); if (location.hash.startsWith('#/grid/')) hooks.route(); })
      .catch(() => { G.err = 'load'; if (location.hash.startsWith('#/grid/')) hooks.route(); });
  }
  const p = pairById(pairId);
  const head = `<div class="toolbar"><h1>${p ? esc(pairName(p)) : t('Sync Grid')} <small class="muted">${p ? esc(t(p.type)) : ''}</small></h1><a class="btn ghost" href="#/grid">${ico('left')} ${t('All builds')}</a></div>`;
  if (G.err) return head + `<div class="card pad"><p class="muted">${t('The grid of this pair could not be loaded. Try again later.')}</p></div>`;
  if (!G.detail) return head + `<p class="muted">${t('Loading…')}</p>`;
  if (!G.ix.grid.length) return head + `<div class="card pad"><p class="muted">${t('This pair has no grid in the datamine yet.')}</p>${pairInfo()}</div>`;
  return `${head}<div class="seg" style="margin-bottom:10px">${[['grid', 'Grid'], ['info', 'Moves and passives']].map(([k, l]) => `<button class="${G.tab === k ? 'on' : ''}" data-gtab="${k}">${t(l)}</button>`).join('')}</div>
    ${G.tab === 'info' ? pairInfo() : `<div class="grid-layout"><div class="card pad"><div id="grid-board">${gridBoard()}</div></div><div id="grid-side">${gridSide()}</div></div>`}`;
}

function gridBoard() {
  const size = 17, zoom = gridZoom(), pts = G.ix.grid.map(c => ({ c, ...hexXY(c, size) }));
  const pad = size * 1.6, minX = Math.min(0, ...pts.map(p => p.x)) - pad, maxX = Math.max(0, ...pts.map(p => p.x)) + pad, minY = Math.min(0, ...pts.map(p => p.y)) - pad, maxY = Math.max(0, ...pts.map(p => p.y)) + pad;
  const hex = (x, y, r) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 180 * (60 * i - 30); return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`; }).join(' ');
  const opts = { moveLevel: G.moveLevel, energyCap: G.energyCap };
  return `<div class="grid-tools"><label>${t('Zoom')} <input type="range" min="0.6" max="2.2" step="0.1" value="${zoom}" id="grid-zoom"></label>
    <span class="grid-legend">${Object.entries(COLORS).map(([k, [l, col]]) => `<i style="background:${col}"></i>${t(l)}`).join(' ')}</span></div>
    <div class="grid-scroll"><svg viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" style="width:${(maxX - minX) * zoom * 1.6}px" role="img" aria-label="${t('Sync grid')}">
      <circle cx="0" cy="0" r="${size * .8}" class="g-centre"/>
      ${pts.map(({ c, x, y }) => {
        const on = G.active.has(c.n), why = on ? null : whyNot(G.ix, G.active, c, opts), col = COLORS[c.color]?.[1] || '#999';
        return `<g class="g-tile ${on ? 'on' : why ? 'locked' : 'open'} ${G.sel === c.n ? 'sel' : ''}" data-gtile="${c.n}" tabindex="0" role="button" aria-label="${esc(c.title)}">
          <polygon points="${hex(x, y, size * .92)}" style="--c:${col}"/>${c.energy ? `<text x="${x}" y="${y + 4}" text-anchor="middle">${c.energy}</text>` : ''}</g>`;
      }).join('')}</svg></div>`;
}

function gridSide() {
  const t0 = totals(G.ix, G.active), c = G.sel && G.ix.byN.get(G.sel), opts = { moveLevel: G.moveLevel, energyCap: G.energyCap };
  const own = ownedPair(S.me, G.pairId), problems = validate(G.ix, [...G.active], opts);
  const changed = G.saved && G.saved.grid_hash && G.saved.grid_hash !== G.hash;
  const needed = Math.max(0, ...[...G.active].map(n => levelNeeded(G.ix.byN.get(n) || {})));
  const tile = c ? (() => { const why = G.active.has(c.n) ? null : whyNot(G.ix, G.active, c, opts);
    return `<div class="card pad"><div class="res-top"><span class="badge" style="background:${COLORS[c.color]?.[1]}33">${t(COLORS[c.color]?.[0] || c.color)}</span><span class="badge">#${c.n}</span></div>
      <h3>${esc(c.title)}</h3>${c.description ? `<p>${esc(c.description)}</p>` : ''}
      <p class="muted">${t('Energy')} <b>${c.energy}</b> · ${t('Sync orbs')} <b>${c.orbs}</b></p>
      ${(c.req || []).length ? `<p class="muted">${(c.req || []).map(esc).join('<br>')}</p>` : ''}
      ${otherReqs(c).length ? `<p class="notice">${ico('note')} ${t('This app only checks the move level; the other requirements are on you.')}</p>` : ''}
      ${why ? `<p class="notice">${ico('lock')} ${t(BUILD_WHY[why])}</p>` : ''}
      <div class="row"><button class="btn ${G.active.has(c.n) ? 'ghost' : 'primary'}" data-gtoggle="${c.n}" ${why ? 'disabled' : ''}>${G.active.has(c.n) ? t('Switch off') : t('Switch on')}</button></div></div>`; })()
    : `<div class="card pad"><p class="muted">${t('Tap a tile to read it and switch it on or off.')}</p></div>`;
  return `${tile}
  <div class="card pad form"><h3>${t('Your build')}</h3>
    <div class="gstats"><span><b>${t0.tiles}</b><small>${t('tiles')}</small></span><span><b>${t0.energy}</b><small>${t('energy')}${G.energyCap != null ? ` / ${G.energyCap}` : ''}</small></span><span><b>${fmtN(t0.orbs)}</b><small>${t('sync orbs')}</small></span></div>
    <div class="chips-l">${Object.entries(t0.byColor).map(([k, n]) => `<span class="chip" style="border-left:4px solid ${COLORS[k]?.[1]}">${n} ${t(COLORS[k]?.[0] || k)}</span>`).join('')}</div>
    <div class="grid2" style="margin-top:8px"><label>${t('Move level')}<select id="g-level">${[1, 2, 3, 4, 5].map(n => `<option ${n === G.moveLevel ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>${t('Energy limit')}<input id="g-cap" type="number" min="0" max="999" placeholder="${t('none')}" value="${G.energyCap ?? ''}"></label></div>
    <p class="muted">${own ? (needed > (own.level || 1) && own.level < 5 ? `<span class="badge bad">${t('Not usable yet')}</span> ${t('your move level is {n}', { n: Math.min(5, own.level) })}` : `<span class="badge good">${t('Usable')}</span> ${t('you own this pair')}`) : `<span class="badge">${t('Theoretical')}</span> ${t('not in your roster')}`}</p>
    ${problems.length ? `<p class="notice">${ico('lock')} ${t('This build breaks the rules:')} ${[...new Set(problems.map(p => t(BUILD_WHY[p.code])))].join(', ')}</p>` : ''}
    ${changed ? `<p class="notice">${ico('note')} ${t('The game data of this pair changed after this build was saved. Check the tiles.')}</p>` : ''}
    <label>${t('Name')}<input id="g-name" value="${esc(G.name)}" placeholder="${t('e.g. Speed and gauge')}"></label>
    <label>${t('Purpose')}<input id="g-purpose" value="${esc(G.purpose)}"></label>
    <label>${t('Who can see it')}<select id="g-vis"><option value="private" ${G.visibility === 'private' ? 'selected' : ''}>${t('Only me')}</option><option value="gym" ${G.visibility === 'gym' ? 'selected' : ''}>${t('The whole gym')}</option></select></label>
    <div class="row"><button class="btn primary" data-gsave ${problems.length ? 'disabled' : ''}>${t(G.buildId ? 'Save changes' : 'Save build')}</button>${G.buildId ? `<button class="btn" data-gsave-new ${problems.length ? 'disabled' : ''}>${t('Save as new')}</button><button class="btn ghost" data-gdel>${t('Delete')}</button>` : ''}
      <button class="btn ghost" data-greset>${t('Clear')}</button></div>${G.msg ? `<p class="form-err">${esc(G.msg)}</p>` : ''}</div>`;
}

function pairInfo() {
  const d = G.detail, mv = m => m && `<article class="card pad mv"><div class="res-top">${m.type ? typeTag(m.type) : ''}${m.category ? `<span class="badge">${esc(m.category)}</span>` : ''}${m.isSync ? `<span class="badge gold">${t('Sync move')}</span>` : ''}</div>
    <h3>${esc(m.name || '')}</h3><p class="pre">${esc(m.description || '')}</p>
    <small class="muted">${[m.power && `${t('Power')} ${m.power}`, m.accuracy && m.accuracy !== '--' && `${t('Accuracy')} ${m.accuracy}`, m.gauge && `${t('Gauge')} ${m.gauge}`, m.target && esc(m.target), m.maxUses && `${t('Uses')} ${m.maxUses}`].filter(Boolean).join(' · ')}</small></article>`;
  const pv = x => `<article class="card pad mv"><div class="res-top">${x.master ? `<span class="badge gold">${t('Master')}</span>` : ''}</div><h3>${esc(x.name || '')}</h3><p class="pre">${esc(x.description || '')}</p></article>`;
  const moves = (d.moves || []).filter(Boolean), pas = (d.passives || []).filter(Boolean);
  return `<h2 class="section">${t('Moves')}</h2><div class="res-grid">${moves.map(mv).join('')}${mv(d.syncMove)}</div>
    <h2 class="section">${t('Passives')}</h2><div class="res-grid">${pas.map(pv).join('') || `<p class="muted">—</p>`}${d.superPassive ? pv(d.superPassive) : ''}</div>
    ${(d.teamSkills || []).length ? `<h2 class="section">${t('Team skills')}</h2><div class="chips-l">${d.teamSkills.map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div>` : ''}
    <p class="muted">${t('Each text starts with its condition, as the game writes it.')}</p>`;
}

function gridHome() {
  const q = gridQuery.trim().toLowerCase();
  const found = q.length >= 2 ? PAIRS().filter(p => `${p.trainer} ${p.pokemon}`.toLowerCase().includes(q)).sort((a, b) => !!ownedPair(S.me, b.id) - !!ownedPair(S.me, a.id)).slice(0, 18) : [];
  const line = b => { const p = pairById(b.pair_id), bad = false;
    return `<a class="card pad build" href="#/grid/${encodeURIComponent(b.pair_id)}/${b.id}">${p ? pairIcon(p, 'sm') : ''}<div><b>${esc(b.name)}</b><small class="muted">${p ? esc(pairName(p)) : esc(b.pair_id)} · ${t('{n} tiles', { n: b.nodes.length })}${b.user_id !== S.me ? ` · ${esc(nameOf(profile(b.user_id)))}` : ''}${b.visibility === 'gym' ? ` · ${t('shared')}` : ''}</small>${b.purpose ? `<small>${esc(b.purpose)}</small>` : ''}</div></a>`; };
  const mine = S.builds.filter(b => b.user_id === S.me), others = S.builds.filter(b => b.user_id !== S.me);
  return `<div class="toolbar"><h1>${t('Sync Grid')}</h1></div>
  <p class="muted">${t('Read the moves and passives of any sync pair, and plan which grid tiles to switch on. Builds are private until you share them with the gym.')}</p>
  <div class="card pad"><input id="grid-q" placeholder="${t('Search a sync pair…')}" value="${esc(gridQuery)}" autocomplete="off">
    <div class="lodge-pick">${found.map(p => `<a class="lodge-t" href="#/grid/${encodeURIComponent(p.id)}">${pairIcon(p, 'sm')}<small>${esc(p.trainer)}<br>${esc(p.pokemon)}${ownedPair(S.me, p.id) ? ` ✓` : ''}</small></a>`).join('')}</div></div>
  <h2 class="section">${t('My builds')} <small>${mine.length}</small></h2><div class="res-grid">${mine.map(line).join('') || `<p class="muted">${t('No builds yet: open a sync pair and save one.')}</p>`}</div>
  ${others.length ? `<h2 class="section">${t('Shared by the gym')} <small>${others.length}</small></h2><div class="res-grid">${others.map(line).join('')}</div>` : ''}`;
}

const gridRedraw = () => { const b = $('#grid-board'), sc = $('.grid-scroll'), l = sc?.scrollLeft, tp = sc?.scrollTop; if (b) { b.innerHTML = gridBoard(); const n = $('.grid-scroll'); if (n) { n.scrollLeft = l; n.scrollTop = tp; } } const sd = $('#grid-side'); if (sd) sd.innerHTML = gridSide(); };
const gridKeepFields = () => { G.name = $('#g-name')?.value ?? G.name; G.purpose = $('#g-purpose')?.value ?? G.purpose; };
async function gridSave(asNew) {
  gridKeepFields();
  const problems = validate(G.ix, [...G.active], { moveLevel: G.moveLevel, energyCap: G.energyCap });
  if (problems.length) { G.msg = t('This build breaks the rules.'); gridRedraw(); return; }
  if (!G.name.trim()) { G.msg = t('Give it a name.'); gridRedraw(); return; }
  const row = { pair_id: G.pairId, name: G.name.trim(), purpose: G.purpose.trim(), nodes: [...G.active].sort((a, b) => a - b), move_level: G.moveLevel, energy_cap: G.energyCap,
    visibility: G.visibility, grid_hash: G.hash, data_version: String(G.detail.version || (G.detail.versions || []).join(',') || ''), ...(G.buildId && !asNew ? { id: G.buildId } : { user_id: S.me }) };
  let saved;
  if (await act(async () => { saved = await api.saveGridBuild(row); }, t('Build saved.'))) {
    S.builds = await api.gridBuilds();
    G.buildId = saved?.id ?? G.buildId; G.saved = S.builds.find(b => b.id === G.buildId) || null; G.msg = '';
    history.replaceState(null, '', `#/grid/${encodeURIComponent(G.pairId)}/${G.buildId}`); gridRedraw();
  }
}
document.addEventListener('input', e => {
  if (e.target.id === 'grid-q') { gridQuery = e.target.value; const pos = e.target.selectionStart; hooks.route(); const el = $('#grid-q'); el?.focus(); el?.setSelectionRange(pos, pos); }
  if (e.target.id === 'grid-zoom') { try { localStorage.setItem('gym-grid-zoom', e.target.value); } catch { /* private mode */ } const b = $('#grid-board'); if (b) { const sc = $('.grid-scroll'), l = sc?.scrollLeft, tp = sc?.scrollTop; b.innerHTML = gridBoard(); const n = $('.grid-scroll'); n.scrollLeft = l; n.scrollTop = tp; } }
});
document.addEventListener('change', e => {
  if (e.target.id === 'g-level') { gridKeepFields(); G.moveLevel = +e.target.value; gridRedraw(); }
  if (e.target.id === 'g-cap') { gridKeepFields(); G.energyCap = e.target.value === '' ? null : Math.max(0, +e.target.value); gridRedraw(); }
  if (e.target.id === 'g-vis') { gridKeepFields(); G.visibility = e.target.value; gridRedraw(); }
});
document.addEventListener('click', async e => {
  const tile = e.target.closest('[data-gtile]'), tog = e.target.closest('[data-gtoggle]'), tab = e.target.closest('[data-gtab]');
  if (tab) { G.tab = tab.dataset.gtab; hooks.route(); return; }
  if (tile) { G.sel = +tile.dataset.gtile; gridKeepFields(); gridRedraw(); return; }
  if (tog) {
    gridKeepFields();
    const c = G.ix.byN.get(+tog.dataset.gtoggle), opts = { moveLevel: G.moveLevel, energyCap: G.energyCap };
    if (G.active.has(c.n)) { if (!canRemove(G.ix, G.active, c)) { G.msg = t('Other tiles hang on this one: switch those off first.'); gridRedraw(); return; } G.active.delete(c.n); }
    else { const why = whyNot(G.ix, G.active, c, opts); if (why) return; G.active.add(c.n); }
    G.msg = ''; gridRedraw(); return;
  }
  if (e.target.closest('[data-gsave]')) gridSave(false);
  if (e.target.closest('[data-gsave-new]')) gridSave(true);
  if (e.target.closest('[data-greset]')) { gridKeepFields(); G.active = new Set(); G.msg = ''; gridRedraw(); }
  if (e.target.closest('[data-gdel]')) {
    if (confirm(t('Delete this build?')) && await act(() => api.deleteGridBuild(G.buildId), t('Build deleted.'))) { S.builds = await api.gridBuilds(); G.buildId = null; location.hash = '#/grid'; }
  }
});
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-gtile]')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });

