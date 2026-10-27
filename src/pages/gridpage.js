// Page module (split out of main.js). Registers its own listeners when imported.
import { $, esc, fmtN, img, pairIcon, typeTag, act, api, S, profile, nameOf, ownedPair, hooks } from '../core.js';
import { ico } from '../icons.js';
import { t } from '../i18n.js';
import { splitDescription, count } from '../moves.js';
import { indexGrid, whyNot, canRemove, validate, totals, levelNeeded, otherReqs, gridHash, hexXY, COLORS } from '../grid.js';
import { PAIRS, loadPairDetail, dexIdOf, pairById, pairName, pairImage, TYPE_COLORS, TYPES, typeIcon } from '../catalog.js';

// ═══════════════════════════════════════════════════════════════
//  SYNC GRID: moves and passives of a pair, and a grid builder (rules in grid.js)
// ═══════════════════════════════════════════════════════════════
const G = { pairId: '', detail: null, err: '', ix: null, active: new Set(), moveLevel: 5, energyCap: null, sel: null, panel: 'tile', sub: 'moves', focus: null, statLevel: '', buildId: null,
  name: '', purpose: '', visibility: 'private', saved: null, hash: '', msg: '' };
const gridZoom = () => { try { return +localStorage.getItem('gym-grid-zoom') || 1; } catch { return 1; } };
const setZoom = z => { try { localStorage.setItem('gym-grid-zoom', Math.max(0.4, Math.min(2.4, z)).toFixed(2)); } catch { /* private mode */ } };
const BUILD_WHY = { 'not-adjacent': 'next to no active tile', 'move-level': 'needs a higher move level', energy: 'over the energy limit', unknown: 'tile no longer exists' };

export function renderGrid(pairId = '', buildId = '') {
  if (!pairId) return gridHome();
  if (G.pairId !== pairId || (buildId && G.buildId !== +buildId)) {
    Object.assign(G, { pairId, detail: null, err: '', ix: null, active: new Set(), sel: null, panel: 'tile', sub: 'moves', focus: null, statLevel: '', buildId: null, name: '', purpose: '', visibility: 'private', saved: null, msg: '', moveLevel: 5, energyCap: null });
    const mine = ownedPair(S.me, pairId);
    if (mine) G.moveLevel = Math.min(5, mine.level || 5);
    const b = buildId && S.builds.find(x => x.id === +buildId);
    if (b) Object.assign(G, { buildId: b.id, name: b.name, purpose: b.purpose, visibility: b.visibility, moveLevel: b.move_level, energyCap: b.energy_cap, active: new Set(b.nodes), saved: b });
    const dexId = pairById(pairId) && dexIdOf(pairById(pairId));
    (dexId ? loadPairDetail(dexId) : Promise.reject(new Error('unmapped'))).then(d => { G.detail = d; G.ix = indexGrid(d.grid || []); G.hash = gridHash(d.grid || []); if (location.hash.startsWith('#/grid/')) hooks.route(); })
      .catch(() => { G.err = 'load'; if (location.hash.startsWith('#/grid/')) hooks.route(); });
  }
  const p = pairById(pairId);
  const head = `<div class="toolbar"><h1>${t('Sync Grid')}</h1><a class="btn ghost" href="#/grid">${ico('left')} ${t('All builds')}</a></div>`;
  if (G.err) return head + `<div class="card pad"><p class="muted">${t('The grid of this pair could not be loaded. Try again later.')}</p></div>`;
  if (!G.detail) return head + `<p class="muted">${t('Loading…')}</p>`;
  const noGrid = !G.ix.grid.length;
  return `${head}${pairHeader(p)}${noGrid ? `<div class="card pad"><p class="muted">${t('This pair has no grid in the datamine yet.')}</p></div><div id="grid-side">${pairPanel()}</div>`
    : `<div class="grid-layout"><div class="gp-board card" id="grid-board">${gridBoard()}</div><aside class="gp-panel card" id="grid-side">${gridSide()}</aside></div>`}`;
}

