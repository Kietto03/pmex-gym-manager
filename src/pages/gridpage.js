// Page module (split out of main.js). Registers its own listeners when imported.
import { $, esc, fmtN, img, pairIcon, typeTag, act, toast, api, S, profile, nameOf, ownedPair, hooks } from '../core.js';
import { ico } from '../icons.js';
import { gridSvg } from '../gridimage.js';
import { t } from '../i18n.js';
import { splitDescription, count } from '../moves.js';
import { byAcquisition, acqLabel } from '../acquisition.js';
import { STATS, gridBonus, totalStats } from '../stats.js';
import { formViews, allMoveNames } from '../forms.js';
import { trainerArt, pokeArt, formStem, trainerBackup, pokeBackup, artKind } from '../art.js';
import { indexGrid, markArc, energyCapFor, whyNot, canRemove, validate, totals, levelNeeded, otherReqs, gridHash, hexXY, settle, linkGap, COLORS } from '../grid.js';
import { PAIRS, loadPairDetail, dexIdOf, pairById, pairName, pairImage, TYPE_COLORS, TYPES, typeIcon, roleIcon, DEX } from '../catalog.js';

// ═══════════════════════════════════════════════════════════════
//  SYNC GRID: moves and passives of a pair, and a grid builder (rules in grid.js)
// ═══════════════════════════════════════════════════════════════
const G = { pairId: '', detail: null, err: '', ix: null, active: new Set(), pending: new Set(), blocked: new Map(), moveLevel: 5, energyCap: energyCapFor(5), sel: null, panel: 'tile', sub: 'moves', focus: null, statLevel: '', form: 0, extra: {}, buildId: null,
  name: '', purpose: '', visibility: 'private', saved: null, hash: '', msg: '', from: '', openedId: 0, draft: false, readonly: false, moreShared: false };
const gridZoom = () => { try { return +localStorage.getItem('gym-grid-zoom') || 1; } catch { return 1; } };
const setZoom = z => { try { localStorage.setItem('gym-grid-zoom', Math.max(0.4, Math.min(2.4, z)).toFixed(2)); } catch { /* private mode */ } };
// the grid page lives at #/grid/… and, for a link shared with anyone, at #/g/…
const onGridPage = () => /^#\/(grid|g)\//.test(location.hash);
const BUILD_WHY = { 'not-adjacent': 'next to no active tile', 'move-level': 'needs a higher move level', energy: 'over the energy limit', unknown: 'tile no longer exists' };

// A grid opened from its "anyone with the link" address: signed in or not. It is fetched by its token and shown like any other member's grid.
export function renderSharedGrid(token = '') {
  const head = `<div class="toolbar"><h1>${t('Sync Grid')}</h1></div>`;
  if (G.pub?.token !== token) {
    G.pub = { token, state: 'loading' };
    api.sharedGrid(token).then(b => { if (G.pub?.token === token) { G.pub = { token, state: b ? 'ok' : 'gone', build: b }; hooks.route(); } })
      .catch(() => { if (G.pub?.token === token) { G.pub = { token, state: 'gone' }; hooks.route(); } });
  }
  if (G.pub.state === 'loading') return `${head}<p class="muted">${t('Loading…')}</p>`;
  if (G.pub.state === 'gone') return `${head}<div class="empty card"><h2>${t('This grid is not shared any more')}</h2><p class="muted">${t('Its owner may have changed who can see it, or the link is wrong.')}</p></div>`;
  const b = G.pub.build;
  if (!S.builds.some(x => x.id === b.id)) S.builds = [...S.builds, b];
  return renderGrid(b.pair_id, b.id);
}
export function renderGrid(pairId = '', buildId = '') {
  if (!pairId) return gridHome();
  if (G.pairId !== pairId || G.me !== S.me || (buildId && G.openedId !== +buildId)) {   // another account on the same page starts from a clean state
    Object.assign(G, { me: S.me, pairId, detail: null, err: '', ix: null, active: new Set(), pending: new Set(), blocked: new Map(), sel: null, panel: 'tile', sub: 'moves', focus: null, statLevel: '', form: 0, extra: {}, buildId: null, name: '', purpose: '', visibility: 'private', saved: null, msg: '', moveLevel: 5, energyCap: energyCapFor(5), from: '', openedId: 0, draft: false, readonly: false, moreShared: false });
    const mine = ownedPair(S.me, pairId);
    if (mine) { G.moveLevel = Math.min(5, mine.level || 5); G.energyCap = energyCapFor(G.moveLevel); }
    const b = buildId && S.builds.find(x => x.id === +buildId);
    if (b && b.user_id && b.user_id === S.me) Object.assign(G, { buildId: b.id, openedId: b.id, name: b.name, purpose: b.purpose, visibility: b.visibility, moveLevel: b.move_level, energyCap: energyCapFor(b.move_level), active: new Set(b.nodes), saved: b });
    else if (b) Object.assign(G, { buildId: null, openedId: b.id, readonly: true, from: authorOf(b), name: b.name, purpose: b.purpose, visibility: 'gym', moveLevel: b.move_level, energyCap: energyCapFor(b.move_level), active: new Set(b.nodes), saved: b });   // someone else's grid: view only; "Copy to my builds" makes one you can edit
    else { const d = loadDraft(pairId); if (d) Object.assign(G, { name: d.name || '', purpose: d.purpose || '', visibility: d.visibility || 'private', moveLevel: d.moveLevel, energyCap: energyCapFor(d.moveLevel), active: new Set(d.nodes), draft: true }); }
    const dexId = pairById(pairId) && dexIdOf(pairById(pairId));
    (dexId ? loadPairDetail(dexId) : Promise.reject(new Error('unmapped'))).then(d => { G.detail = d; G.ix = indexGrid(markArc(d.grid || [], pairById(pairId)?.trainer)); G.hash = gridHash(d.grid || []); if (onGridPage()) hooks.route(); })
      .catch(() => { G.err = 'load'; if (onGridPage()) hooks.route(); });
  }
  const p = pairById(pairId);
  const head = `<div class="toolbar"><h1>${t('Sync Grid')}</h1><a class="btn ghost" href="#/grid">${ico('left')} ${t('All builds')}</a></div>`;
  if (G.err) return head + `<div class="card pad"><p class="muted">${t('The grid of this pair could not be loaded. Try again later.')}</p></div>`;
  if (!G.detail) return head + `<p class="muted">${t('Loading…')}</p>`;
  const noGrid = !G.ix.grid.length;
  return `${head}${pairHeader(p)}${noGrid ? `<div class="card pad"><p class="muted">${t('This pair has no grid in the datamine yet.')}</p></div><div id="grid-side">${pairPanel()}</div>`
    : `<div id="grid-bar">${buildBar()}</div><div class="grid-layout"><div class="gp-board card" id="grid-board">${gridBoard()}</div><aside class="gp-panel card" id="grid-side">${gridSide()}</aside></div>`}`;
}


// ── small drawn marks: one per tile kind, so a tile is told apart by shape as well as by colour ──
const GLYPH = {
  blue: '<path d="M0 -4.6 L4 0.4 H1.6 V4.6 H-1.6 V0.4 H-4 Z"/>',
  green: '<path fill="none" d="M-3.8 0.6 L0 -3.2 L3.8 0.6 M-3.8 4.6 L0 0.8 L3.8 4.6"/>',
  red: '<path d="M0 -4.8 L1.3 -1.3 L4.8 0 L1.3 1.3 L0 4.8 L-1.3 1.3 L-4.8 0 L-1.3 -1.3Z"/>',
  yellow: '<circle r="3.6" fill="none"/><circle r="1.2"/>',
  arc: '<path d="M0 -5.2 L1.5 -1.7 L5.2 -1.5 L2.4 0.9 L3.2 4.6 L0 2.7 L-3.2 4.6 L-2.4 0.9 L-5.2 -1.5 L-1.5 -1.7Z"/>',
  rainbow: '<path fill="none" d="M0 -4.8 L4.2 -2.4 V2.4 L0 4.8 L-4.2 2.4 V-2.4Z"/><path d="M0 -1.8 L1.6 -0.9 V0.9 L0 1.8 L-1.6 0.9 V-0.9Z"/>',
};
const glyph = (k, size = 12) => `<svg class="gl" viewBox="-6 -6 12 12" width="${size}" height="${size}" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${GLYPH[k] || ''}</svg>`;
const hexPip = (on) => `<svg class="hp ${on ? 'on' : ''}" viewBox="-6 -6 12 12" width="14" height="14" aria-hidden="true"><polygon points="${hexPts(0, 0, 5.4)}"/></svg>`;

// ── the header: who this pair is, as the game shows it ──
// The game's pictures live at pmrandom, with Serebii as the backup for what pmrandom does not have (yet), then the Dex sprites.
// The index of the forms and the list of backups are read once; until then the plain pmrandom address is tried.
let artData = null;
async function loadArt() {
  if (artData !== null) return;
  artData = false;
  try { const r = await fetch('data/pkmn-art.json'); if (r.ok) artData = await r.json(); } catch { /* the Dex sprites stay */ }
  if (artData && onGridPage() && G.detail) redrawHead();
}
// A picture that does not load is replaced by the next address of its list (data-fb, separated by |) until none is left
window.plFallback = img => {
  const next = (img.dataset.fb || '').split('|').filter(Boolean), wrap = img.closest('.pl-art');
  if (!next.length) { img.onerror = null; return; }
  img.dataset.fb = next.slice(1).join('|'); img.src = next[0];
  wrap?.classList.remove('sb', 'fb'); if (artKind(next[0])) wrap?.classList.add(artKind(next[0]));
};
const redrawHead = () => { const h = $('#pair-head'); if (h) h.outerHTML = pairHeader(pairById(G.pairId)); };
function pairHeader(p) {
  loadArt();
  const d = G.detail, own = ownedPair(S.me, G.pairId);
  const view = pairForms()[G.form] || pairForms()[0], baseType = d.type || p?.type, formType = view.type || baseType, tc = TYPE_COLORS[formType] || '#8d99a6', bk = (p && artData?.backup?.[`${p.dex}|${p.pnum}`]) || {};
  // trainer: the game's 2D art (the EX pose when the member has this pair at EX); Pokémon: the render of the form picked in the side panel.
  // Where the index knows pmrandom lacks a picture, Serebii's comes first.
  const tList = [bk.t ? trainerBackup(bk.t) : trainerArt(p, own?.ex && p?.exPose), d.trainerSprite ? DEX + d.trainerSprite : ''];
  // a form that looks like the normal form (the Dex shows the same sprite for both) takes the normal form's picture
  const stem = p?.iPoke ? formStem(view, p.iPoke, artData?.pkmn) || (view.kind === 'form' && view.sprite === d.pokeSprite ? p.iPoke : '') : '';
  const pList = [stem ? (bk.p && stem === p.iPoke ? pokeBackup(bk.p) : pokeArt(stem)) : view.kind === 'base' && bk.p ? pokeBackup(bk.p) : '', view.sprite ? DEX + view.sprite : (d.pokeSprite ? DEX + d.pokeSprite : '')];
  const art = (list, cls, alt) => { const [first, ...rest] = list.filter(Boolean); return first ? `<span class="pl-art ${cls} ${artKind(first)}"><img src="${esc(first)}" data-fb="${esc(rest.join('|'))}" alt="${esc(alt)}" referrerpolicy="no-referrer" onerror="plFallback(this)"></span>` : ''; };
  const fact = (k, v) => v ? `<div><dt>${t(k)}</dt><dd>${v}</dd></div>` : '';
  const stars = d.rarity ? `<span class="pl-stars" role="img" aria-label="${d.rarity}★">${Array.from({ length: 5 }, (_, i) => hexPip(i < d.rarity)).join('')}</span>` : '';
  return `<section class="gp-head plate" id="pair-head" style="--tc:${tc}">
    <div class="pl-stage">${art(tList, 'trainer', d.trainer)}${art(pList, 'poke', view.label)}${!tList.some(Boolean) && !pList.some(Boolean) && p ? pairIcon(p, 'lg', own?.ex) : ''}<i class="pl-base"></i>${view.kind !== 'base' ? `<b class="pl-form mk mk-${view.mech.key}">${view.mech.short}</b>` : ''}</div>
    <div class="pl-id"><small class="pl-no">${d.number ? `№ ${String(d.number).padStart(3, '0')}` : t('Sync pair')}${d.shiny ? ` · ${t('Shiny')}` : ''}${view.kind !== 'base' ? ` · ${esc(view.label)}` : d.form ? ` · ${esc(d.form)}` : ''}</small>
      <h2>${esc(p ? p.trainer : d.trainer)} <i>&amp;</i> ${esc(p ? p.pokemon : d.pokemon)}</h2>
      <dl class="pl-facts">
        ${fact('Type', `${img(typeIcon(formType), 'ti', formType)}${esc(t(formType || ''))}${formType !== baseType ? ` <small class="was" title="${esc(t('Type of the normal form'))}">← ${esc(t(baseType || ''))}</small>` : ''}`)}
        ${fact('Role', d.role ? `${img(roleIcon(d.role), 'ri', d.role)}${esc(d.role)}` : '')}
        ${fact('EX role', d.exRole ? `${img(roleIcon(d.exRole, true), 'ri', d.exRole)}${esc(d.exRole)}` : '')}
        ${fact('Weak to', d.weakness ? `${img(typeIcon(d.weakness), 'ti', d.weakness)}${esc(t(d.weakness))}` : '')}
        ${fact('Rarity', stars)}
      </dl></div>
    <div class="pl-stamp ${own ? 'own' : ''}">${own ? `<b>${t('Usable')}</b><small>${t('you own this pair')}</small>` : `<b>${t('Theoretical')}</b><small>${t('not in your roster')}</small>`}</div></section>`;
}