// ── the header: who this pair is, as the game shows it ──
function pairHeader(p) {
  const d = G.detail, own = ownedPair(S.me, G.pairId);
  return `<section class="gp-head card"><div class="gp-portrait">${p ? pairIcon(p, 'lg', own?.ex) : ''}</div>
    <div class="gp-id"><h2>${esc(p ? pairName(p) : d.trainer)}</h2>
      <div class="gp-tags">${typeTag(d.type || p?.type)}${d.role ? `<span class="gp-tag">${esc(d.role)}</span>` : ''}${d.exRole ? `<span class="gp-tag ex">EX · ${esc(d.exRole)}</span>` : ''}
        ${d.weakness ? `<span class="gp-tag weak">${t('Weak to')} ${esc(t(d.weakness))}</span>` : ''}${d.rarity ? `<span class="gp-tag star">${'★'.repeat(d.rarity)}</span>` : ''}</div></div>
    <div class="gp-own">${own ? `<span class="badge good">${t('Usable')}</span><small>${t('you own this pair')}</small>` : `<span class="badge">${t('Theoretical')}</span><small>${t('not in your roster')}</small>`}</div></section>`;
}

// ── the board ──
const SIZE = 34;
const hexPts = (x, y, r) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 180 * (60 * i - 30); return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`; }).join(' ');
// A tile's name, broken into at most three short lines that fit inside a hex
function tileLines(title) {
  const words = String(title).replace(/\s+/g, ' ').trim().split(' '), lines = [''];
  for (const w of words) {
    const cur = lines.at(-1);
    if ((cur + ' ' + w).trim().length <= 11) lines[lines.length - 1] = (cur + ' ' + w).trim();
    else if (lines.length < 3) lines.push(w.length > 11 ? `${w.slice(0, 10)}…` : w);
    else { lines[2] = `${lines[2].slice(0, 10)}…`; break; }
  }
  return lines.filter(Boolean);
}
const ARROW = (x, y) => `M${x} ${y - 13} l11 14 h-6.5 v10 h-9 v-10 h-6.5 z`;
function gridBoard() {
  const zoom = gridZoom(), pts = G.ix.grid.map(c => ({ c, ...hexXY(c, SIZE) })), pad = SIZE * 1.5;
  const minX = Math.min(0, ...pts.map(p => p.x)) - pad, maxX = Math.max(0, ...pts.map(p => p.x)) + pad, minY = Math.min(0, ...pts.map(p => p.y)) - pad, maxY = Math.max(0, ...pts.map(p => p.y)) + pad;
  const opts = { moveLevel: G.moveLevel, energyCap: G.energyCap }, t0 = totals(G.ix, G.active), pair = pairById(G.pairId), own = ownedPair(S.me, G.pairId);
  const stars = [1, 2, 3, 4, 5].map(n => `<button class="mlv ${n <= G.moveLevel ? 'on' : ''}" data-gmlv="${n}" aria-label="${t('Move level')} ${n}" title="${t('Move level')} ${n}">★</button>`).join('');
  return `<div class="gp-hud"><span class="hud-i orb"><i></i>${t('Sync orbs')} <b>${fmtN(t0.orbs)}</b></span>
      <span class="hud-i en"><i></i>${t('Energy')} <b>${t0.energy}</b>${G.energyCap != null ? `<small> / ${G.energyCap}</small>` : ''}</span>
      <span class="hud-i lv" title="${t('Move level')}">${stars}</span>
      <span class="hud-sp"></span>
      <button class="hud-b" data-gzoom="-0.2" aria-label="${t('Zoom out')}">−</button><button class="hud-b" data-gzoom="0.2" aria-label="${t('Zoom in')}">+</button><button class="hud-b wide" data-gfit>${t('Fit')}</button></div>
    <div class="gp-legend">${Object.entries(COLORS).map(([k, [l, col]]) => `<button class="lg ${G.focus === k ? 'on' : ''}" data-gfocus="${k}" style="--c:${col}"><i></i>${t(l)}</button>`).join('')}</div>
    <div class="grid-scroll"><svg viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" style="width:${Math.round((maxX - minX) * zoom)}px" class="${G.focus ? 'focus' : ''}" data-focus="${G.focus || ''}" role="img" aria-label="${t('Sync grid')}">
      <defs><clipPath id="g-clip"><polygon points="${hexPts(0, 0, SIZE - 5)}"/></clipPath></defs>
      ${pts.map(({ c, x, y }) => {
        const on = G.active.has(c.n), why = on ? null : whyNot(G.ix, G.active, c, opts), col = COLORS[c.color]?.[1] || '#999', lines = tileLines(c.title);
        const y0 = y - (lines.length - 1) * 4.6 - 1;
        return `<g class="g-tile ${on ? 'on' : why ? 'locked' : 'open'} ${G.sel === c.n ? 'sel' : ''} k-${c.color}" data-gtile="${c.n}" data-color="${c.color}" tabindex="0" role="button" aria-label="${esc(c.title)}" style="--c:${col}">
          <polygon class="g-out" points="${hexPts(x, y, SIZE - 1)}"/><polygon class="g-in" points="${hexPts(x, y, SIZE - 6)}"/>
          ${c.color === 'blue' ? `<path class="g-arrow" d="${ARROW(x, y - 1)}"/>` : ''}
          <text class="g-t" x="${x}" y="${y0}" text-anchor="middle">${lines.map((l, i) => `<tspan x="${x}" dy="${i ? 9.2 : 0}">${esc(l)}</tspan>`).join('')}</text>
          ${c.energy ? `<g class="g-en"><circle cx="${x}" cy="${y + SIZE - 10}" r="8"/><text x="${x}" y="${y + SIZE - 6.8}" text-anchor="middle">${c.energy}</text></g>` : ''}
          ${c.req?.length ? `<text class="g-lock" x="${x + SIZE * .55}" y="${y - SIZE * .5}" text-anchor="middle">Lv${levelNeeded(c)}</text>` : ''}</g>`;
      }).join('')}
      <g class="g-core"><polygon class="g-ring" points="${hexPts(0, 0, SIZE + 2)}"/>${pair ? `<image href="${esc(pairImage(pair, own?.ex, own?.stars))}" x="${-(SIZE - 4)}" y="${-(SIZE - 4)}" width="${(SIZE - 4) * 2}" height="${(SIZE - 4) * 2}" clip-path="url(#g-clip)" preserveAspectRatio="xMidYMid slice"/>` : ''}</g>
    </svg></div>`;
}

// ── the side panel: the tile you tapped and your build, or the pair's moves and passives ──
function gridSide() {
  return `<div class="gp-tabs">${[['tile', 'Tile and build'], ['pair', 'Pair info']].map(([k, l]) => `<button class="${G.panel === k ? 'on' : ''}" data-gpanel="${k}">${t(l)}</button>`).join('')}</div>
    <div class="gp-body">${G.panel === 'pair' ? pairPanel() : tilePanel()}</div>`;
}
function tilePanel() {
  const t0 = totals(G.ix, G.active), c = G.sel && G.ix.byN.get(G.sel), opts = { moveLevel: G.moveLevel, energyCap: G.energyCap };
  const own = ownedPair(S.me, G.pairId), problems = validate(G.ix, [...G.active], opts);
  const changed = G.saved && G.saved.grid_hash && G.saved.grid_hash !== G.hash;
  const needed = Math.max(0, ...[...G.active].map(n => levelNeeded(G.ix.byN.get(n) || {})));
  const tile = c ? (() => { const why = G.active.has(c.n) ? null : whyNot(G.ix, G.active, c, opts), col = COLORS[c.color]?.[1] || '#999';
    return `<article class="tile-card" style="--c:${col}"><header><span class="tc-kind">${t(COLORS[c.color]?.[0] || c.color)}</span><span class="tc-n">#${c.n}</span></header>
      <h3>${esc(c.title)}</h3>${c.description ? `<p class="pre">${esc(c.description)}</p>` : ''}
      <div class="tc-cost"><span class="en"><i></i>${t('Energy')} <b>${c.energy}</b></span><span class="orb"><i></i>${t('Sync orbs')} <b>${fmtN(c.orbs)}</b></span></div>
      ${(c.req || []).length ? `<ul class="tc-req">${c.req.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
      ${otherReqs(c).length ? `<p class="notice">${ico('note')} ${t('This app only checks the move level; the other requirements are on you.')}</p>` : ''}
      ${why ? `<p class="notice">${ico('lock')} ${t(BUILD_WHY[why])}</p>` : ''}
      <button class="btn ${G.active.has(c.n) ? 'ghost' : 'primary'} block" data-gtoggle="${c.n}" ${why ? 'disabled' : ''}>${G.active.has(c.n) ? t('Switch off') : t('Switch on')}</button></article>`; })()
    : `<div class="tile-card empty"><p class="muted">${t('Tap a tile to read it and switch it on or off.')}</p></div>`;
  return `${tile}
  <div class="build-card form"><h3>${t('Your build')}</h3>
    <div class="gstats"><span><b>${t0.tiles}</b><small>${t('tiles')}</small></span><span><b>${t0.energy}</b><small>${t('energy')}${G.energyCap != null ? ` / ${G.energyCap}` : ''}</small></span><span><b>${fmtN(t0.orbs)}</b><small>${t('sync orbs')}</small></span></div>
    <div class="chips-l">${Object.entries(t0.byColor).map(([k, n]) => `<span class="chip" style="border-left:4px solid ${COLORS[k]?.[1]}">${n} ${t(COLORS[k]?.[0] || k)}</span>`).join('')}</div>
    <div class="grid2" style="margin-top:8px"><label>${t('Move level')}<select id="g-level">${[1, 2, 3, 4, 5].map(n => `<option ${n === G.moveLevel ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>${t('Energy limit')}<input id="g-cap" type="number" min="0" max="999" placeholder="${t('none')}" value="${G.energyCap ?? ''}"></label></div>
    ${own && needed > (own.level || 1) && own.level < 5 ? `<p class="notice">${ico('lock')} ${t('Not usable yet')}: ${t('your move level is {n}', { n: Math.min(5, own.level) })}</p>` : ''}
    ${problems.length ? `<p class="notice">${ico('lock')} ${t('This build breaks the rules:')} ${[...new Set(problems.map(p => t(BUILD_WHY[p.code])))].join(', ')}</p>` : ''}
    ${changed ? `<p class="notice">${ico('note')} ${t('The game data of this pair changed after this build was saved. Check the tiles.')}</p>` : ''}
    <label>${t('Name')}<input id="g-name" value="${esc(G.name)}" placeholder="${t('e.g. Speed and gauge')}"></label>
    <label>${t('Purpose')}<input id="g-purpose" value="${esc(G.purpose)}"></label>
    <label>${t('Who can see it')}<select id="g-vis"><option value="private" ${G.visibility === 'private' ? 'selected' : ''}>${t('Only me')}</option><option value="gym" ${G.visibility === 'gym' ? 'selected' : ''}>${t('The whole gym')}</option></select></label>
    <div class="row"><button class="btn primary" data-gsave ${problems.length ? 'disabled' : ''}>${t(G.buildId ? 'Save changes' : 'Save build')}</button>${G.buildId ? `<button class="btn" data-gsave-new ${problems.length ? 'disabled' : ''}>${t('Save as new')}</button><button class="btn ghost" data-gdel>${t('Delete')}</button>` : ''}
      <button class="btn ghost" data-greset>${t('Clear')}</button></div>${G.msg ? `<p class="form-err">${esc(G.msg)}</p>` : ''}</div>`;
}

// ── moves, passives, team skills and facts, laid out like the game's pair screen ──
const STAT_ROWS = [['HP', 'HP', '#dff3d6'], ['Attack', 'Atk', '#fde6cf'], ['Defense', 'Def', '#fbf3c8'], ['Sp. Atk', 'Sp.Atk', '#d6e7fb'], ['Sp. Def', 'Sp.Def', '#e5ddf8'], ['Speed', 'Speed', '#fadbec']];
const CAT = { physical: ['Physical', '#e8741f'], special: ['Special', '#3c8de8'], status: ['Status', '#8d99a6'] };
// The text of a move or passive: the activation condition, the deactivation condition and the effect each on their own line
function describe(text) {
  const d = splitDescription(text);
  return `${d.activation ? `<p class="cond act"><b>${t('Activation condition')}</b>${esc(d.activation)}</p>` : ''}${d.deactivation ? `<p class="cond deact"><b>${t('Deactivation condition')}</b>${esc(d.deactivation)}</p>` : ''}${d.rest ? `<p class="pre">${esc(d.rest)}</p>` : ''}`;
}
function moveCard(m, sync = false) {
  if (!m) return '';
  const col = TYPE_COLORS[m.type] || '#8d99a6', cat = CAT[String(m.category || '').toLowerCase()] || [m.category || '', '#8d99a6'], gauge = count(m.gauge), limit = count(m.maxUses);
  return `<article class="mv move ${sync || m.isSync ? 'sync' : ''}" style="--c:${col}"><header>${m.type ? img(typeIcon(m.type), 'ti', m.type) : ''}<h4>${esc(m.name || '')}</h4>
      ${sync || m.isSync ? `<span class="rb">${t('Sync move')}</span>` : ''}${gauge ? `<span class="pips" title="${t('Move gauge needed')}: ${gauge}" aria-label="${t('Move gauge needed')}: ${gauge}">${Array.from({ length: Math.min(gauge, 8) }, () => '<i></i>').join('')}</span>` : ''}</header>
    <dl class="mv-facts"><div><dt>${t('Category')}</dt><dd><span class="cat" style="--k:${cat[1]}">${t(cat[0])}</span></dd></div><div><dt>${t('Target')}</dt><dd>${esc(m.target || '—')}</dd></div>
      <div><dt>${t('Power')}</dt><dd>${esc(m.power || '—')}</dd></div><div><dt>${t('Accuracy')}</dt><dd>${esc(m.accuracy && m.accuracy !== '--' ? m.accuracy : '—')}</dd></div>
      ${limit ? `<div class="lim"><dt>${t('Max uses')}</dt><dd>${limit}</dd></div>` : ''}${m.effectTag && m.effectTag !== '--' ? `<div><dt>${t('Effect')}</dt><dd>${esc(m.effectTag)}</dd></div>` : ''}</dl>
    <div class="mv-text">${describe(m.description)}</div></article>`;
}
const passiveCard = (x, kind = '') => `<article class="mv passive ${kind}" style="--c:${kind === 'super' ? '#bf80ff' : '#e5b143'}"><header><h4>${esc(x.name || '')}</h4>${x.master ? `<span class="rb">${t('Master')}</span>` : kind === 'super' ? `<span class="rb">${t('Super')}</span>` : ''}</header><div class="mv-text">${describe(x.description)}</div></article>`;
function pairPanel() {
  const d = G.detail, levels = Object.keys(d.stats || {}).sort((a, b) => +a - +b);
  const lvl = levels.includes(G.statLevel) ? G.statLevel : (levels.includes('140') ? '140' : levels.at(-1)), st = (d.stats || {})[lvl] || {};
  const subs = [['moves', 'Moves'], ['passives', 'Passives'], ['team', 'Team skills'], ['facts', 'Info']];
  const moves = (d.moves || []).filter(Boolean), pas = (d.passives || []).filter(Boolean);
  const body = G.sub === 'moves' ? `${moves.map(m => moveCard(m)).join('')}${moveCard(d.syncMove, true)}${!moves.length && !d.syncMove ? `<p class="muted">—</p>` : ''}`
    : G.sub === 'passives' ? `${pas.map(x => passiveCard(x)).join('')}${d.superPassive ? passiveCard(d.superPassive, 'super') : ''}${!pas.length && !d.superPassive ? `<p class="muted">—</p>` : ''}`
    : G.sub === 'team' ? ((d.teamSkills || []).length ? `<div class="chips-l">${d.teamSkills.map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div>` : `<p class="muted">—</p>`)
    : `<dl class="kv">${[['Role', d.role], ['EX role', d.exRole], ['Type', d.type && t(d.type)], ['Weakness', d.weakness && t(d.weakness)], ['Acquired', d.method || d.expedition || d.collectInfo], ['Game version', d.version || (d.versions || []).at(-1)], ['Sync pair released', d.dates?.['Sync Pair'] && String(d.dates['Sync Pair']).slice(0, 10)], ['EX released', d.dates?.['EX Effect'] && String(d.dates['EX Effect']).slice(0, 10)]]
        .filter(r => r[1]).map(([k, v]) => `<dt>${t(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${d.description ? `<p class="pre">${esc(d.description)}</p>` : ''}`;
  return `${levels.length ? `<div class="stat-lv">${levels.map(l => `<button class="${l === lvl ? 'on' : ''}" data-gstat="${l}">${t('Lv')} ${l}</button>`).join('')}</div>
    <div class="stat-row">${STAT_ROWS.map(([k, label, bg]) => `<div style="--bg:${bg}"><small>${label}</small><b>${st[k] ?? '—'}</b></div>`).join('')}</div>` : ''}
    <div class="gp-sub">${subs.map(([k, l]) => `<button class="${G.sub === k ? 'on' : ''}" data-gsub="${k}">${t(l)}</button>`).join('')}</div>
    <div class="mv-list">${body}</div><p class="muted">${t('Each text starts with its condition, as the game writes it.')}</p>`;
}

// ── the pair list: every sync pair, newest first, with filters ──
const GF = { q: '', type: '', role: '', rarity: '', acq: '', ex: false, owned: false, withGrid: false, sort: 'new', shown: 48 };
const isNew = p => p.release && Date.now() - Date.parse(p.release) < 30 * 864e5;
function filteredPairs() {
  const q = GF.q.trim().toLowerCase();
  const list = PAIRS().filter(p => (!q || `${p.trainer} ${p.pokemon}`.toLowerCase().includes(q)) && (!GF.type || p.type === GF.type) && (!GF.role || p.role === GF.role)
    && (!GF.rarity || String(p.rarity) === GF.rarity) && (!GF.acq || p.acquisition === GF.acq) && (!GF.ex || p.exRole) && (!GF.owned || ownedPair(S.me, p.id)) && (!GF.withGrid || dexIdOf(p)));
  const by = { new: (a, b) => (b.release || '').localeCompare(a.release || ''), old: (a, b) => (a.release || '9').localeCompare(b.release || '9'), name: (a, b) => a.trainer.localeCompare(b.trainer) || a.pokemon.localeCompare(b.pokemon), type: (a, b) => (a.type || '').localeCompare(b.type || '') || (b.release || '').localeCompare(a.release || '') };
  return list.sort((a, b) => by[GF.sort](a, b) || a.trainer.localeCompare(b.trainer));
}
function pairTile(p) {
  const own = ownedPair(S.me, p.id), has = !!dexIdOf(p);
  return `<a class="pt ${has ? '' : 'nogrid'}" href="#/grid/${encodeURIComponent(p.id)}" title="${esc(pairName(p))}${has ? '' : ` — ${t('no grid data yet')}`}">
    <span class="pt-img">${pairIcon(p, 'md', own?.ex)}${isNew(p) ? `<b class="pt-new">${t('New')}</b>` : ''}${own ? `<b class="pt-own" title="${t('you own this pair')}">✓</b>` : ''}</span>
    <span class="pt-name">${esc(p.trainer)}</span><span class="pt-poke">${esc(p.pokemon)}</span>
    <span class="pt-meta">${img(typeIcon(p.type), 'ti', p.type)}<small>${esc(p.role || '')}${p.exRole ? ' · EX' : ''}</small></span>
    <small class="pt-date">${p.release ? esc(p.release) : ''}</small></a>`;
}
function pairResults() {
  const list = filteredPairs(), shown = list.slice(0, GF.shown);
  return `<p class="muted pt-count">${t('{n} sync pairs', { n: list.length })}${GF.sort === 'new' ? ` · ${t('newest first')}` : ''}</p>
    <div class="pt-grid">${shown.map(pairTile).join('') || `<p class="muted">${t('No sync pair matches.')}</p>`}</div>
    ${list.length > shown.length ? `<div class="row" style="justify-content:center;margin:14px 0"><button class="btn" data-gf-more>${t('Show {n} more', { n: Math.min(48, list.length - shown.length) })} <small class="muted">(${list.length - shown.length})</small></button></div>` : ''}`;
}
function gridHome() {
  const all = PAIRS(), roles = [...new Set(all.map(p => p.role).filter(Boolean))].sort(), acqs = [...new Set(all.map(p => p.acquisition).filter(Boolean))].sort();
  const sel = (key, val, opts, any) => `<select data-gf="${key}"><option value="">${t(any)}</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${val === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const line = b => { const p = pairById(b.pair_id);
    return `<a class="card pad build" href="#/grid/${encodeURIComponent(b.pair_id)}/${b.id}">${p ? pairIcon(p, 'sm') : ''}<div><b>${esc(b.name)}</b><small class="muted">${p ? esc(pairName(p)) : esc(b.pair_id)} · ${t('{n} tiles', { n: b.nodes.length })}${b.user_id !== S.me ? ` · ${esc(nameOf(profile(b.user_id)))}` : ''}${b.visibility === 'gym' ? ` · ${t('shared')}` : ''}</small>${b.purpose ? `<small>${esc(b.purpose)}</small>` : ''}</div></a>`; };
  const mine = S.builds.filter(b => b.user_id === S.me), others = S.builds.filter(b => b.user_id !== S.me);
  return `<div class="toolbar"><h1>${t('Sync Grid')}</h1></div>
  <p class="muted">${t('Pick any sync pair to read its moves and passives and plan which grid tiles to switch on. Builds are private until you share them with the gym.')}</p>
  ${mine.length || others.length ? `<details class="card pad" ${mine.length ? 'open' : ''}><summary><b>${t('Builds')}</b> <small class="muted">${t('{a} yours, {b} shared by the gym', { a: mine.length, b: others.length })}</small></summary>
    <div class="res-grid" style="margin-top:10px">${[...mine, ...others].map(line).join('')}</div></details>` : ''}
  <div class="card pad pt-filters"><input id="grid-q" placeholder="${t('Search a sync pair…')}" value="${esc(GF.q)}" autocomplete="off">
    ${sel('type', GF.type, TYPES.map(x => [x, t(x)]), 'All types')}${sel('role', GF.role, roles.map(x => [x, x]), 'All roles')}${sel('rarity', GF.rarity, [['5', '5★'], ['4', '4★'], ['3', '3★']], 'Any stars')}${sel('acq', GF.acq, acqs.map(x => [x, x]), 'Any way to get it')}
    <select data-gf="sort"><option value="new" ${GF.sort === 'new' ? 'selected' : ''}>${t('Newest first')}</option><option value="old" ${GF.sort === 'old' ? 'selected' : ''}>${t('Oldest first')}</option><option value="name" ${GF.sort === 'name' ? 'selected' : ''}>${t('Name')}</option><option value="type" ${GF.sort === 'type' ? 'selected' : ''}>${t('Type')}</option></select>
    <label class="chk"><input type="checkbox" data-gfc="ex" ${GF.ex ? 'checked' : ''}> ${t('EX role')}</label><label class="chk"><input type="checkbox" data-gfc="owned" ${GF.owned ? 'checked' : ''}> ${t('Mine')}</label><label class="chk"><input type="checkbox" data-gfc="withGrid" ${GF.withGrid ? 'checked' : ''}> ${t('Has a grid')}</label>
    <button class="btn sm ghost" data-gf-clear>${t('Clear filters')}</button></div>
  <div id="pair-results">${pairResults()}</div>`;
}

const redrawBoard = () => { const b = $('#grid-board'), sc = $('.grid-scroll'), l = sc?.scrollLeft, tp = sc?.scrollTop; if (b) { b.innerHTML = gridBoard(); const n = $('.grid-scroll'); if (n) { n.scrollLeft = l; n.scrollTop = tp; } } };
const redrawSide = () => { const sd = $('#grid-side'); if (sd) sd.innerHTML = G.ix?.grid.length ? gridSide() : pairPanel(); };
const gridRedraw = () => { redrawBoard(); redrawSide(); };
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
  if (e.target.id === 'grid-q') { GF.q = e.target.value; GF.shown = 48; const r = $('#pair-results'); if (r) r.innerHTML = pairResults(); }
});
document.addEventListener('change', e => {
  const gf = e.target.dataset?.gf, gfc = e.target.dataset?.gfc;
  if (gf) { GF[gf] = e.target.value; GF.shown = 48; const r = $('#pair-results'); if (r) r.innerHTML = pairResults(); return; }
  if (gfc) { GF[gfc] = e.target.checked; GF.shown = 48; const r = $('#pair-results'); if (r) r.innerHTML = pairResults(); return; }
  if (e.target.id === 'g-level') { gridKeepFields(); G.moveLevel = +e.target.value; gridRedraw(); }
  if (e.target.id === 'g-cap') { gridKeepFields(); G.energyCap = e.target.value === '' ? null : Math.max(0, +e.target.value); gridRedraw(); }
  if (e.target.id === 'g-vis') { gridKeepFields(); G.visibility = e.target.value; gridRedraw(); }
});
document.addEventListener('click', async e => {
  const tile = e.target.closest('[data-gtile]'), tog = e.target.closest('[data-gtoggle]'), panel = e.target.closest('[data-gpanel]'), sub = e.target.closest('[data-gsub]'), zoom = e.target.closest('[data-gzoom]'),
    fit = e.target.closest('[data-gfit]'), focus = e.target.closest('[data-gfocus]'), lv = e.target.closest('[data-gmlv]'), stat = e.target.closest('[data-gstat]');
  if (e.target.closest('[data-gf-more]')) { GF.shown += 48; const r = $('#pair-results'); if (r) r.innerHTML = pairResults(); return; }
  if (e.target.closest('[data-gf-clear]')) { Object.assign(GF, { q: '', type: '', role: '', rarity: '', acq: '', ex: false, owned: false, withGrid: false, sort: 'new', shown: 48 }); hooks.route(); return; }
  if (panel) { gridKeepFields(); G.panel = panel.dataset.gpanel; redrawSide(); return; }
  if (sub) { G.sub = sub.dataset.gsub; redrawSide(); return; }
  if (stat) { G.statLevel = stat.dataset.gstat; redrawSide(); return; }
  if (zoom) { setZoom(gridZoom() + +zoom.dataset.gzoom); redrawBoard(); return; }
  if (fit) { const w = $('.grid-scroll')?.clientWidth || 600, svg = $('.grid-scroll svg'), vb = svg?.viewBox.baseVal; if (vb) setZoom(Math.max(0.4, Math.min(2.2, (w - 8) / vb.width))); redrawBoard(); return; }
  if (focus) { G.focus = G.focus === focus.dataset.gfocus ? null : focus.dataset.gfocus; redrawBoard(); return; }
  if (lv) { gridKeepFields(); G.moveLevel = +lv.dataset.gmlv; gridRedraw(); return; }
  if (tile) { G.sel = +tile.dataset.gtile; G.panel = 'tile'; gridKeepFields(); gridRedraw(); return; }
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