// A few grids end with the dataminer's separator ("=====END=====") instead of a tile name: show what the tile is instead
const JUNK = /^[=\-\s]*END[=\-\s]*$|^[=\-_]{5,}$/;
const tileTitle = c => (JUNK.test(String(c.title || '')) ? `${t(COLORS[c.color]?.[0] || 'Tile')} #${c.n}` : c.title);
// ── the board ──
const SIZE = 38;
const hexPts = (x, y, r) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 180 * (60 * i); return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`; }).join(' ');
// A tile's name, broken into at most three short lines that fit inside a hex
function tileLines(title) {
  const words = String(title).replace(/\s+/g, ' ').trim().split(' '), lines = [''];
  for (const w of words) {
    const cur = lines.at(-1);
    if ((cur + ' ' + w).trim().length <= 10) lines[lines.length - 1] = (cur + ' ' + w).trim();
    else if (lines.length < 3) lines.push(w.length > 10 ? `${w.slice(0, 9)}…` : w);
    else { lines[2] = `${lines[2].slice(0, 9)}…`; break; }
  }
  return lines.filter(Boolean);
}
// ── picking tiles: a tile next to the centre or an active tile switches on; a far one is picked ahead and waits until the tiles
//    between it and the centre are on (src/grid.js settle) ──
const gOpts = () => ({ moveLevel: G.moveLevel, energyCap: G.energyCap });
function gSettle() { const r = settle(G.ix, G.active, G.pending, gOpts()); G.active = r.active; G.pending = r.pending; G.blocked = r.blocked; }
const gGap = n => linkGap(G.ix, G.active, G.pending, n);
function pickTile(c) {
  if (G.active.has(c.n)) {
    if (canRemove(G.ix, G.active, c)) G.active.delete(c.n); else toast(t('Other tiles hang on this one: switch those off first.'), true);
  } else if (G.pending.has(c.n)) G.pending.delete(c.n);
  else {
    const why = whyNot(G.ix, G.active, c, gOpts());
    if (!why) G.active.add(c.n);
    else if (why === 'not-adjacent' && levelNeeded(c) <= G.moveLevel) {
      G.pending.add(c.n);
      const gap = gGap(c.n);
      toast(gap ? t('{tile} is picked and waits: {n} more tiles to link it to the centre.', { tile: tileTitle(c), n: gap }) : t('{tile} is picked.', { tile: tileTitle(c) }));
    } else toast(`${tileTitle(c)}: ${t(BUILD_WHY[why === 'not-adjacent' ? 'move-level' : why])}`, true);
  }
  gSettle();
}
function gridBoard() {
  const zoom = gridZoom(), pts = G.ix.grid.map(c => ({ c, ...hexXY(c, SIZE) })), pad = SIZE * 1.5;
  const minX = Math.min(0, ...pts.map(p => p.x)) - pad, maxX = Math.max(0, ...pts.map(p => p.x)) + pad, minY = Math.min(0, ...pts.map(p => p.y)) - pad, maxY = Math.max(0, ...pts.map(p => p.y)) + pad;
  const opts = { moveLevel: G.moveLevel, energyCap: G.energyCap }, t0 = totals(G.ix, G.active), pair = pairById(G.pairId), own = ownedPair(S.me, G.pairId);
  const pips = [1, 2, 3, 4, 5].map(n => `<button class="mlv ${n <= G.moveLevel ? 'on' : ''}" data-gmlv="${n}" aria-label="${t('Move level')} ${n}" title="${t('Move level')} ${n}">${hexPip(n <= G.moveLevel)}</button>`).join('');
  const per = {}; for (const c of G.ix.grid) { (per[c.color] ||= { all: 0, on: 0 }).all++; if (G.active.has(c.n)) per[c.color].on++; }
  return `<div class="gp-hud"><div class="hud-i orb"><small>${t('Sync orbs')}</small><b>${fmtN(t0.orbs)}</b></div>
      <div class="hud-i en ${t0.energy >= G.energyCap ? 'full' : ''}"><small>${t('Energy')}</small><b>${t0.energy}</b><span class="cap" title="${t('Energy limit')}: ${t('60 plus 2 for each move level')}"> / ${G.energyCap}</span></div>
      ${own && G.moveLevel > Math.min(5, own.level || 1) ? `<div class="hud-i th" title="${t('Move level above what you have: this build is theoretical until the move is levelled')}"><small>${t('Build')}</small><b>${t('Theoretical')}</b></div>` : ''}
      ${G.pending.size ? `<div class="hud-i pd" title="${t('Picked tiles waiting to be linked to the centre')}"><small>${t('Waiting')}</small><b>${G.pending.size}</b></div>` : ''}
      <div class="hud-i lv" title="${t('Move level')}"><small>${t('Move level')}</small><span class="mlvs">${pips}</span></div>
      <span class="hud-sp"></span>
      <div class="hud-zoom"><button class="hud-b" data-gzoom="-0.2" aria-label="${t('Zoom out')}">−</button><button class="hud-b" data-gzoom="0.2" aria-label="${t('Zoom in')}">+</button><button class="hud-b wide" data-gfit>${t('Fit')}</button></div></div>
    <div class="gp-legend">${Object.entries(COLORS).filter(([k]) => per[k]).map(([k, [l]]) => `<button class="lg k-${k} ${G.focus === k ? 'on' : ''}" data-gfocus="${k}">${glyph(k, 13)}<span>${t(l)}</span><small>${per[k].on}/${per[k].all}</small></button>`).join('')}</div>
    <div class="grid-scroll"><svg viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" style="width:${Math.round((maxX - minX) * zoom)}px" class="${G.focus ? 'focus' : ''}" data-focus="${G.focus || ''}" role="img" aria-label="${t('Sync grid')}">
      <defs><linearGradient id="g-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7dc7a"/><stop offset=".5" stop-color="#e6b422"/><stop offset="1" stop-color="#b8860b"/></linearGradient><clipPath id="g-clip"><polygon points="${hexPts(0, 0, SIZE - 5)}"/></clipPath>
        ${Object.keys(COLORS).map(k => `<pattern id="g-hatch-${k}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" style="fill:var(--surface)"/><line x1="0" y1="0" x2="0" y2="8" style="stroke:var(--k-${k});stroke-width:3.5"/></pattern>`).join('')}</defs>
      ${pts.map(({ c, x, y }) => {
        const on = G.active.has(c.n), wait = !on && G.pending.has(c.n), why = on || wait ? null : whyNot(G.ix, G.active, c, opts), lines = tileLines(tileTitle(c));
        const y0 = y - (lines.length - 1) * 5.3 + 5;
        return `<g class="g-tile ${on ? 'on' : wait ? 'pending' : why ? 'locked' : 'open'} ${!on && !wait && levelNeeded(c) > G.moveLevel ? 'lvlock' : ''} ${G.sel === c.n ? 'sel' : ''} k-${c.color}" data-gtile="${c.n}" data-color="${c.color}" tabindex="0" role="button" aria-label="${esc(tileTitle(c))}">
          <polygon class="g-out" points="${hexPts(x, y, SIZE - 1)}"/><polygon class="g-in" points="${hexPts(x, y, SIZE - 5.5)}"/>
          <g class="g-gl" transform="translate(${x} ${y - 19}) scale(1.05)" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round">${GLYPH[c.color] || ''}</g>
          ${!on && levelNeeded(c) > G.moveLevel ? `<text class="g-lv" x="${x}" y="${y + SIZE - 9}" text-anchor="middle">Lv ${levelNeeded(c)}</text>` : ''}
          <text class="g-t" x="${x}" y="${y0}" text-anchor="middle">${lines.map((l, i) => `<tspan x="${x}" dy="${i ? 10.6 : 0}">${esc(l)}</tspan>`).join('')}</text>
</g>`;
      }).join('')}
      <g class="g-core"><polygon class="g-ring" points="${hexPts(0, 0, SIZE + 2)}"/><polygon class="g-ring2" points="${hexPts(0, 0, SIZE - 3)}"/>${pair ? `<image href="${esc(pairImage(pair, own?.ex, own?.stars))}" x="${-(SIZE - 7)}" y="${-(SIZE - 7)}" width="${(SIZE - 7) * 2}" height="${(SIZE - 7) * 2}" clip-path="url(#g-clip)" preserveAspectRatio="xMidYMid slice"/>` : ''}</g>
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
  const tile = c ? (() => { const on = G.active.has(c.n), wait = G.pending.has(c.n), why = on || wait ? null : whyNot(G.ix, G.active, c, opts);
    const ahead = why === 'not-adjacent' && levelNeeded(c) <= G.moveLevel, gap = wait ? gGap(c.n) : ahead ? gGap(c.n) + 1 : 0, wwhy = wait ? G.blocked.get(c.n) : null;
    return `<article class="tile-card k-${c.color}"><header><span class="tc-kind">${glyph(c.color, 14)}${t(COLORS[c.color]?.[0] || c.color)}</span><span class="tc-n">#${c.n}</span></header>
      <h3>${esc(tileTitle(c))}</h3>${c.description ? `<p class="pre">${esc(c.description)}</p>` : ''}
      <dl class="tc-cost"><div class="en"><dt>${t('Energy')}</dt><dd>${c.energy}</dd></div><div class="orb"><dt>${t('Sync orbs')}</dt><dd>${fmtN(c.orbs)}</dd></div></dl>
      ${(c.req || []).length ? `<ul class="tc-req">${c.req.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
      ${otherReqs(c).length ? `<p class="notice">${ico('note')} ${t('This app only checks the move level; the other requirements are on you.')}</p>` : ''}
      ${wait ? `<p class="notice">${ico('note')} ${wwhy === 'move-level' ? t(BUILD_WHY['move-level']) : wwhy === 'energy' ? t(BUILD_WHY.energy) : t('Picked ahead: it switches on when the tiles between it and the centre are on ({n} more to pick).', { n: gap })}</p>` : ahead ? `<p class="notice">${ico('note')} ${t('Not linked yet. Pick it ahead: it switches on by itself once the {n} tiles needed to reach it are on.', { n: gap })}</p>` : why ? `<p class="notice">${ico('lock')} ${t(BUILD_WHY[why === 'not-adjacent' ? 'move-level' : why])}</p>` : ''}
      <button class="btn ${on || wait ? 'ghost' : 'primary'} block" data-gtoggle="${c.n}" ${why && !ahead ? 'disabled' : ''}>${on ? t('Switch off') : wait ? t('Cancel pick') : ahead ? t('Pick ahead') : t('Switch on')}</button></article>`; })()
    : `<div class="tile-card empty"><p class="muted">${G.readonly ? t('Tap a tile to read it. To change this grid, copy it to your builds first.') : t('Tap a tile to read it and switch it on or off. A far tile can be picked ahead: it switches on when the tiles in between are on.')}</p></div>`;
  return `${tile}
  <div class="build-card form"><h3>${t('Your build')}</h3>
    <div class="gstats"><span><b>${t0.tiles}</b><small>${t('tiles')}</small></span><span><b>${t0.energy}</b><small>${t('energy')} / ${G.energyCap}</small></span><span><b>${fmtN(t0.orbs)}</b><small>${t('sync orbs')}</small></span></div>
    ${G.pending.size ? `<p class="notice pd">${ico('note')} ${t('{n} picked tiles are waiting to be linked. They are not part of the build, and not saved, until they switch on.', { n: G.pending.size })} <button type="button" class="btn sm ghost" data-gclear-pending>${t('Clear')}</button></p>` : ''}
    <div class="chips-l">${Object.entries(t0.byColor).map(([k, n]) => `<span class="chip kind k-${k}">${glyph(k, 11)}${n} ${t(COLORS[k]?.[0] || k)}</span>`).join('')}</div>
    <div class="grid2" style="margin-top:8px"><label>${t('Move level')}<select id="g-level" ${G.readonly ? 'disabled' : ''}>${[1, 2, 3, 4, 5].map(n => `<option ${n === G.moveLevel ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
    ${own && needed > (own.level || 1) && own.level < 5 ? `<p class="notice">${ico('lock')} ${t('Not usable yet')}: ${t('your move level is {n}', { n: Math.min(5, own.level) })}</p>` : ''}
    ${problems.length ? `<p class="notice">${ico('lock')} ${t('This build breaks the rules:')} ${[...new Set(problems.map(p => t(BUILD_WHY[p.code])))].join(', ')}</p>` : ''}
    ${changed ? `<p class="notice">${ico('note')} ${t('The game data of this pair changed after this build was saved. Check the tiles.')}</p>` : ''}
</div>`;
}

// ── moves, passives, team skills and facts, laid out like the game's pair screen ──
const STAT_ROWS = [['HP', 'HP', '#dff3d6'], ['Attack', 'Atk', '#fde6cf'], ['Defense', 'Def', '#fbf3c8'], ['Sp. Atk', 'Sp.Atk', '#d6e7fb'], ['Sp. Def', 'Sp.Def', '#e5ddf8'], ['Speed', 'Speed', '#fadbec']];
const CAT = { physical: ['Physical', '#e8741f'], special: ['Special', '#3c8de8'], status: ['Status', '#8d99a6'] };
// The text of a move or passive: the activation condition, the deactivation condition and the effect each on their own line
function describe(text) {
  const d = splitDescription(text);
  return `${d.activation ? `<p class="cond act"><b>${t('Activation condition')}</b>${esc(d.activation)}</p>` : ''}${d.deactivation ? `<p class="cond deact"><b>${t('Deactivation condition')}</b>${esc(d.deactivation)}</p>` : ''}${d.rest ? `<p class="pre">${esc(d.rest)}</p>` : ''}`;
}
// A move or passive that this form changes wears the form's mark and says what it replaces
const changedMark = (x, f) => x.changed && f && f.kind !== 'base' ? `<span class="rb chg">${f.mech.short}</span>` : '';
const replacesLine = x => (x.replaces || x.from) ? `<p class="mv-from">${t('replaces')} <b>${esc(x.replaces || x.from)}</b></p>` : '';
function moveCard(m, sync = false, f = null) {
  if (!m) return '';
  const col = TYPE_COLORS[m.type] || '#8d99a6', cat = CAT[String(m.category || '').toLowerCase()] || [m.category || '', '#8d99a6'], gauge = count(m.gauge), limit = count(m.maxUses);
  const special = m.slot === 'Tera' ? t('Tera move') : m.slot === 'Max' ? t('Max move') : '';
  return `<article class="mv move ${sync || m.isSync ? 'sync' : ''} ${m.changed && f && f.kind !== 'base' ? `changed mk-${f.mech.key}` : ''}" style="--c:${col}" data-gmove="${esc(m.name || '')}"><header>${m.type ? img(typeIcon(m.type), 'ti', m.type) : ''}<h4>${esc(m.name || '')}</h4>
      ${sync || m.isSync ? `<span class="rb">${t('Sync move')}</span>` : special ? `<span class="rb">${special}</span>` : ''}${special ? '' : changedMark(m, f)}${gauge ? `<span class="pips" title="${t('Move gauge needed')}: ${gauge}" aria-label="${t('Move gauge needed')}: ${gauge}">${Array.from({ length: Math.min(gauge, 8) }, () => '<i></i>').join('')}</span>` : ''}</header>
    ${replacesLine(m)}
    <dl class="mv-facts"><div><dt>${t('Category')}</dt><dd><span class="cat cat-${String(m.category || '').toLowerCase()}" style="--k:${cat[1]}">${t(cat[0])}</span></dd></div><div><dt>${t('Target')}</dt><dd>${esc(m.target || '—')}</dd></div>
      <div><dt>${t('Power')}</dt><dd>${esc(m.power || '—')}</dd></div><div><dt>${t('Accuracy')}</dt><dd>${esc(m.accuracy && m.accuracy !== '--' ? m.accuracy : '—')}</dd></div>
      ${limit ? `<div class="lim"><dt>${t('Max uses')}</dt><dd>${limit}</dd></div>` : ''}${m.effectTag && m.effectTag !== '--' ? `<div><dt>${t('Effect')}</dt><dd>${esc(m.effectTag)}</dd></div>` : ''}</dl>
    <div class="mv-text">${describe(m.description)}</div></article>`;
}
const passiveCard = (x, kind = '', f = null) => `<article class="mv passive ${kind} ${x.changed && f && f.kind !== 'base' ? `changed mk-${f.mech.key}` : ''}" style="--c:${kind === 'super' ? '#bf80ff' : '#e5b143'}"><header><h4>${esc(x.name || '')}</h4>${x.master ? `<span class="rb">${t('Master')}</span>` : kind === 'super' ? `<span class="rb">${t('Super')}</span>` : kind === 'tera' ? `<span class="rb">${t('Tera passive')}</span>` : ''}${changedMark(x, f)}</header>${replacesLine(x)}<div class="mv-text">${describe(x.description)}</div></article>`;
// Does a form have other stats than the normal form (at any level)?
const formStatsDiffer = (form, base) => Object.keys(form.stats || {}).some(l => STATS.some(k => (+form.stats[l]?.[k] || 0) !== (+base.stats?.[l]?.[k] || 0)));
// A pair can have several forms (Mega, Tera, Dynamax, a form after a move…), each with its own complete moveset and stats
const pairForms = () => formViews(G.detail);
// The move a grid tile belongs to: its title starts with the move's name ("Glorious Thunder: Power ↑ 5")
const moveNames = () => allMoveNames(pairForms());
const tileMove = c => { const ti = String(c.title).toLowerCase(); if (JUNK.test(ti)) return ''; return moveNames().find(n => ti.startsWith(`${n.toLowerCase()}:`) || ti === n.toLowerCase()) || ''; };
function pairPanel() {
  const d = G.detail, forms = pairForms(), form = forms[G.form] || forms[0], levels = Object.keys(form.stats || {}).sort((a, b) => +a - +b);
  const lvl = levels.includes(G.statLevel) ? G.statLevel : (levels.includes('140') ? '140' : levels.at(-1)), st = (form.stats || {})[lvl] || {};
  const subs = [['moves', 'Moves'], ['passives', 'Passives'], ['team', 'Team skills'], ['facts', 'Info']];
  const note = form.kind !== 'base' ? `<div class="mech-note mk-${form.mech.key}"><b class="mk">${form.mech.short}</b><span>${esc(form.label)}${form.teraType ? ` · ${t('Tera type')} ${esc(t(form.teraType))}` : ''}</span><small>${esc(t(form.mech.note))}</small>
    <ul class="mech-diff">${form.type !== (d.type || '') ? `<li>${t('Type: {a} → {b}', { a: t(d.type || ''), b: t(form.type) })}</li>` : ''}<li>${formStatsDiffer(form, forms[0]) ? t('Stats differ from the normal form (▲ ▼ on the stat bars).') : t('Stats are the same as the normal form.')}</li></ul></div>` : '';
  const special = [...(form.sync ? [[form.sync, true]] : []), ...form.extra.map(m => [m, false])];
  const body = G.sub === 'moves' ? `${note}${form.moves.map(m => moveCard(m, false, form)).join('')}${special.length ? `<div class="mv-sep"><span>${t('Special moves')}</span></div>${special.map(([m, sy]) => moveCard(m, sy, form)).join('')}` : ''}${!form.moves.length && !special.length ? `<p class="muted">—</p>` : ''}`
    : G.sub === 'passives' ? `${note}${form.passives.map(x => passiveCard(x, '', form)).join('')}${form.extraPassives.map(x => passiveCard(x, 'tera', form)).join('')}${form.superPassive ? passiveCard(form.superPassive, 'super') : ''}${!form.passives.length && !form.extraPassives.length && !form.superPassive ? `<p class="muted">—</p>` : ''}`
    : G.sub === 'team' ? ((d.teamSkills || []).length ? `<div class="chips-l">${d.teamSkills.map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div>` : `<p class="muted">—</p>`)
    : `<dl class="kv">${[['Role', d.role], ['EX role', d.exRole], ['Type', d.type && t(d.type)], ['Weakness', d.weakness && t(d.weakness)], ['Acquired', d.method || d.expedition || d.collectInfo], ['Game version', d.version || (d.versions || []).at(-1)], ['Sync pair released', d.dates?.['Sync Pair'] && String(d.dates['Sync Pair']).slice(0, 10)], ['EX released', d.dates?.['EX Effect'] && String(d.dates['EX Effect']).slice(0, 10)]]
        .filter(r => r[1]).map(([k, v]) => `<dt>${t(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${d.description ? `<p class="pre">${esc(d.description)}</p>` : ''}`;
  const bonus = gridBonus(G.ix, G.active), total = totalStats(st, bonus, G.extra), withGrid = [...G.active].length > 0, edited = STATS.some(k => +G.extra[k]);
  return `${forms.length > 1 ? `<div class="form-tabs">${forms.map((f, i) => `<button class="${i === G.form ? 'on' : ''} mk-${f.mech.key}" data-gform="${i}" title="${esc(t(f.mech.name))}">${f.sprite ? `<img src="${esc(DEX + f.sprite)}" alt="" width="28" height="28" loading="lazy" onerror="this.remove()">` : ''}<span class="ft"><b class="mk">${f.mech.short}${f.teraType ? ` ${img(typeIcon(f.teraType), 'ti', f.teraType)}` : ''}</b><span>${esc(f.label)}</span></span></button>`).join('')}</div>` : ''}${levels.length ? `<div class="stat-lv">${levels.map(l => `<button class="${l === lvl ? 'on' : ''}" data-gstat="${l}">${t('Lv')} ${l}</button>`).join('')}</div>
    <div class="stat-row">${STAT_ROWS.map(([k, label]) => { const dl = form === forms[0] ? 0 : (+st[k] || 0) - (+(forms[0].stats?.[lvl]?.[k]) || 0); return `<div${dl ? ` title="${esc(t('Against the normal form'))}: ${dl > 0 ? '+' : ''}${dl}"` : ''}><small>${label}</small><b>${st[k] ?? '—'}</b>${dl ? `<em class="dl ${dl > 0 ? 'up' : 'down'}">${dl > 0 ? '▲' : '▼'}${Math.abs(dl)}</em>` : ''}<s style="--w:${Math.round((+st[k] || 0) / Math.max(1, ...STAT_ROWS.map(([j]) => +st[j] || 0)) * 100)}%"></s></div>`; }).join('')}</div>
    ${G.ix?.grid.length ? `<div class="stat-build"><h4>${t('With your build')} <small class="muted">${t('level {l} + {n} switched-on tiles', { l: lvl, n: G.active.size })}</small></h4>
      <div class="stat-row total">${STAT_ROWS.map(([k, label]) => `<div><small>${label}</small><b>${total[k] || '—'}</b><s style="--w:${Math.round((+total[k] || 0) / Math.max(1, ...STAT_ROWS.map(([j]) => +total[j] || 0)) * 100)}%"></s><em>${bonus[k] || G.extra[k] ? `+${bonus[k] + (+G.extra[k] || 0)}` : ''}</em></div>`).join('')}</div>
      <details class="stat-extra" ${edited ? 'open' : ''}><summary>${t('Add EX / EX role bonuses')}</summary>
        <p class="muted">${t('The datamine does not list what EX and the EX role add to the stats. Type the bonuses you know and they are added to the totals above.')}</p>
        <div class="stat-in">${STAT_ROWS.map(([k, label]) => `<label>${label}<input type="text" inputmode="numeric" maxlength="3" data-gextra="${esc(k)}" value="${G.extra[k] || ''}" placeholder="0"></label>`).join('')}</div></details></div>` : ''}` : ''}
    <div class="gp-sub">${subs.map(([k, l]) => `<button class="${G.sub === k ? 'on' : ''}" data-gsub="${k}">${t(l)}</button>`).join('')}</div>
    <div class="mv-list">${body}</div><p class="muted">${t('Each text starts with its condition, as the game writes it.')}</p>`;
}

// ── the pair list: every sync pair, newest first, with filters ──
const GF = { allShared: false, q: '', type: '', role: '', rarity: '', acq: '', ex: false, owned: false, withGrid: false, sort: 'new', shown: 48 };
const isNew = p => p.release && Date.now() - Date.parse(p.release) < 30 * 864e5;
// The filters of the pair list; the shared grids above the list follow them too
function pairOk(p) {
  const q = GF.q.trim().toLowerCase();
  return (!q || `${p.trainer} ${p.pokemon}`.toLowerCase().includes(q)) && (!GF.type || p.type === GF.type) && (!GF.role || p.role === GF.role)
    && (!GF.rarity || String(p.rarity) === GF.rarity) && (!GF.acq || p.acquisition === GF.acq) && (!GF.ex || p.exRole) && (!GF.owned || ownedPair(S.me, p.id)) && (!GF.withGrid || dexIdOf(p));
}
function filteredPairs() {
  const list = PAIRS().filter(pairOk);
  const by = { acq: (a, b) => byAcquisition(a, b) || a.trainer.localeCompare(b.trainer), new: (a, b) => (b.release || '').localeCompare(a.release || ''), old: (a, b) => (a.release || '9').localeCompare(b.release || '9'), name: (a, b) => a.trainer.localeCompare(b.trainer) || a.pokemon.localeCompare(b.pokemon), type: (a, b) => (a.type || '').localeCompare(b.type || '') || (b.release || '').localeCompare(a.release || '') };
  return list.sort((a, b) => by[GF.sort](a, b) || a.trainer.localeCompare(b.trainer));
}
function pairTile(p) {
  const own = ownedPair(S.me, p.id), has = !!dexIdOf(p);
  return `<a class="pt ${has ? '' : 'nogrid'}" href="#/grid/${encodeURIComponent(p.id)}" title="${esc(pairName(p))}${has ? '' : ` — ${t('no grid data yet')}`}">
    <span class="pt-img">${pairIcon(p, 'md', own?.ex)}${isNew(p) ? `<b class="pt-new">${t('New')}</b>` : ''}${own ? `<b class="pt-own" title="${t('you own this pair')}">✓</b>` : ''}</span>
    <span class="pt-name">${esc(p.trainer)}</span><span class="pt-poke">${esc(p.pokemon)}</span>
    <span class="pt-meta">${img(typeIcon(p.type), 'ti', p.type)}<small>${esc(p.role || '')}${p.exRole ? ' · EX' : ''}</small></span>
    <small class="pt-date">${p.release ? esc(p.release) : ''}${GF.sort === 'acq' ? ` · ${acqLabel(p.acquisition)}` : ''}</small></a>`;
}
// Grids the gym members shared, one short line per grid (the pair's icon says which pair), following the filters of the list
function sharedStrip() {
  const list = S.builds.filter(b => b.user_id !== S.me && b.visibility !== 'private').map(b => ({ b, p: pairById(b.pair_id) })).filter(x => x.p && pairOk(x.p));
  if (!list.length) return '';
  const shown = GF.allShared ? list : list.slice(0, 12);
  return `<section class="gh-shared"><div class="gh-h"><b>${t('Shared by the gym')}</b> <small>${list.length}</small></div>
    <div class="gh-row">${shown.map(({ b, p }) => `<a class="gh-chip" href="#/grid/${encodeURIComponent(b.pair_id)}/${b.id}" title="${esc(pairName(p))} · ${esc(b.name)} · ${esc(authorOf(b))} · ${esc(capText(b))}">${pairIcon(p, 'xs')}<span><b>${esc(b.name)}</b><small>${esc(authorOf(b))}</small></span></a>`).join('')}
    ${list.length > 12 ? `<button type="button" class="gh-chip more" data-gh-more>${GF.allShared ? t('Show fewer') : t('Show {n} more', { n: list.length - 12 })}</button>` : ''}</div></section>`;
}
function pairResults() {
  const list = filteredPairs(), shown = list.slice(0, GF.shown);
  return `${sharedStrip()}<p class="muted pt-count">${t('{n} sync pairs', { n: list.length })}${GF.sort === 'new' ? ` · ${t('newest first')}` : ''}</p>
    <div class="pt-grid">${shown.map(pairTile).join('') || `<p class="muted">${t('No sync pair matches.')}</p>`}</div>
    ${list.length > shown.length ? `<div class="row" style="justify-content:center;margin:14px 0"><button class="btn" data-gf-more>${t('Show {n} more', { n: Math.min(48, list.length - shown.length) })} <small class="muted">(${list.length - shown.length})</small></button></div>` : ''}`;
}
function gridHome() {
  const all = PAIRS(), roles = [...new Set(all.map(p => p.role).filter(Boolean))].sort(), acqs = [...new Set(all.map(p => p.acquisition).filter(Boolean))].sort();
  const sel = (key, val, opts, any) => `<select data-gf="${key}"><option value="">${t(any)}</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${val === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  return `<div class="toolbar"><h1>${t('Sync Grid')}</h1></div>
  <p class="muted">${t('Pick any sync pair to read its moves and passives and plan which grid tiles to switch on. Builds are private until you share them with the gym.')}</p>
    <div class="card pad pt-filters"><input id="grid-q" placeholder="${t('Search a sync pair…')}" value="${esc(GF.q)}" autocomplete="off">
    ${sel('type', GF.type, TYPES.map(x => [x, t(x)]), 'All types')}${sel('role', GF.role, roles.map(x => [x, x]), 'All roles')}${sel('rarity', GF.rarity, [['5', '5★'], ['4', '4★'], ['3', '3★']], 'Any stars')}${sel('acq', GF.acq, acqs.map(x => [x, x]), 'Any way to get it')}
    <select data-gf="sort"><option value="new" ${GF.sort === 'new' ? 'selected' : ''}>${t('Newest first')}</option><option value="acq" ${GF.sort === 'acq' ? 'selected' : ''}>${t('Acquisition, newest first')}</option><option value="old" ${GF.sort === 'old' ? 'selected' : ''}>${t('Oldest first')}</option><option value="name" ${GF.sort === 'name' ? 'selected' : ''}>${t('Name')}</option><option value="type" ${GF.sort === 'type' ? 'selected' : ''}>${t('Type')}</option></select>
    <label class="chk"><input type="checkbox" data-gfc="ex" ${GF.ex ? 'checked' : ''}> ${t('EX role')}</label><label class="chk"><input type="checkbox" data-gfc="owned" ${GF.owned ? 'checked' : ''}> ${t('Mine')}</label><label class="chk"><input type="checkbox" data-gfc="withGrid" ${GF.withGrid ? 'checked' : ''}> ${t('Has a grid')}</label>
    <button class="btn sm ghost" data-gf-clear>${t('Clear filters')}</button></div>
  <div id="pair-results">${pairResults()}</div>`;
}

const redrawBoard = () => { const b = $('#grid-board'), sc = $('.grid-scroll'), l = sc?.scrollLeft, tp = sc?.scrollTop; if (b) { b.innerHTML = gridBoard(); const n = $('.grid-scroll'); if (n) { n.scrollLeft = l; n.scrollTop = tp; } } };
const redrawSide = () => { const sd = $('#grid-side'); if (sd) sd.innerHTML = G.ix?.grid.length ? gridSide() : pairPanel(); };
const redrawBar = () => { const b = $('#grid-bar'); if (b) b.innerHTML = buildBar(); };
const gridRedraw = () => { redrawBoard(); redrawSide(); redrawBar(); saveDraft(); };
const gridKeepFields = () => { G.name = $('#g-name')?.value ?? G.name; G.purpose = $('#g-purpose')?.value ?? G.purpose; };
// ── building and naming: a bar above the board holds the name, the save state and the sharing; a draft survives leaving the page ──
const authorOf = b => (b.user_id ? nameOf(profile(b.user_id)) : '') || b.author_name || t('Former member');
const defaultName = () => { const p = pairById(G.pairId), n = S.builds.filter(b => b.user_id === S.me && b.pair_id === G.pairId).length + 1; return `${p ? pairName(p) : G.pairId} ${t('build')} ${n}`; };
const DK = id => `pmex-grid-draft:${S.me}:${id}`;
const loadDraft = id => { try { const d = JSON.parse(localStorage.getItem(DK(id))); return d && Array.isArray(d.nodes) && d.nodes.length ? d : null; } catch { return null; } };
const clearDraft = () => { try { localStorage.removeItem(DK(G.pairId)); } catch { /* no storage */ } };
function saveDraft() {
  if (G.buildId || G.readonly || !G.ix) return;
  try { if (G.active.size) localStorage.setItem(DK(G.pairId), JSON.stringify({ nodes: [...G.active], moveLevel: G.moveLevel, name: G.name, purpose: G.purpose, visibility: G.visibility })); else clearDraft(); } catch { /* no storage */ }
}
const sameNodes = (a, b) => a.length === b.length && [...a].sort((x, y) => x - y).every((n, i) => n === [...b].sort((x, y) => x - y)[i]);
// Saved build: has anything changed since? New build: is there anything to save?
const isDirty = () => { if (!G.buildId) return G.active.size > 0; const s = G.saved; return !!s && (!sameNodes([...G.active], s.nodes) || G.name.trim() !== s.name || (G.purpose || '') !== (s.purpose || '') || G.visibility !== s.visibility || G.moveLevel !== s.move_level); };
const stateOf = () => (G.readonly ? ['ok', t('View only')] : G.buildId ? (isDirty() ? ['dirty', t('Unsaved changes')] : ['ok', t('Saved')]) : G.from ? ['dirty', t('Shared by {n}: saving makes your own copy', { n: G.from })] : G.active.size ? ['dirty', G.draft ? t('Draft restored, not saved yet') : t('Not saved yet')] : ['new', t('New build')]);
const capText = b => `${t('Move level')} ${b.move_level}/5 · ${t('Cap')} ${energyCapFor(b.move_level)}/70`;
// The grids of this pair: yours, then the ones the gym shared (a few first, the rest on demand)
function buildLists() {
  const pid = encodeURIComponent(G.pairId), mine = S.builds.filter(b => b.user_id === S.me && b.pair_id === G.pairId);
  const others = S.builds.filter(b => b.user_id !== S.me && b.visibility !== 'private' && b.pair_id === G.pairId), shown = G.moreShared ? others : others.slice(0, 6);
  const item = (b, who) => `<a class="gb-item ${b.id === G.openedId ? 'on' : ''}" href="#/grid/${pid}/${b.id}"><b>${esc(b.name)}</b><small>${who ? `${esc(authorOf(b))} · ` : ''}${esc(capText(b))}</small></a>`;
  return `<div class="gb-lists"><div><span class="gb-h">${t('Your grids')} <small>${mine.length}</small></span><div class="gb-items">${mine.map(b => item(b, false)).join('')}<a class="gb-item new" href="#/grid/${pid}" data-gnew>+ ${t('New grid')}</a></div></div>
    ${others.length ? `<div><span class="gb-h">${t('Shared by the gym')} <small>${others.length}</small></span><div class="gb-items">${shown.map(b => item(b, true)).join('')}${others.length > 6 ? `<button type="button" class="gb-item more" data-gmore>${G.moreShared ? t('Show fewer') : t('Show {n} more', { n: others.length - 6 })}</button>` : ''}</div></div>` : ''}</div>`;
}
function buildBar() {
  if (!G.ix?.grid.length) return '';
  const t0 = totals(G.ix, G.active), shareRow = (linkOn, linkTip) => `<div class="gb-share"><b>${t('Share')}</b>
      <button class="btn sm" data-gimg="save">${ico('out')} ${t('Save as image')}</button><button class="btn sm ghost" data-gimg="copy">${t('Copy image')}</button>
      <button class="btn sm ghost" data-glink ${linkOn ? '' : 'disabled'} title="${linkOn ? '' : linkTip}">${t('Copy link')}</button></div>`;
  if (G.readonly) {   // someone else's grid: only to look at, or to copy into your own builds
    return `<div class="gb-bar card gb-view"><div class="gb-top"><div class="gb-title"><b>${esc(G.name)}</b><small>${t('by {n}', { n: esc(G.from) })} · ${esc(capText(G.saved))} · ${t('Energy')} ${t0.energy}/${G.energyCap}</small>${G.purpose ? `<small>${esc(G.purpose)}</small>` : ''}</div>
      <span class="gb-state ok" id="g-state" role="status">${t('View only')}</span>${S.me ? `<button class="btn primary" data-gcopy>${t('Copy to my builds')}</button>` : `<button class="btn primary" data-gsignin>${t('Sign in to copy it')}</button>`}</div>
    ${shareRow(true, '')}${S.me ? buildLists() : ''}</div>`;
  }
  const problems = validate(G.ix, [...G.active], { moveLevel: G.moveLevel, energyCap: G.energyCap }), [cls, label] = stateOf();
  const shared = G.buildId && G.visibility !== 'private' && G.saved?.visibility === G.visibility;
  return `<div class="gb-bar card"><div class="gb-top">
      <input id="g-name" class="gb-name" value="${esc(G.name)}" placeholder="${esc(defaultName())}" maxlength="80" autocomplete="off" aria-label="${t('Name')}">
      <span class="gb-state ${cls}" id="g-state" role="status">${esc(label)}</span>
      <button class="btn primary" data-gsave id="g-save" ${problems.length ? 'disabled' : ''}>${t(G.buildId ? 'Save changes' : 'Save build')}</button>
      ${G.buildId && isDirty() ? `<button class="btn ghost" data-greset-saved title="${t('Back to the saved grid')}">${t('Reset')}</button>` : ''}
      <details class="gb-more"><summary class="btn ghost">${t('More')}</summary><div class="gb-menu">
        <label>${t('Purpose')}<input id="g-purpose" value="${esc(G.purpose)}" maxlength="120" placeholder="${t('e.g. Speed and gauge')}"></label>
        ${G.buildId ? `<button class="btn" data-gsave-new ${problems.length ? 'disabled' : ''}>${t('Save as new')}</button><button class="btn ghost" data-gdel>${t('Delete')}</button>` : ''}
        <button class="btn ghost" data-greset>${t('Clear all tiles')}</button></div></details></div>
    ${problems.length ? `<p class="notice">${ico('lock')} ${t('This build breaks the rules:')} ${[...new Set(problems.map(p => t(BUILD_WHY[p.code])))].join(', ')}</p>` : ''}${G.msg ? `<p class="form-err">${esc(G.msg)}</p>` : ''}
    <div class="gb-share"><b>${t('Share')}</b>
      <button class="btn sm" data-gimg="save">${ico('out')} ${t('Save as image')}</button><button class="btn sm ghost" data-gimg="copy">${t('Copy image')}</button>
      <label class="gb-vis">${t('Who can see it')}<select id="g-vis"><option value="private" ${G.visibility === 'private' ? 'selected' : ''}>${t('Only me')}</option><option value="gym" ${G.visibility === 'gym' ? 'selected' : ''}>${t('The whole gym')}</option><option value="link" ${G.visibility === 'link' ? 'selected' : ''}>${t('Anyone with the link')}</option></select></label>
      <button class="btn sm ghost" data-glink ${shared ? '' : 'disabled'} title="${shared ? '' : t('Save the build and share it with the whole gym to get a link')}">${t('Copy link')}</button></div>
    ${G.visibility === 'link' ? `<p class="muted gb-hint">${t('Anyone who has the link can see this grid, even outside the gym.')}</p>` : ''}
    ${buildLists()}</div>`;
}
const refreshState = () => { const [cls, label] = stateOf(), el = $('#g-state'); if (el) { el.className = `gb-state ${cls}`; el.textContent = label; } };
// The picture of the build, written as an SVG with explicit colours and turned into a PNG
const loadImage = src => new Promise(res => { if (!src) return res(null); const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
async function dataUri(src) { const im = await loadImage(src); if (!im) return ''; try { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); return c.toDataURL('image/png'); } catch { return ''; } }
const svgToPng = (svg, w, h, k = 2) => new Promise((res, rej) => {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })), im = new Image();
  im.onload = () => { const c = document.createElement('canvas'); c.width = w * k; c.height = h * k; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url); c.toBlob(b => (b ? res(b) : rej(new Error('png'))), 'image/png'); };
  im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('svg')); };
  im.src = url;
});
async function gridImage(mode, btn) {
  gridKeepFields();
  const p = pairById(G.pairId), own = ownedPair(S.me, G.pairId), t0 = totals(G.ix, G.active);
  btn.disabled = true;
  try {
    const palette = {}, probe = document.createElement('div'); document.body.appendChild(probe);
    for (const k of Object.keys(COLORS)) { probe.className = `k-${k}`; const cs = getComputedStyle(probe); palette[k] = { c: cs.getPropertyValue('--c').trim() || COLORS[k][1], ink: cs.getPropertyValue('--ct').trim() || '#111' }; }
    probe.remove();
    const glyphs = Object.fromEntries(Object.keys(GLYPH).map(k => [k, GLYPH[k]]));
    const per = {}; for (const c of G.ix.grid) { (per[c.color] ||= { all: 0, on: 0 }).all++; if (G.active.has(c.n)) per[c.color].on++; }
    const model = { pair: p ? pairName(p) : G.pairId, type: p?.type, typeColor: TYPE_COLORS[p?.type] || '#8d99a6', name: G.name.trim() || defaultName(), purpose: G.purpose.trim(),
      owner: G.readonly ? G.from : nameOf(profile(S.me)), moveLevel: G.moveLevel, energy: t0.energy, cap: G.energyCap, orbs: t0.orbs, glyphs, palette,
      portrait: p ? await dataUri(pairImage(p, own?.ex, own?.stars)) : '', date: new Date().toISOString().slice(0, 10), footer: 'PMEX Gym Manager',
      legend: Object.entries(COLORS).filter(([k]) => per[k]).map(([k, [l]]) => ({ kind: k, label: t(l), on: per[k].on, all: per[k].all })),
      tiles: G.ix.grid.map(c => ({ ...hexXY(c, SIZE), on: G.active.has(c.n), wait: G.pending.has(c.n), lv: !G.active.has(c.n) && levelNeeded(c) > G.moveLevel ? levelNeeded(c) : 0, color: c.color, lines: tileLines(tileTitle(c)) })) };
    const { svg, width, height } = gridSvg(model, { scale: 1.2 }), blob = await svgToPng(svg, width, height, 2);
    if (mode === 'copy') {
      try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast(t('Image copied.')); return; }
      catch { toast(t('Copying images is not supported here — the image was saved instead.')); }
    }
    const file = `grid-${(model.name || 'build').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'build'}.png`;
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: file });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch { toast(t('The image could not be made.'), true); } finally { btn.disabled = false; }
}
// Someone else's grid becomes one of yours (private, named "… (copy)"), and opens ready to edit
async function gridCopy() {
  const b = G.saved; if (!b) return;
  const row = { user_id: S.me, pair_id: b.pair_id, name: `${b.name} (${t('copy')})`.slice(0, 80), purpose: b.purpose, nodes: b.nodes, move_level: b.move_level, energy_cap: energyCapFor(b.move_level), visibility: 'private', grid_hash: b.grid_hash || '', data_version: b.data_version || '' };
  let saved;
  if (await act(async () => { saved = await api.saveGridBuild(row); }, t('Copied to your builds.'))) {
    S.builds = await api.gridBuilds();
    const mine = S.builds.find(x => x.id === saved?.id);
    if (!mine) return;
    Object.assign(G, { readonly: false, from: '', buildId: mine.id, openedId: mine.id, saved: mine, name: mine.name, purpose: mine.purpose, visibility: 'private', draft: false, msg: '' });
    history.replaceState(null, '', `#/grid/${encodeURIComponent(G.pairId)}/${mine.id}`); gridRedraw();
  }
}
async function gridSave(asNew) {
  gridKeepFields();
  const problems = validate(G.ix, [...G.active], { moveLevel: G.moveLevel, energyCap: G.energyCap });
  if (problems.length) { G.msg = t('This build breaks the rules.'); gridRedraw(); return; }
  if (!G.name.trim()) G.name = defaultName();   // no name typed: the suggested one, still editable
  const row = { pair_id: G.pairId, name: G.name.trim(), purpose: G.purpose.trim(), nodes: [...G.active].sort((a, b) => a - b), move_level: G.moveLevel, energy_cap: G.energyCap,
    visibility: G.visibility, grid_hash: G.hash, data_version: String(G.detail.version || (G.detail.versions || []).join(',') || ''), ...(G.buildId && !asNew ? { id: G.buildId } : { user_id: S.me }) };
  let saved;
  if (await act(async () => { saved = await api.saveGridBuild(row); }, t('Build saved.'))) {
    S.builds = await api.gridBuilds();
    G.buildId = saved?.id ?? G.buildId; G.openedId = G.buildId; G.from = ''; G.draft = false; clearDraft(); G.saved = S.builds.find(b => b.id === G.buildId) || null; G.msg = '';
    history.replaceState(null, '', `#/grid/${encodeURIComponent(G.pairId)}/${G.buildId}`); gridRedraw();
  }
}
document.addEventListener('input', e => {
  if (e.target.id === 'grid-q') { GF.q = e.target.value; GF.shown = 48; const r = $('#pair-results'); if (r) r.innerHTML = pairResults(); }
});
document.addEventListener('input', e => {   // the name and the purpose are kept as they are typed, and the save state follows
  if (e.target.id === 'g-name') { G.name = e.target.value; refreshState(); }
  if (e.target.id === 'g-purpose') { G.purpose = e.target.value; refreshState(); }
});
document.addEventListener('input', e => {   // EX / EX role bonuses typed by hand: digits only, totals follow
  const k = e.target.dataset?.gextra; if (!k) return;
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 3); G.extra[k] = +e.target.value || 0;
  const sd = $('#grid-side'), pos = e.target.selectionStart; if (sd) { sd.innerHTML = gridSide(); const n = $(`[data-gextra="${k}"]`); n?.focus(); n?.setSelectionRange(pos, pos); }
});
document.addEventListener('change', e => {
  const gf = e.target.dataset?.gf, gfc = e.target.dataset?.gfc;
  if (gf) { GF[gf] = e.target.value; GF.shown = 48; const r = $('#pair-results'); if (r) r.innerHTML = pairResults(); return; }
  if (gfc) { GF[gfc] = e.target.checked; GF.shown = 48; const r = $('#pair-results'); if (r) r.innerHTML = pairResults(); return; }
  if (e.target.id === 'g-level') { gridKeepFields(); G.moveLevel = +e.target.value; G.energyCap = energyCapFor(G.moveLevel); gSettle(); gridRedraw(); }
  if (e.target.id === 'g-vis') { gridKeepFields(); G.visibility = e.target.value; gridRedraw(); }
});
document.addEventListener('click', async e => {
  const tile = e.target.closest('[data-gtile]'), tog = e.target.closest('[data-gtoggle]'), panel = e.target.closest('[data-gpanel]'), sub = e.target.closest('[data-gsub]'), zoom = e.target.closest('[data-gzoom]'),
    fit = e.target.closest('[data-gfit]'), focus = e.target.closest('[data-gfocus]'), lv = e.target.closest('[data-gmlv]'), stat = e.target.closest('[data-gstat]');
  if (e.target.closest('[data-gh-more]')) { GF.allShared = !GF.allShared; const r = $('#pair-results'); if (r) r.innerHTML = pairResults(); return; }
  if (e.target.closest('[data-gf-more]')) { GF.shown += 48; const r = $('#pair-results'); if (r) r.innerHTML = pairResults(); return; }
  if (e.target.closest('[data-gf-clear]')) { Object.assign(GF, { q: '', type: '', role: '', rarity: '', acq: '', ex: false, owned: false, withGrid: false, sort: 'new', shown: 48 }); hooks.route(); return; }
  if (panel) { gridKeepFields(); G.panel = panel.dataset.gpanel; redrawSide(); return; }
  if (sub) { G.sub = sub.dataset.gsub; redrawSide(); return; }
  if (stat) { G.statLevel = stat.dataset.gstat; redrawSide(); return; }
  const gform = e.target.closest('[data-gform]'), mvCard = e.target.closest('.mv[data-gmove]');
  if (gform) { G.form = +gform.dataset.gform; redrawSide(); redrawHead(); return; }
  if (mvCard && !hoverOk()) { pinMove(mvCard.dataset.gmove); return; }   // on a touch screen a tap on a move lights its tiles
  if (zoom) { setZoom(gridZoom() + +zoom.dataset.gzoom); redrawBoard(); return; }
  if (fit) { const w = $('.grid-scroll')?.clientWidth || 600, svg = $('.grid-scroll svg'), vb = svg?.viewBox.baseVal; if (vb) setZoom(Math.max(0.4, Math.min(2.2, (w - 8) / vb.width))); redrawBoard(); return; }
  if (focus) { G.focus = G.focus === focus.dataset.gfocus ? null : focus.dataset.gfocus; redrawBoard(); return; }
  if (G.readonly && (lv || tog)) return;
  if (lv) { gridKeepFields(); G.moveLevel = +lv.dataset.gmlv; G.energyCap = energyCapFor(G.moveLevel); gSettle(); gridRedraw(); return; }
  if (tile) {   // one click does it: switch the tile on (or off); if it cannot be switched on, say why
    const c = G.ix.byN.get(+tile.dataset.gtile);
    gridKeepFields(); G.sel = c.n; G.msg = '';
    if (G.readonly) { redrawBoard(); redrawSide(); const again = $(`[data-gtile="${c.n}"]`); if (again && hoverOk()) showTip(again); return; }   // a grid of someone else is only looked at
    pickTile(c);
    gridRedraw(); const again = $(`[data-gtile="${c.n}"]`); again?.classList.add('pop'); if (again && hoverOk()) showTip(again);
    return;
  }
  if (tog) {
    gridKeepFields();
    pickTile(G.ix.byN.get(+tog.dataset.gtoggle));
    G.msg = ''; gridRedraw(); return;
  }
  const gimg = e.target.closest('[data-gimg]'); if (gimg) { gridImage(gimg.dataset.gimg, gimg); return; }
  if (e.target.closest('[data-glink]')) { const sb = G.saved, base = location.href.split('#')[0], url = sb?.visibility === 'link' && sb.share_token ? `${base}#/g/${sb.share_token}` : `${base}#/grid/${encodeURIComponent(G.pairId)}/${sb?.id ?? G.buildId}`; try { await navigator.clipboard.writeText(url); toast(t('Link copied.')); } catch { prompt(t('Copy this link'), url); } return; }
  const gnew = e.target.closest('[data-gnew]'); if (gnew) { e.preventDefault(); Object.assign(G, { buildId: null, saved: null, openedId: 0, from: '', readonly: false, draft: false, name: '', purpose: '', visibility: 'private', active: new Set(), pending: new Set(), blocked: new Map(), msg: '' }); history.replaceState(null, '', `#/grid/${encodeURIComponent(G.pairId)}`); gridRedraw(); return; }
  if (e.target.closest('[data-gmore]')) { G.moreShared = !G.moreShared; redrawBar(); return; }
  if (e.target.closest('[data-greset-saved]') && G.saved) { const b = G.saved; Object.assign(G, { name: b.name, purpose: b.purpose, visibility: b.visibility, moveLevel: b.move_level, energyCap: energyCapFor(b.move_level), active: new Set(b.nodes), pending: new Set(), blocked: new Map(), msg: '' }); gridRedraw(); return; }
  if (e.target.closest('[data-gcopy]')) { gridCopy(); return; }
  if (e.target.closest('[data-gsignin]')) { try { sessionStorage.setItem('pmex-after-login', location.hash); } catch { /* no storage */ } location.hash = '#/login'; hooks.route(); return; }
  if (e.target.closest('[data-gsave]')) gridSave(false);
  if (e.target.closest('[data-gsave-new]')) gridSave(true);
  if (e.target.closest('[data-greset]')) { gridKeepFields(); G.active = new Set(); G.pending = new Set(); G.blocked = new Map(); G.msg = ''; gridRedraw(); }
  if (e.target.closest('[data-gclear-pending]')) { gridKeepFields(); G.pending = new Set(); G.blocked = new Map(); gridRedraw(); }
  if (e.target.closest('[data-gdel]')) {
    if (confirm(t('Delete this build?')) && await act(() => api.deleteGridBuild(G.buildId), t('Build deleted.'))) { S.builds = await api.gridBuilds(); G.buildId = null; location.hash = '#/grid'; }
  }
});
// ── hovering: a tile shows its details, a move lights up the tiles that belong to it (and a tile lights its move) ──
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const hoverOk = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
function tipHtml(c) {
  const on = G.active.has(c.n), wait = !on && G.pending.has(c.n), why = on || wait ? null : whyNot(G.ix, G.active, c, gOpts());
  const ahead = why === 'not-adjacent' && levelNeeded(c) <= G.moveLevel;
  return `<div class="gt-h k-${c.color}"><span>${glyph(c.color, 12)}${t(COLORS[c.color]?.[0] || c.color)}</span><b>${on ? t('Switched on') : wait ? t('Waiting') : ahead ? t('Pick ahead') : why ? t('Locked') : t('Can be switched on')}</b></div>
    <div class="gt-b"><h4>${esc(tileTitle(c))}</h4>${c.description ? `<p>${esc(c.description)}</p>` : ''}
    <div class="gt-c"><span><i class="e"></i>${t('Energy')} <b>${c.energy}</b></span><span><i class="o"></i>${t('Sync orbs')} <b>${fmtN(c.orbs)}</b></span></div>
    ${(c.req || []).length ? `<ul>${c.req.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}${wait ? `<p class="gt-why">${t('Switches on when the tiles between it and the centre are on ({n} more to pick).', { n: gGap(c.n) })}</p>` : ahead ? `<p class="gt-why">${t('Click to pick it ahead: it switches on once linked.')}</p>` : why ? `<p class="gt-why">${t(BUILD_WHY[why])}</p>` : ''}</div>`;
}
function showTip(el) {
  let tip = $('#g-tip');
  if (!tip) { tip = document.createElement('div'); tip.id = 'g-tip'; tip.className = 'g-tip'; tip.setAttribute('role', 'tooltip'); document.body.append(tip); }
  const c = G.ix?.byN.get(+el.dataset.gtile); if (!c) return;
  tip.innerHTML = tipHtml(c); tip.hidden = false;
  const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
  const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8)), top = r.top - h - 8 >= 8 ? r.top - h - 8 : Math.min(r.bottom + 8, innerHeight - h - 8);
  tip.style.left = `${Math.round(left)}px`; tip.style.top = `${Math.round(top)}px`;
  const mv = tileMove(c); $$('.mv.ref').forEach(x => x.classList.remove('ref'));
  if (mv) $$('.mv[data-gmove]').filter(x => x.dataset.gmove === mv).forEach(x => x.classList.add('ref'));
}
const hideTip = () => { const tip = $('#g-tip'); if (tip) tip.hidden = true; $$('.mv.ref').forEach(x => x.classList.remove('ref')); };
function lightMove(name) {
  const svg = $('.grid-scroll svg'); if (!svg) return;
  svg.classList.toggle('hlmode', !!name);
  $$('.g-tile', svg).forEach(g => { const c = G.ix.byN.get(+g.dataset.gtile); g.classList.toggle('hl', !!name && !!c && tileMove(c) === name); });
}
let pinned = '';
function pinMove(name) { pinned = pinned === name ? '' : name; lightMove(pinned); $$('.mv.pin').forEach(x => x.classList.remove('pin')); if (pinned) $$('.mv[data-gmove]').filter(x => x.dataset.gmove === pinned).forEach(x => x.classList.add('pin')); }
document.addEventListener('mouseover', e => {
  if (!hoverOk() || !G.ix) return;
  const tl = e.target.closest?.('[data-gtile]'), mv = e.target.closest?.('.mv[data-gmove]');
  if (tl) showTip(tl);
  if (mv) lightMove(mv.dataset.gmove);
});
document.addEventListener('mouseout', e => {
  if (!hoverOk() || !G.ix) return;
  if (e.target.closest?.('[data-gtile]') && !e.relatedTarget?.closest?.('[data-gtile]')) hideTip();
  if (e.target.closest?.('.mv[data-gmove]') && !e.relatedTarget?.closest?.('.mv[data-gmove]')) lightMove(pinned);
});
document.addEventListener('scroll', hideTip, true);
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'g-name') { e.preventDefault(); gridSave(false); return; }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-gtile]')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });


// Drag the board with the mouse to move around it (a touch screen already scrolls it with a finger). A click that ends a drag is not a tile pick.
let pan = null;
document.addEventListener('pointerdown', e => {
  const sc = e.target.closest?.('.grid-scroll');
  if (!sc || e.pointerType !== 'mouse' || e.button !== 0) return;
  pan = { sc, x: e.clientX, y: e.clientY, l: sc.scrollLeft, t: sc.scrollTop, moved: false };
});
document.addEventListener('pointermove', e => {
  if (!pan) return;
  const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
  if (!pan.moved && Math.hypot(dx, dy) < 5) return;
  if (!pan.moved) { pan.moved = true; pan.sc.classList.add('panning'); hideTip(); }
  pan.sc.scrollLeft = pan.l - dx; pan.sc.scrollTop = pan.t - dy;
});
const endPan = () => { if (pan?.moved) { pan.sc.classList.remove('panning'); const stop = ev => { ev.stopPropagation(); ev.preventDefault(); }; document.addEventListener('click', stop, { capture: true, once: true }); setTimeout(() => document.removeEventListener('click', stop, true), 0); } pan = null; };
document.addEventListener('pointerup', endPan);
document.addEventListener('pointercancel', endPan);
