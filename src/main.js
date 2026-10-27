/* ═══════════════════════════════════════════════════════════════
   PMEX Gym Manager — UI (vanilla JS, hash router)
   Pages: sign-in · overview · log · plan · members · member/<id>/<tab> · account · admin
   ═══════════════════════════════════════════════════════════════ */
import { createApi, isDemo } from './api.js';
import { ico } from './icons.js';
import { STYLES, ACCENTS, MODES, getAppearance, applyAppearance } from './appearance.js';
import { MASCOTS, MASCOT_STYLES, mascotHead, mountCompanion } from './mascot.js?v=20261027-trainers2';
import { t, getLang, setLang, LANGS, locale } from './i18n.js';
import { TOWER_TOP, circuitAt, roundShort, seasonState, pointsIn, validateRun, readiness, pairWeight, levelLabel, suggestTeam } from './rules.js';
import { project as projectGems, serverToday, monthEnd, addDays } from './gems.js';
import { indexGrid, whyNot, canRemove, validate, totals, levelNeeded, otherReqs, gridHash, hexXY, COLORS } from './grid.js';
import { browserTz, allTimezones, validTz, toLocalInput, fromLocalInput, clockIn } from './time.js';
import { loadCatalog, loadGyms, PAIRS, loadPairDetail, loadPairMap, dexIdOf, pairById, pairName, pairImage, TYPES, TYPE_COLORS, typeIcon, roleIcon, roleKey,
  PLACEHOLDER, catalogRows, catalogVersion, GYMS, GYMS_META, seasonFromGym, leaderRule, leaderFocus, leaderImage, POMA, DEX, loadTags, wtzScore, rebuffs, pairByTrackerKey } from './catalog.js';
import { SHEET_SLOTS, fixedIds, rankForSlot, autoFill, suggestFacilitator } from './sheet.js';
import { parseTrackerBackup, trackerRows } from './tracker.js';

// ─── Helpers ────────────────────────────────────────────────
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = n => (n ?? 0).toLocaleString('en-US');
const fmtK = n => n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n);
// Times are shown in the viewer's chosen zone (profile), else the device's
const viewTz = () => { const z = S.profiles.find(p => p.id === S.me)?.timezone; return validTz(z) ? z : browserTz(); };
const fmtDT = iso => iso ? new Date(iso).toLocaleString(locale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: viewTz() }) : '—';
const fmtD = iso => iso ? new Date(iso).toLocaleDateString(locale(), { day: '2-digit', month: 'short', year: 'numeric', timeZone: viewTz() }) : '—';
const fmtLeft = ms => {
  const m = Math.max(0, Math.round(ms / 6e4)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m % 60}m`;
};
const img = (src, cls = '', alt = '') => `<img src="${esc(src || PLACEHOLDER)}" class="${cls}" alt="${esc(alt)}" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER}'">`;
const pairIcon = (p, size = 'md', ex = false, stars = null) => img(pairImage(p, ex, stars), `pi ${size}`, pairName(p));
const ownIcon = (p, mp, size = 'md') => pairIcon(p, size, mp?.ex, mp?.stars);   // as this member has it (stars / EX)
const typeTag = t0 => t0 ? `<span class="type" style="--tc:${TYPE_COLORS[t0] || '#888'}">${img(typeIcon(t0))}${esc(t(t0))}</span>` : '';
const roleTag = (r, ex = false) => r ? `<span class="role ${ex ? 'ex' : ''}">${img(roleIcon(r, ex), 'ri')}${ex ? 'EX ' : ''}${esc(roleKey(r).replace(/^./, c => c.toUpperCase()))}</span>` : '';
const rankName = r => ({ admin: t('Admin'), mod: t('Mod'), member: t('Member') }[r] || r);
const rankTag = (r, always = false) => r !== 'member' || always ? `<span class="badge role-${r}">${rankName(r)}</span>` : '';
const debounce = (fn, ms = 400) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };
const tc = type => TYPE_COLORS[type] || '#7a86a8';

function toast(msg, bad = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast show ${bad ? 'bad' : ''}`;
  clearTimeout(toast.h);
  toast.h = setTimeout(() => el.classList.remove('show'), bad ? 5000 : 2500);
}
async function act(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r ?? true; } catch (e) { toast(e.message, true); return false; }
}

// ─── State ──────────────────────────────────────────────────
let api;
const S = { me: null, profiles: [], mp: [], tower: [], seasons: [], sid: null, runs: [], sm: [], asg: [], notes: [], fac: [], res: [], resources: [], lodge: null, builds: [], reviews: [], gems: { settings: { reset_timezone: 'UTC', reset_hour: 0 }, events: [], rewards: [] }, strats: { strategies: [], revisions: [] }, sheet: [] };
const meP = () => S.profiles.find(p => p.id === S.me);
let lockCtx = false;   // set while drawing a frozen page: staff controls disappear for everyone but the admin
const isStaff = () => !lockCtx && ['admin', 'mod'].includes(meP()?.role);
const isAdmin = () => meP()?.role === 'admin';
const profile = id => S.profiles.find(p => p.id === id);
const nameOf = p => (p ? p.display_name || p.username : '');
const season = () => S.seasons.find(s => s.id === S.sid);
const owned = uid => S.mp.filter(x => x.user_id === uid);
const ownedPair = (uid, pid) => S.mp.find(x => x.user_id === uid && x.pair_id === pid);
const towerFloor = (uid, type) => S.tower.find(x => x.user_id === uid && x.type === type)?.floor || 0;
// A Gym Battle that is over is frozen: only the admin can still change its log and plans (the database enforces it too)
const frozen = () => { const s = season(); return !!s && Date.parse(s.battle_end) <= Date.now() && !isAdmin(); };
const canEdit = uid => !lockCtx && (uid === S.me || isStaff());
const leaderImg = (s, name, cls = '') => img(leaderImage(s, name), `spr ${cls}`, name);
const leaderOf = (s, name) => s?.leaders.find(l => l.name === name) || { name, weakness: [] };

// A member's picture: the pair they chose, else their strongest pair
function avatarPair(uid) {
  const p = profile(uid), mine = owned(uid);
  return (p?.avatar && mine.find(x => x.pair_id === p.avatar)) || [...mine].sort((a, b) => pairWeight(b) - pairWeight(a))[0];
}
function av(uid, size = '') {
  const url = profile(uid)?.avatar_url;
  if (url) return `<span class="av ${size}"><img class="upl" src="${esc(url)}" alt=""></span>`;
  const x = avatarPair(uid), pair = x && pairById(x.pair_id);
  return `<span class="av ${size}">${pair ? img(pairImage(pair, x.ex, x.stars), '', '') : esc((nameOf(profile(uid)) || '?')[0].toUpperCase())}</span>`;
}

async function loadAll() {
  [S.profiles, S.mp, S.tower, S.seasons, S.sheet, S.resources, S.strats, S.builds, S.gems, S.reviews] = await Promise.all([api.profiles(), api.memberPairs(), api.tower(), api.seasons(), api.sheet(), api.resources().catch(() => []), api.strategies().catch(() => ({ strategies: [], revisions: [] })), api.gridBuilds().catch(() => []), api.gems().catch(() => S.gems), api.runReviews().catch(() => [])]);
  let saved = null;
  try { saved = +localStorage.getItem('gym-season'); } catch { /* private mode */ }
  S.sid = (S.seasons.find(s => s.id === saved) || S.seasons.find(s => s.is_active) || S.seasons[0])?.id ?? null;
  await loadSeason();
}
async function loadSeason() {
  if (!S.sid) { S.runs = S.sm = S.asg = S.notes = S.fac = S.res = []; return; }
  [S.runs, S.sm, S.asg, S.notes, S.fac, S.res] = await Promise.all([api.runs(S.sid), api.seasonMembers(S.sid), api.assignments(S.sid), api.notes(S.sid), api.facilitators(S.sid), api.results(S.sid)]);
}
const state = () => (season() ? seasonState(season(), S.runs, S.sm) : null);

// ─── Chrome (header) ────────────────────────────────────────
const NAV = [['', 'Overview', 'home'], ['log', 'Log a run', 'swords'], ['plan', 'Plan', 'plan'], ['info', 'Battle info', 'flag'], ['strategies', 'Strategies', 'trophy'], ['lodge', 'Trainer Lodge', 'star'], ['grid', 'Sync Grid', 'bolt'], ['gems', 'Free Gems', 'ticket'], ['resources', 'Resources', 'note'], ['roster', 'Roster', 'roster'],
  ['members', 'Members', 'users'], ['admin', 'Admin', 'shield']];
function renderHeader(active) {
  $('#nav').innerHTML = S.me ? NAV.filter(([k]) => k !== 'admin' || isStaff())
    .map(([k, label, icon]) => `<a href="#/${k}" class="${k === active ? 'on' : ''}">${ico(icon)}<span>${t(label)}</span></a>`).join('') : '';
  $('#userbox').innerHTML = S.me ? `<a href="#/member/${S.me}" class="user">${av(S.me)}<span>${esc(nameOf(meP()))}</span> ${rankTag(meP().role)}</a>` : '';
  $('#settings-link').innerHTML = ico('gear');
  $('#settings-link').classList.toggle('on', active === 'settings');
  $('#settings-link').title = t('Settings');
  const gym = (window.GYM_CONFIG || {}).gymName || 'Gym Manager';
  $('#brand-name').textContent = gym;
  document.title = `${gym} · Gym Manager`;
  $('#demo-flag').hidden = !isDemo;
  $('#demo-flag').textContent = t('Demo');
  $('#dex-link').href = DEX;
  const { mascot, mascotStyle } = getAppearance();
  $('#brand-mascot').innerHTML = mascotHead(MASCOTS.some(m => m.id === mascot) ? mascot : 'kai', mascotStyle, 'brand');
}

// ─── Companion mascot: what it says when poked ───
let companion = null;
const showMascot = () => { const a = getAppearance(); companion?.set(a.mascot === 'off' ? null : MASCOTS.some(m => m.id === a.mascot) ? a.mascot : 'kai', a.mascotStyle); };
function mascotTips() {
  if (!S.me) return [t('Sign in with the account your gym admin gave you.')];
  const tips = [];
  const s = season(), st = state();
  if (s && st) {
    const left = st.granted - (st.perMember[S.me]?.tickets || 0);
    if (st.phase === 'battle' && !st.banned.has(S.me)) tips.push(left > 0 ? t('You still have {n} tickets to spend in {s}.', { n: left, s: s.name }) : t('All the tickets handed out so far are spent — nice work!'));
    const cur = st.active && circuitAt(s, st.active);
    if (cur) tips.push(t('Open round: {r}. Each Gym Leader needs {n} points.', { r: cur.label, n: fmtK(cur.pts) }));
    const mine = S.asg.filter(a => a.user_id === S.me).map(a => a.leader);
    if (mine.length) tips.push(t('You are down for {l} — your planned team fills in when you log a run.', { l: mine.join(', ') }));
  }
  const ty = defaultRosterType(), cells = sheetCells(S.me, ty);
  const empty = SHEET_SLOTS.filter(x => !x.fixed && !(x.k in cells)).length;
  if (empty) tips.push(t('Your {t} roster sheet still has {n} empty cells.', { t: t(ty), n: empty }));
  return tips;
}
function greet() {
  try { if (sessionStorage.getItem('gym-greeted') === S.me) return; sessionStorage.setItem('gym-greeted', S.me); } catch { /* private mode */ }
  const tips = mascotTips();
  companion?.greet(`${t('Hi {n}!', { n: nameOf(meP()) })} ${tips[0] || ''}`.trim());
}
const langSelect = () => `<select id="lang" class="lang" aria-label="${t('Language')}">${LANGS.map(([k, l]) => `<option value="${k}" ${k === getLang() ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
document.addEventListener('change', e => {
  if (e.target.id !== 'lang') return;
  setLang(e.target.value);
  route();
});

// ─── Router ─────────────────────────────────────────────────
const view = $('#view');
const routes = { '': renderOverview, log: renderLog, plan: renderPlan, info: renderInfo, resources: renderResources, strategies: renderStrategies, lodge: renderLodge, grid: renderGrid, gems: renderGems, roster: renderRoster, members: renderMembers, member: renderMember,
  settings: renderSettings, account: renderSettings, admin: renderAdmin };
const after = {};

function route() {
  if (!S.me) { renderHeader(''); renderLogin(); return; }
  const [, name = '', ...args] = location.hash.replace(/^#/, '').split('/').map(decodeURIComponent);
  const fn = routes[name] || renderOverview;
  renderHeader(name === 'member' ? (args[0] === S.me || !args[0] ? '' : 'members') : name === 'account' ? 'settings' : name);
  view.innerHTML = fn(...args);
  after[name]?.(...args);
}
addEventListener('hashchange', route);

// A row of pixel Gym Leaders standing on platforms
const lineup = (items) => `<div class="lineup">${items.map(x => `
  <${x.href ? `a href="${x.href}"` : 'span'} class="stand ${x.done ? 'done' : ''}" style="--tc:${tc(x.type)}" title="${esc(x.name)}">
    ${img(x.src, 'spr', x.name)}${x.label != null ? `<b>${esc(x.name)}</b><small>${x.label}</small>` : ''}</${x.href ? 'a' : 'span'}>`).join('')}</div>`;

// ═══════════════════════════════════════════════════════════════
//  SIGN IN
// ═══════════════════════════════════════════════════════════════
function renderLogin() {
  const g = GYMS().at(-1);
  const leaders = g ? (g.stages[0]?.leaders || []).map(l => ({ name: l.name, type: l.type, src: leaderImage(null, l.name) })) : [];
  view.innerHTML = `
  <div class="login-wrap">
    <section class="banner login-art" style="--tc:#ff9d2e">
      <span class="kicker">Pokémon Masters EX</span>
      <h1>${t('Run your gym like a champion.')}</h1>
      <p>${t('Members, sync pairs, Pasio Tower and every Gym Battle run — one place for the whole gym.')}</p>
      ${lineup(leaders)}
    </section>
    <div class="login card">
      <img src="${POMA}images/icon_masterex.png" class="login-logo" alt="">
      <div class="login-top"><h2>${esc((window.GYM_CONFIG || {}).gymName || t('Sign in'))}</h2>${langSelect()}</div>
      <p class="kicker" style="margin:-6px 0 0">${t('Sign in')}</p>
      <p class="muted" style="margin:0">${t('Sign in with the account your gym admin gave you.')}</p>
      <form id="login-form" class="form">
        <label>${t('Username')}<input name="username" autocomplete="username" required autofocus></label>
        <label>${t('Password')}<input name="password" type="password" autocomplete="current-password" ${isDemo ? '' : 'required'}></label>
        <button class="btn primary">${t('Sign in')}</button>
        <p class="form-err" id="login-err"></p>
      </form>
      ${isDemo ? `<div class="demo-box">
        <b>${t('Demo mode')}</b> — ${t('sample data in your browser; nothing is saved. Try it as:')}
        <div class="row">${api.demoUsers().map(p => `<button class="btn" data-demo="${p.username}">${esc(p.display_name)} ${rankTag(p.role, true)}</button>`).join('')}</div>
      </div>` : ''}
    </div>
  </div>`;
}
async function signIn(username, password) {
  try {
    await api.signIn(username, password);
    S.me = await api.session();
    await loadAll();
    if (!location.hash || location.hash === '#/login') location.hash = '#/';
    route();
    setTimeout(greet, 600);
  } catch (e) { $('#login-err').textContent = e.message; }
}
document.addEventListener('submit', e => {
  if (e.target.id !== 'login-form') return;
  e.preventDefault();
  const f = new FormData(e.target);
  signIn(f.get('username'), f.get('password'));
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-demo]');
  if (b) signIn(b.dataset.demo, 'demo-password');
});

// ═══════════════════════════════════════════════════════════════
//  OVERVIEW
// ═══════════════════════════════════════════════════════════════
function seasonBar() {
  if (S.seasons.length < 2) return '';
  return `<div class="season-bar">${S.seasons.map(s => `
    <button class="pill ${s.id === S.sid ? 'on' : ''}" data-season="${s.id}">${s.is_active ? '<i class="dot"></i>' : ''}${esc(s.name)}</button>`).join('')}</div>`;
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-season]');
  if (!b) return;
  S.sid = +b.dataset.season;
  try { localStorage.setItem('gym-season', S.sid); } catch { /* private mode */ }
  await loadSeason();
  route();
});
function noSeason() {
  return `<div class="empty card">${img(`${POMA}images/icon_masterex.png`, 'pi lg')}<h2>${t('No Gym Battle season yet')}</h2>
    ${isStaff() ? `<a class="btn primary" href="#/admin">${t('Create one in Admin')}</a>` : `<p class="muted">${t('Your admin will create the season.')}</p>`}</div>`;
}

// Planned team of one assignment, with the member's current level / EX for each pair
const planTeam = a => (a?.team || []).map(id => {
  const mp = ownedPair(a.user_id, id);
  return { pair_id: id, level: mp?.level || 1, stars: mp?.stars, ex: !!mp?.ex, ex_role: !!mp?.ex_role };
});
const assignment = (uid, leader) => S.asg.find(a => a.user_id === uid && a.leader === leader);

let showAllRounds = false;
function renderOverview() {
  const s = season();
  if (!s) return seasonBar() + noSeason();
  const st = state();
  const cur = st.active ? circuitAt(s, st.active) : null;
  const rows = Math.max(st.active || 0, st.maxRound, 1);
  const firstShown = showAllRounds ? 1 : Math.max(1, (st.active || rows) - 2);
  const board = Object.values(st.perMember).sort((a, b) => b.score - a.score);
  const over = st.phase === 'ended';   // a finished season lists only who played, and has no tickets left to spend
  if (!over) for (const p of S.profiles) if (!st.perMember[p.id]) board.push({ key: p.id, user_id: p.id, name: nameOf(p), score: 0, tickets: 0, runs: 0 });
  const left = over ? [] : S.profiles.filter(p => !st.banned.has(p.id)).map(p => ({ p, left: st.granted - (st.perMember[p.id]?.tickets || 0) }))
    .filter(x => x.left > 0).sort((a, b) => b.left - a.left);
  const phase = { upcoming: t('Starts soon'), battle: t('In progress'), ended: t('Finished') }[st.phase];
  const pct = s.target_score ? Math.min(100, st.combined / s.target_score * 100) : null;
  const now = Date.now();
  const side = st.phase === 'battle' ? [t('Ends in'), fmtLeft(Date.parse(s.battle_end) - now)]
    : st.phase === 'upcoming' ? [t('Starts in'), fmtLeft(Date.parse(s.battle_start) - now)] : [t('Final score'), fmtK(st.combined)];
  const mine = S.asg.filter(a => a.user_id === S.me), myFac = S.fac.filter(f => f.user_id === S.me);
  if (S.res.length && !S.runs.length) return seasonBar() + archiveView(s, phase);

  return `${seasonBar()}
  <section class="banner hero" style="--tc:${tc(s.leaders[0]?.type)}">
    <div>
      <span class="kicker">${t('Gym Battle')}</span>
      <h1>${esc(s.name)}</h1>
      <div class="hero-meta"><span class="phase ${st.phase}">${phase}</span>
        <span>${ico('calendar')}${fmtDT(s.battle_start)} → ${fmtDT(s.battle_end)}</span>
        ${cur ? `<span>${ico('flag')}${t('Open round')}: <b>${esc(cur.label)}</b></span>` : ''}</div>
    </div>
    <div class="hero-side"><small>${side[0]}</small><span class="big">${side[1]}</span></div>
    ${lineup(s.leaders.map(l => {
      const v = cur ? pointsIn(st, st.active, l.name) : 0, done = cur && v >= cur.pts;
      return { name: l.name, type: l.type, src: leaderImage(s, l.name), href: `#/log/${encodeURIComponent(l.name)}`, done,
        label: !cur ? '' : done ? `${ico('check')} ${t('cleared')}` : t('{n} to go', { n: fmtK(cur.pts - v) }) };
    }))}
  </section>

  <div class="kpis">
    <div class="card kpi" style="--kc:var(--gold)"><span class="k-ico">${ico('trophy')}</span><small>${t('Combined score')}</small><b>${fmtN(st.combined)}</b>
      ${pct != null ? `<div class="meter"><i style="width:${pct}%"></i></div><span>${t('{p}% of the {goal} target', { p: pct.toFixed(1), goal: fmtK(s.target_score) })}</span>` : `<span>${t('No target set')}</span>`}</div>
    <div class="card kpi" style="--kc:#e0457b"><span class="k-ico">${ico('flag')}</span><small>${t('Open round')}</small><b>${cur ? esc(roundShort(cur.label)) : st.finished ? t('All cleared') : '—'}</b><span>${cur ? t('{n} points per leader', { n: fmtK(cur.pts) }) : ''}</span></div>
    <div class="card kpi" style="--kc:var(--accent)"><span class="k-ico">${ico('ticket')}</span><small>${t('Tickets per member')}</small><b>${st.granted}<em> / ${s.ticket_cap}</em></b><span>${t('{a} on day 1, +{b} a day', { a: s.tickets_day1, b: s.tickets_daily })}</span></div>
    <div class="card kpi" style="--kc:#16a37a"><span class="k-ico">${ico('gym')}</span><small>${t('Gym tickets used')}</small><b>${st.gymUsed}<em> / ${s.gym_ticket_cap}</em></b><span>${t('{n} runs', { n: S.runs.length })}</span></div>
  </div>

  ${mine.length || myFac.length ? `<section class="section">
    <h2>${t('Your battles')} <small>${t('planned by your admin and mods')}</small></h2>
    <div class="mine">${myFac.map(f => {
      const l = leaderOf(s, f.leader);
      return `<a class="card mb" href="#/plan" data-goto-fac style="--tc:${tc(l.type)}">${leaderImg(s, f.leader)}
        <div><b>${esc(f.leader)}</b> <span class="badge gold">${t('Facilitator')}</span>
          <div class="team">${teamIcons(planTeam(f)) || `<small class="muted">${t('Team not chosen yet')}</small>`}</div>
          <small class="muted">${(f.does || []).map(k => t(DUTIES.find(x => x[0] === k)?.[1] || k)).join(' · ')}</small></div></a>`;
    }).join('')}${mine.map(a => {
      const l = leaderOf(s, a.leader);
      return `<a class="card mb" href="#/log/${encodeURIComponent(a.leader)}" style="--tc:${tc(l.type)}">${leaderImg(s, a.leader)}
        <div><b>${esc(a.leader)}</b> ${(l.weakness || []).map(w => img(typeIcon(w), 'ti', w)).join('')}
          <div class="team">${teamIcons(planTeam(a)) || `<small class="muted">${t('Team not chosen yet')}</small>`}</div>
          ${a.note ? `<small class="muted">${esc(a.note)}</small>` : ''}</div>
        <span class="btn sm">${ico('swords')} ${t('Log')}</span></a>`;
    }).join('')}</div>
  </section>` : ''}

  <section class="section">
    <h2>${t('Progress by Gym Leader')} <small>${t('click a cell to log a run')}</small></h2>
    <div class="card scroll">
      <table class="progress">
        <thead><tr><th>${t('Round')}</th>${s.leaders.map(l => `<th class="lh" style="--tc:${tc(l.type)}"><div class="head">${leaderImg(s, l.name)}</div><b>${esc(l.name)}</b>
          <span class="weak">${(l.weakness || []).map(w => img(typeIcon(w), 'ti', w)).join('')}</span></th>`).join('')}</tr></thead>
        <tbody>
        ${firstShown > 1 ? `<tr class="folded"><td colspan="${s.leaders.length + 1}"><button class="btn sm ghost" data-all-rounds>${t('{a}–{b} cleared — show all', { a: roundShort(circuitAt(s, 1).label), b: roundShort(circuitAt(s, firstShown - 1).label) })}</button></td></tr>` : ''}
        ${Array.from({ length: rows - firstShown + 1 }, (_, i) => i + firstShown).map(n => {
          const c = circuitAt(s, n);
          if (!c) return '';
          return `<tr class="${n === st.active ? 'active' : ''}"><th>${esc(c.label)}<small>${fmtK(c.pts)}</small></th>
            ${s.leaders.map(l => {
              const v = pointsIn(st, n, l.name), full = v >= c.pts;
              return `<td><a class="cell ${full ? 'full' : v ? 'part' : ''}" href="#/log/${encodeURIComponent(l.name)}/${n}" title="${esc(l.name)} · ${esc(c.label)}: ${fmtN(v)} / ${fmtN(c.pts)}">
                <i style="width:${Math.min(100, v / c.pts * 100)}%"></i><span>${full ? ico('check') : v ? fmtK(v) : ''}</span></a></td>`;
            }).join('')}</tr>`;
        }).join('')}</tbody>
      </table>
    </div>
  </section>

  <div class="cols section">
    <section>
      <h2>${t('Member scores')}</h2>
      <div class="card scroll"><table class="table">
        <thead><tr><th>#</th><th>${t('Member')}</th><th class="num">${t('Score')}</th><th class="num">${t('Tickets')}</th><th class="num">${t('Left')}</th><th class="num">${t('Avg / ticket')}</th><th class="num">${t('Runs')}</th></tr></thead>
        <tbody>${board.map((m, i) => {
          const banned = st.banned.has(m.user_id) || m.excluded, gone = !m.user_id || !profile(m.user_id);
          return `<tr class="${banned ? 'dim' : ''}"><td class="rank r${i + 1}">${i + 1}</td>
            <td>${gone ? `<span class="muted">${esc(m.name)} (${t('left the gym')})</span>` : `<a class="who" href="#/member/${m.user_id}">${av(m.user_id, 'xs')}${esc(m.name)}</a>`}${banned ? ` <span class="badge bad">${t('locked')}</span>` : ''}</td>
            <td class="num"><b>${fmtN(m.score)}</b></td><td class="num">${m.tickets}</td>
            <td class="num">${over || gone || banned ? '—' : Math.max(0, st.granted - m.tickets)}</td>
            <td class="num">${m.tickets ? fmtN(Math.round(m.score / m.tickets)) : '—'}</td><td class="num">${m.runs}</td></tr>`;
        }).join('')}</tbody></table></div>
    </section>
    <section>
      <h2>${over ? t('Tickets used') : t('Tickets left')} <small>${over ? t('{n} of {g}', { n: st.gymUsed, g: s.gym_ticket_cap }) : t('{n} unused', { n: left.reduce((a, x) => a + x.left, 0) })}</small></h2>
      <div class="card chips">${over ? `<p class="muted">${t('This Gym Battle is over. The scores above are the final results.')}</p>` : left.length ? left.map(x => `<a class="pill" href="#/log//${st.active || ''}/${x.p.id}">${esc(nameOf(x.p))} <b>${x.left}</b></a>`).join('') : `<p class="muted">${t('Everyone has used the tickets handed out so far.')}</p>`}</div>
      <h2>${t('Recent runs')}</h2>
      <div class="card list">${S.runs.slice(0, 8).map(runLine).join('') || `<p class="muted">${t('No runs yet.')}</p>`}</div>
    </section>
  </div>`;
}
// A Gym Battle kept in a spreadsheet: final results per player (points, tickets, the team used for each type)
function archiveView(s, phase) {
  const rows = S.res, total = rows.reduce((a, r) => a + (r.points || 0), 0), tk = rows.reduce((a, r) => a + r.tickets, 0);
  const types = [...new Set(rows.flatMap(r => Object.keys(r.teams || {})))];
  const open = archiveOpen;
  return `<section class="banner hero" style="--tc:${tc(s.leaders[0]?.type)}">
    <div><span class="kicker">${t('Gym Battle')}</span><h1>${esc(s.name)}</h1>
      <div class="hero-meta"><span class="phase ended">${phase}</span><span>${ico('calendar')}${fmtDT(s.battle_start)} → ${fmtDT(s.battle_end)}</span></div></div>
    <div class="hero-side"><small>${t('Final score')}</small><span class="big">${fmtK(total)}</span></div>
    ${lineup(s.leaders.map(l => ({ name: l.name, type: l.type, src: leaderImage(s, l.name), done: false, label: '' })))}
  </section>
  <div class="kpis">
    <div class="card kpi" style="--kc:var(--gold)"><span class="k-ico">${ico('trophy')}</span><small>${t('Combined score')}</small><b>${fmtN(total)}</b><span>${t('{n} players', { n: rows.length })}</span></div>
    <div class="card kpi" style="--kc:#16a37a"><span class="k-ico">${ico('gym')}</span><small>${t('Gym tickets used')}</small><b>${tk}<em> / ${s.gym_ticket_cap}</em></b><span>${t('Kept from the spreadsheet: totals only, no run-by-run detail.')}</span></div>
  </div>
  <section class="section"><h2>${t('Final results')} <small>${t('click a player to see their teams')}</small></h2>
    <div class="card scroll"><table class="table">
      <thead><tr><th>#</th><th>${t('Member')}</th><th class="num">${t('Score')}</th><th class="num">${t('Tickets')}</th><th class="num">${t('Avg / ticket')}</th></tr></thead>
      <tbody>${rows.map((r, i) => {
        const p = r.user_id && profile(r.user_id), has = types.some(ty => r.teams?.[ty]), on = open === r.name;
        return `<tr class="${has ? 'arch-row' : ''}" ${has ? `data-arch="${esc(r.name)}"` : ''}><td class="rank r${i + 1}">${i + 1}</td>
          <td>${p ? `<a class="who" href="#/member/${p.id}">${av(p.id, 'xs')}${esc(r.name)}</a>` : `<span class="muted">${esc(r.name)}</span>`}</td>
          <td class="num"><b>${r.points == null ? '—' : fmtN(r.points)}</b></td><td class="num">${r.tickets}</td>
          <td class="num">${r.points && r.tickets ? fmtN(Math.round(r.points / r.tickets)) : '—'}</td></tr>
          ${on ? `<tr class="arch-teams"><td></td><td colspan="4">${types.filter(ty => r.teams?.[ty]).map(ty => `<div class="arch-t"><b>${esc(t(ty[0] + ty.slice(1).toLowerCase()))}</b><span>${esc(r.teams[ty])}</span></div>`).join('')}</td></tr>` : ''}`;
      }).join('')}</tbody></table></div></section>`;
}
let archiveOpen = null;
document.addEventListener('click', e => { const a = e.target.closest('[data-arch]'); if (a) { archiveOpen = archiveOpen === a.dataset.arch ? null : a.dataset.arch; route(); } });
document.addEventListener('click', e => { if (e.target.closest('[data-all-rounds]')) { showAllRounds = true; route(); } });

const teamIcons = team => !(team || []).length ? `<span class="muted na" title="${t('The team was not recorded')}">n/a</span>` : (team || []).map(x => {
  const p = pairById(x.pair_id);
  return `<span title="${esc(pairName(p))} ${levelLabel(x.level || 1)}${x.ex ? ' EX' : ''}">${ownIcon(p, x, 'xs')}</span>`;
}).join('');
function runLine(r) {
  const c = circuitAt(season(), r.round);
  return `<div class="run">${r.user_id && profile(r.user_id) ? av(r.user_id, 'xs') : ''}<div><b>${esc(r.member_name)}</b><small class="muted">${esc(r.leader)} · ${esc(c?.label || r.round)} · ${fmtDT(r.occurred_at || r.created_at)}${r.occurred_inferred ? '*' : ''}</small></div>
    <span class="team">${teamIcons(r.team)}</span><b class="num">${fmtN(r.score)}</b></div>`;
}

// ═══════════════════════════════════════════════════════════════
//  LOG A RUN + HISTORY
// ═══════════════════════════════════════════════════════════════
let form = null;
const logFilter = { member: '', leader: '', round: '' };

// Until the team is touched by hand it follows the plan: the assigned team for this
// leader if there is one, else the member's latest team.
function autoTeam(uid, leader) {
  const plan = leader && planTeam(assignment(uid, leader));
  if (plan?.length) return { team: plan, planned: true };
  const last = S.runs.find(r => r.user_id === uid);
  return { team: last ? last.team.map(x => ({ ...x })) : [], planned: false };
}
// "Now" for the battle-time field, kept inside the Gym Battle (an admin may log after it ended)
function nowInput() {
  const s = season(), now = Date.now();
  const t0 = s ? Math.min(Math.max(now, Date.parse(s.battle_start)), Date.parse(s.battle_end)) : now;
  return toLocalInput(new Date(t0).toISOString(), viewTz());
}
function blankForm(leader = '', round = null, member = null) {
  const st = state();
  const c = circuitAt(season(), round || st.active || 1);
  const uid = member || S.me;
  return { id: null, user_id: uid, leader, round: round || st.active || 1, tickets: c?.fixed || 3, score: '', note: '', occurred: nowInput(), auto: true, ...autoTeam(uid, leader) };
}

function renderLog(leader = '', round = '', member = '') {
  const s = season();
  if (!s) return seasonBar() + noSeason();
  if (!form || leader || round || member) form = blankForm(leader, +round || null, member || null);
  lockCtx = frozen();
  try { return logPage(); } finally { lockCtx = false; }
}
function logPage() {
  return `${seasonBar()}
  <div class="log-layout">
    <section class="card pad" id="run-form">${lockCtx ? `<h2 class="title">${t('Log a run')}</h2><p class="muted">${ico('lock')} ${t('This Gym Battle is over. Only the admin can change it now.')}</p>` : runForm()}</section>
    <section>
      <h2 class="title">${t('Run history')} <small>${t('{n} runs', { n: S.runs.length })}</small></h2>
      <div class="card filters" id="log-filters">${logFilters()}</div>
      <div class="card scroll" id="log-table">${logTable()}</div>
    </section>
  </div>`;
}

function runForm() {
  const s = season(), st = state();
  const c = circuitAt(s, form.round);
  const same = form.id && form.orig;
  const have = pointsIn(st, form.round, form.leader) - (same && form.orig.round === form.round && form.orig.leader === form.leader ? form.orig.score : 0);
  const used = (st.perMember[form.user_id]?.tickets || 0) - (same && form.orig.user_id === form.user_id ? form.orig.tickets : 0);
  const rounds = Array.from({ length: Math.max(st.active || 0, st.maxRound) + (isStaff() ? 1 : 0) }, (_, i) => i + 1).filter(n => circuitAt(s, n));
  return `
  <h2 class="title">${form.id ? t('Edit run') : t('Log a run')}</h2>
  <form id="run-editor" class="form">
    <label>${t('Member')}
      <select name="user_id" ${isStaff() ? '' : 'disabled'}>${S.profiles.map(p => `<option value="${p.id}" ${p.id === form.user_id ? 'selected' : ''}>${esc(nameOf(p))}${st.banned.has(p.id) ? ` (${t('locked')})` : ''}</option>`).join('')}</select>
      <small class="muted">${t('{used} of {granted} tickets used', { used, granted: st.granted })}</small>
    </label>
    <div class="field"><span>${t('Gym Leader')}</span>
      <div class="leader-pick">${s.leaders.map(l => {
        const v = pointsIn(st, form.round, l.name), full = v >= (c?.pts || 0);
        const planned = assignment(form.user_id, l.name);
        return `<button type="button" class="lp ${l.name === form.leader ? 'on' : ''} ${full ? 'full' : ''}" data-f-leader="${esc(l.name)}" style="--tc:${tc(l.type)}">
          ${planned ? `<span class="plan-dot" title="${t('Assigned to this member')}"></span>` : ''}
          ${leaderImg(s, l.name)}<b>${esc(l.name)}</b><small>${full ? `${ico('check')} ${t('cleared')}` : t('{n} to go', { n: fmtK((c?.pts || 0) - v) })}</small></button>`;
      }).join('')}</div></div>
    <div class="grid3">
      <label>${t('Round')}
        <select name="round" ${isStaff() || form.id ? '' : 'disabled'}>${rounds.map(n => `<option value="${n}" ${n === form.round ? 'selected' : ''}>${esc(circuitAt(s, n).label)}${n === st.active ? ` · ${t('open')}` : ''}</option>`).join('')}</select>
      </label>
      <div class="field"><span>${t('Tickets')}</span><div class="seg">${[1, 2, 3].map(n => `<button type="button" data-f-tickets="${n}" class="${form.tickets === n ? 'on' : ''}" ${c?.fixed && n !== c.fixed ? 'disabled' : ''}>×${n}</button>`).join('')}</div></div>
      <label>${t('Score')}<input name="score" type="number" min="0" step="1" inputmode="numeric" value="${esc(form.score)}" placeholder="${t('e.g. {n}', { n: 35000 })}">
        <small class="muted">${form.leader ? t('Cap {cap} · {n} to go', { cap: fmtN(c?.pts), n: fmtN(Math.max(0, (c?.pts || 0) - have)) }) : t('Pick a Gym Leader')}</small></label>
    </div>
    <div class="field"><span>${t('Team (1–3 sync pairs)')}</span>
      <div class="slots">
      ${form.planned ? `<div class="planned">${ico('star')} ${t('Planned team for {l}', { l: esc(form.leader) })}</div>` : ''}
      ${[0, 1, 2].map(i => {
        const x = form.team[i], p = x && pairById(x.pair_id);
        return x ? `<div class="slot">${ownIcon(p, x, 'sm')}<div><b>${esc(p?.trainer || '?')}</b><small>${esc(p?.pokemon || '')}</small></div>
          <span class="badge">${levelLabel(x.level || 1)}${x.ex ? ' · EX' : ''}${x.ex_role ? ' · EXR' : ''}</span>
          <button type="button" class="x" data-f-drop="${i}" aria-label="${t('Remove')}">${ico('x')}</button></div>` : '';
      }).join('')}
      ${form.team.length < 3 ? `<div class="search-box"><input id="team-search" placeholder="${t('Search sync pairs — this member’s own pairs come first…')}" autocomplete="off"><div class="results" id="team-results"></div></div>` : ''}
      </div></div>
    <label>${t('Battle ended at')}<input name="occurred" type="datetime-local" value="${esc(form.occurred || '')}" required>
      <small class="muted">${t('Your time zone: {z}. Only changes the order of the history — not the round or tickets.', { z: viewTz() })}</small></label>
    <label>${t('Note')}<input name="note" value="${esc(form.note)}" placeholder="${t('e.g. used 2 sync moves, buff failed…')}"></label>
    <div class="row">
      <button class="btn primary">${ico('swords')} ${form.id ? t('Save changes') : t('Log run')}</button>
      ${form.id ? `<button type="button" class="btn ghost" data-f-cancel>${t('Cancel')}</button>` : ''}
      <p class="form-err" id="run-err"></p>
    </div>
  </form>`;
}
const redrawForm = () => { $('#run-form').innerHTML = runForm(); };
const refillTeam = () => { if (form.auto) Object.assign(form, autoTeam(form.user_id, form.leader)); };

function searchPairs(q, uid) {
  const mine = new Map(owned(uid).map(x => [x.pair_id, x]));
  const s = q.trim().toLowerCase();
  const taken = new Set(form.team.map(x => x.pair_id));
  return PAIRS().filter(p => !taken.has(p.id) && (!s || `${p.trainer} ${p.pokemon}`.toLowerCase().includes(s)))
    .sort((a, b) => (mine.has(b.id) - mine.has(a.id)) || (s && (a.trainer.toLowerCase().startsWith(s) ? -1 : b.trainer.toLowerCase().startsWith(s) ? 1 : 0)))
    .slice(0, 12).map(p => ({ p, mp: mine.get(p.id) }));
}

document.addEventListener('input', e => {
  if (e.target.id === 'team-search') {
    $('#team-results').innerHTML = searchPairs(e.target.value, form.user_id).map(({ p, mp }) => `<button type="button" data-f-add="${p.id}">
      ${pairIcon(p, 'xs')}<span>${esc(pairName(p))}</span>${typeTag(p.type)}<small>${mp ? `${levelLabel(mp.level)}${mp.ex ? ' EX' : ''}` : t('not owned')}</small></button>`).join('')
      || `<p class="muted">${t('No sync pair found.')}</p>`;
  }
  if (e.target.form?.id === 'run-editor' && ['score', 'note', 'occurred'].includes(e.target.name)) form[e.target.name] = e.target.value;
});
document.addEventListener('focusin', e => { if (e.target.id === 'team-search') e.target.dispatchEvent(new Event('input', { bubbles: true })); });
document.addEventListener('change', e => {
  if (e.target.form?.id !== 'run-editor') return;
  if (e.target.name === 'user_id') { form.user_id = e.target.value; refillTeam(); redrawForm(); }
  if (e.target.name === 'round') {
    form.round = +e.target.value;
    const c = circuitAt(season(), form.round);
    if (c?.fixed) form.tickets = c.fixed;
    redrawForm();
  }
});
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-f-leader],[data-f-tickets],[data-f-add],[data-f-drop],[data-f-cancel],[data-run-edit],[data-run-del]');
  if (!el) return;
  if (el.dataset.fLeader) { form.leader = el.dataset.fLeader; refillTeam(); redrawForm(); }
  if (el.dataset.fTickets) { form.tickets = +el.dataset.fTickets; redrawForm(); }
  if (el.dataset.fAdd) {
    const mp = ownedPair(form.user_id, el.dataset.fAdd);
    form.team.push({ pair_id: el.dataset.fAdd, level: mp?.level || 1, stars: mp?.stars, ex: !!mp?.ex, ex_role: !!mp?.ex_role });
    form.auto = form.planned = false;
    redrawForm();
    $('#team-search')?.focus();
  }
  if (el.dataset.fDrop) { form.team.splice(+el.dataset.fDrop, 1); form.auto = form.planned = false; redrawForm(); }
  if ('fCancel' in el.dataset) { form = blankForm(); redrawForm(); }
  if (el.dataset.runEdit) {
    const r = S.runs.find(x => x.id === +el.dataset.runEdit);
    form = { ...r, team: r.team.map(x => ({ ...x })), score: String(r.score), occurred: toLocalInput(r.occurred_at || r.created_at, viewTz()), orig: r, auto: false, planned: false };
    redrawForm();
    $('#run-form').scrollIntoView({ behavior: 'smooth' });
  }
  if (el.dataset.runDel) {
    const r = S.runs.find(x => x.id === +el.dataset.runDel);
    if (!confirm(t('Delete the run by {m} on {l} ({s} points)?', { m: r.member_name, l: r.leader, s: fmtN(r.score) }))) return;
    if (await act(() => api.deleteRun(r.id), t('Run deleted.'))) { await loadSeason(); route(); }
  }
});
document.addEventListener('submit', async e => {
  if (e.target.id !== 'run-editor') return;
  e.preventDefault();
  const s = season();
  const run = { season_id: s.id, user_id: form.user_id, leader: form.leader, round: form.round, tickets: form.tickets,
    score: Number(form.score), team: form.team, note: form.note || '', occurred_at: fromLocalInput(form.occurred, viewTz()) };
  if (!run.occurred_at) { $('#run-err').textContent = t('Pick when the battle ended.'); return; }
  const st = seasonState(s, S.runs.filter(r => r.id !== form.id), S.sm);   // as the database sees it
  const err = validateRun(s, st, run, { isStaff: isStaff() || !!form.id });
  if (err) { $('#run-err').textContent = err; return; }
  const done = form.id
    ? await act(() => api.updateRun(form.id, run), t('Changes saved.'))
    : await act(() => api.createRun(run), t('Logged {n} points on {l}.', { n: fmtN(run.score), l: run.leader }));
  if (!done) return;
  await loadSeason();
  form = blankForm(form.id ? '' : run.leader, null, form.user_id);
  route();
});

function logFilters() {
  const s = season(), st = state();
  const names = [...new Set(S.runs.map(r => r.member_name))].sort();
  return `<select data-lf="member"><option value="">${t('All members')}</option>${names.map(n => `<option ${logFilter.member === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
    <select data-lf="leader"><option value="">${t('All Gym Leaders')}</option>${s.leaders.map(l => `<option ${logFilter.leader === l.name ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>
    <select data-lf="round"><option value="">${t('All rounds')}</option>${Array.from({ length: st.maxRound }, (_, i) => i + 1).map(n => `<option value="${n}" ${+logFilter.round === n ? 'selected' : ''}>${esc(circuitAt(s, n)?.label || n)}</option>`).join('')}</select>`;
}
function logTable() {
  const f = logFilter;
  const list = S.runs.filter(r => (!f.member || r.member_name === f.member) && (!f.leader || r.leader === f.leader) && (!f.round || r.round === +f.round));
  if (!list.length) return `<p class="muted pad">${t('No runs yet.')}</p>`;
  return `<table class="table">
    <thead><tr><th>${t('When')}</th><th>${t('Member')}</th><th>${t('Gym Leader')}</th><th>${t('Round')}</th><th class="num">${t('Tickets')}</th><th class="num">${t('Score')}</th><th>${t('Team')}</th><th></th></tr></thead>
    <tbody>${list.map(r => `<tr>
      <td class="muted nowrap" title="${r.occurred_inferred ? t('Time estimated from when the run was entered') : ''}">${fmtDT(r.occurred_at || r.created_at)}${r.occurred_inferred ? '*' : ''}</td><td>${esc(r.member_name)}</td><td>${esc(r.leader)}</td>
      <td class="nowrap">${esc(roundShort(circuitAt(season(), r.round)?.label || r.round))}</td><td class="num">${r.tickets}</td>
      <td class="num"><b>${fmtN(r.score)}</b></td><td class="team">${teamIcons(r.team)}${r.note ? ` <span class="muted" title="${esc(r.note)}">${ico('note')}</span>` : ''}</td>
      <td class="acts">${canEdit(r.user_id) ? `<button class="btn sm ghost" data-run-edit="${r.id}">${t('Edit')}</button><button class="btn sm ghost" data-run-del="${r.id}" aria-label="${t('Delete')}">${ico('x')}</button>` : ''}</td></tr>`).join('')}
    </tbody></table>`;
}
document.addEventListener('change', e => {
  const k = e.target.dataset.lf;
  if (!k) return;
  logFilter[k] = e.target.value;
  lockCtx = frozen();
  try { $('#log-table').innerHTML = logTable(); } finally { lockCtx = false; }
});

// ═══════════════════════════════════════════════════════════════
//  BATTLE INFO: everything the datamine says about the Gym Battle
// ═══════════════════════════════════════════════════════════════
let infoStage = 0, infoTab = 'bosses';
const plain = x => String(x || '').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').replace(/\s+/g, ' ').trim();
function renderInfo() {
  const s = season();
  if (!s) return seasonBar() + noSeason();
  const g = GYMS().find(x => x.name === (s.gym_key || s.name)) || GYMS().find(x => s.name.startsWith(x.name));
  if (!g) return `${seasonBar()}<div class="card pad"><h2 class="title">${t('Battle info')}</h2><p class="muted">${t('The datamine has no details for this Gym Battle.')}</p></div>`;
  const tabs = [['bosses', 'Opponents'], ['next', 'Next rounds'], ['schedule', 'Schedule and tickets'], ['rewards', 'Rewards']];
  const st = g.stages[Math.min(infoStage, g.stages.length - 1)], c = g.circuits[Math.min(infoStage, g.circuits.length - 1)];
  const maxHp = Math.max(1, ...g.stages.flatMap(x => x.leaders.flatMap(l => (l.units || []).map(u => u.hp || 0))));
  const stat = (k, v) => `<span class="us"><small>${k}</small><b>${fmtN(v)}</b></span>`;
  const unit = u => `<div class="unit"><div class="unit-h"><b>${t(u.pos)}</b> ${u.weakness ? `<span class="weak">${t('Weak to')} ${img(typeIcon(u.weakness), 'ti', u.weakness)}</span>` : ''}</div>
    <div class="hpbar" title="${fmtN(u.hp)} HP"><i style="width:${Math.max(1.5, u.hp / maxHp * 100)}%"></i></div>
    <div class="ustats">${stat('HP', u.hp)}${stat('ATK', u.atk)}${stat('DEF', u.def)}${stat('SP.ATK', u.spa)}${stat('SP.DEF', u.spd)}${stat('SPE', u.spe)}</div>
    ${(u.focus || []).length ? `<div class="chips-l"><small>${t('Focus')}</small>${u.focus.map(f => `<span class="chip">${esc(f)}</span>`).join('')}</div>` : ''}
    ${u.reduction ? `<div class="chips-l"><small>${t('Condition')}</small><span class="chip">${esc(u.reduction)}</span>${(u.reductionMods || []).map(f => `<span class="chip dim">${esc(f)}</span>`).join('')}</div>` : ''}
    ${(u.passives || []).length ? `<div class="chips-l"><small>${t('Passives')}</small>${u.passives.map(f => `<span class="chip">${esc(f)}</span>`).join('')}</div>` : ''}</div>`;

  // HP of the centre boss through the circuits (the first leader of each circuit; every leader scales the same way)
  const hpSeries = g.stages.map(x => Math.max(0, ...x.leaders.map(l => l.units?.[0]?.hp || 0)));
  const hpTop = Math.max(1, ...hpSeries);
  const hpChart = `<div class="card pad"><h2 class="title">${t('Boss HP by circuit')} <small>${t('click a bar to open that circuit')}</small></h2>
    <div class="bars">${hpSeries.map((v, i) => `<button class="bar ${i === infoStage ? 'on' : ''}" data-istage="${i}" title="${esc(g.stages[i].name)}: ${fmtN(v)} HP"><span class="bv">${fmtK(v)}</span><i style="height:${Math.max(2, v / hpTop * 100)}%"></i><span class="bl">${esc(roundShort(g.stages[i].name))}</span></button>`).join('')}</div></div>`;
  // Which leader brings which condition / passive / focus (any of their units): a matrix to compare the eight at a glance
  const kinds = [['Focus', u => u.focus || []], ['Condition', u => [u.reduction, ...(u.reductionMods || [])].filter(Boolean)], ['Passives', u => u.passives || []]];
  const has = (l, fn, name) => (l.units || []).some(u => fn(u).includes(name));
  const matrix = `<div class="card scroll"><table class="matrix"><thead><tr><th></th>${st.leaders.map(l => `<th style="--tc:${tc(l.type)}">${leaderImg(s, l.name)}<b>${esc(l.name)}</b></th>`).join('')}</tr></thead>
    <tbody>${kinds.map(([title, fn]) => {
      const names = [...new Set(st.leaders.flatMap(l => (l.units || []).flatMap(fn)))];
      return `<tr class="mh"><th colspan="${st.leaders.length + 1}">${t(title)}</th></tr>` + names.map(n => {
        const n8 = st.leaders.filter(l => has(l, fn, n)).length;
        return `<tr class="${n8 === st.leaders.length ? 'all' : ''}"><th>${esc(n)}</th>${st.leaders.map(l => `<td style="--tc:${tc(l.type)}">${has(l, fn, n) ? '<i class="dot-on"></i>' : ''}</td>`).join('')}</tr>`;
      }).join('');
    }).join('')}</tbody></table></div>`;
  const body = infoTab === 'next' ? nextRounds(s, g) : infoTab === 'schedule' ? `
    <div class="cols"><section><h2>${t('Schedule')}</h2><div class="card list">${g.phases.map(p => `<div class="run"><div><b>${esc(t(p.name))}</b><small class="muted">${fmtDT(p.start + 'Z')} → ${fmtDT(p.end + 'Z')}</small></div></div>`).join('')}</div></section>
    <section><h2>${t('Tickets and time')}</h2><div class="card scroll"><table class="table"><thead><tr><th class="num">${t('Tickets')}</th><th>${t('Time limit')}</th><th class="num">${t('Buff')}</th></tr></thead>
      <tbody>${g.tickets.map(x => `<tr><td class="num">×${x.tickets}</td><td>${esc(x.time)}</td><td class="num">${x.buff ? '+' + x.buff : '—'}</td></tr>`).join('')}</tbody></table></div></section></div>
    <h2 class="section">${t('Circuits')}</h2><div class="card scroll"><table class="table"><thead><tr><th>${t('Circuit')}</th><th>${t('Kind')}</th><th>${t('Ball')}</th><th class="num">${t('Points per leader')}</th></tr></thead>
      <tbody>${g.circuits.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.kind)}</td><td>${esc(x.ball)}</td><td class="num">${fmtN(x.pts)}</td></tr>`).join('')}</tbody></table></div>
    ${g.rotateNote ? `<p class="muted">${esc(g.rotateNote)}</p>` : ''}`
  : infoTab === 'rewards' ? `
    <div class="cols"><section><h2>${t('Score rewards')}</h2><div class="card scroll"><table class="table"><tbody>${(g.score || []).map(x => `<tr><td class="num"><b>${fmtN(x.pts)}</b></td><td>${x.tag ? `<span class="badge gold">${esc(plain(x.tag))}</span> ` : ''}${x.items.map(i => esc(plain(i))).join(', ')}</td></tr>`).join('')}</tbody></table></div></section>
    <section><h2>${t('Ranking rewards')}</h2><div class="card scroll"><table class="table"><tbody>${(g.ranking || []).map(x => `<tr><td><b>${esc(plain(x.label))}</b></td><td>${x.items.map(i => esc(plain(i))).join(', ')}</td></tr>`).join('')}</tbody></table></div></section></div>`
  : `<div class="seg wrap">${g.stages.map((x, i) => `<button class="${i === infoStage ? 'on' : ''}" data-istage="${i}">${esc(roundShort(x.name))}</button>`).join('')}</div>
    <p class="muted">${esc(c.name)} · ${esc(c.kind)} · ${esc(c.ball)} · ${t('{n} points per leader', { n: fmtN(c.pts) })}</p>
    ${hpChart}
    <h2 class="section">${t('Conditions at a glance')} <small>${t('{c}: what each leader brings', { c: roundShort(st.name) })}</small></h2>${matrix}
    <h2 class="section">${t('Every opponent')}</h2>
    <div class="info-grid">${st.leaders.map(l => `<article class="card pad info-l" style="--tc:${tc(l.type)}">
      <header>${leaderImg(s, l.name)}<div><h3>${esc(l.name)}</h3><small class="muted">${img(typeIcon(l.type), 'ti', l.type)} ${esc(l.title || '')}</small></div></header>
      <div class="rules"><small>${t('Rules')}</small>${l.rules?.length ? l.rules.map((r, i) => `<p><b>${t('Rules')} ${i + 1}</b> ${esc(r)}</p>`).join('') : `<p>${esc(l.rule || l.theme || t('No rules'))}</p>`}
        ${l.rule && l.theme && l.theme !== l.rule && !l.rules?.length ? `<p class="muted">${esc(l.theme)}</p>` : ''}</div>
      ${(l.units || []).map(unit).join('')}</article>`).join('')}</div>`;
  return `${seasonBar()}
  <div class="toolbar"><h1>${t('Battle info')} <small class="muted">${esc(g.name)}${g.version ? ` · v${esc(g.version)}` : ''}</small></h1>
    <div class="seg">${tabs.map(([k, l]) => `<button class="${infoTab === k ? 'on' : ''}" data-itab="${k}">${t(l)}</button>`).join('')}</div></div>${body}`;
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-istage]'), b = e.target.closest('[data-itab]');
  if (a) { infoStage = +a.dataset.istage; route(); } else if (b) { infoTab = b.dataset.itab; route(); }
});

// ═══════════════════════════════════════════════════════════════
//  RESOURCES: a library of links (tier lists, trackers, sheets, guides)
// ═══════════════════════════════════════════════════════════════
const RES_CATS = [['tier_cn', 'Tier list (China)'], ['tier_spark', 'Spark tier list'], ['tier_jp', 'Tier list (Japan)'], ['tracker', 'Trackers and tools'], ['sheet', 'Sheets'], ['guide', 'Guides'], ['other', 'Other']];
const RES_LANG = { en: 'English', vi: 'Tiếng Việt', zh: '中文', ja: '日本語' };
const resFilter = { cat: '', lang: '', q: '' };
let resEdit = null;   // null = closed, {} = new, {id…} = editing
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const resStatus = r => r.status === 'broken' ? ['bad', 'Link broken'] : r.status === 'ok' ? ['good', 'Works'] : ['', 'Not checked'];
function renderResources() {
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
document.addEventListener('input', e => { if (e.target.id === 'res-q') { resFilter.q = e.target.value; const pos = e.target.selectionStart; route(); const el = $('#res-q'); el?.focus(); el?.setSelectionRange(pos, pos); } });
document.addEventListener('change', e => { if (e.target.dataset?.resLang !== undefined) { resFilter.lang = e.target.value; route(); } });
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-res-cat],[data-res-new],[data-res-edit],[data-res-close],[data-res-ok],[data-res-bad],[data-res-del]');
  if (!el) return;
  const d = el.dataset, byId = id => S.resources.find(x => x.id === +id);
  const refresh = async () => { S.resources = await api.resources(); route(); };
  if ('resCat' in d) { resFilter.cat = d.resCat; route(); }
  else if ('resNew' in d) { resEdit = {}; route(); }
  else if (d.resEdit) { resEdit = { ...byId(d.resEdit) }; route(); window.scrollTo({ top: 0 }); }
  else if ('resClose' in d) { resEdit = null; route(); }
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
  if (await act(() => api.saveResource(row), t('Saved.'))) { resEdit = null; S.resources = await api.resources(); route(); }
});

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

function renderStrategies() {
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

const stratRefresh = async () => { S.strats = await api.strategies(); route(); };
const stratFields = f => ({ title: f.title.trim(), boss: f.boss.trim(), weakness: f.weakness || '', season_label: f.season_label.trim(), conditions: f.conditions.trim(), team: stratEdit.team || [],
  grid_note: f.grid_note.trim(), rotation: f.rotation.trim(), video_url: f.video_url.trim() });
const blankStrat = () => ({ mode: 'GvG', title: '', boss: '', weakness: '', season_label: season()?.name || '', conditions: '', team: [], grid_note: '', rotation: '', video_url: '' });
const readStratForm = () => { const f = Object.fromEntries(new FormData($('#strat-form'))); Object.assign(stratEdit, stratFields({ ...stratEdit, ...f })); return f; };

document.addEventListener('input', e => {
  if (e.target.id === 'strat-q') { stratFilter.q = e.target.value; const pos = e.target.selectionStart; route(); const el = $('#strat-q'); el?.focus(); el?.setSelectionRange(pos, pos); }
  if (e.target.id === 'strat-pair-q') {
    const q = e.target.value.trim().toLowerCase(), have = new Set((stratEdit.team || []).map(x => x.pair_id));
    $('#strat-pair-results').innerHTML = (q ? PAIRS().filter(p => !have.has(p.id) && `${p.trainer} ${p.pokemon}`.toLowerCase().includes(q)).slice(0, 12) : [])
      .map(p => `<button type="button" data-strat-add="${p.id}">${pairIcon(p, 'xs')}<span>${esc(pairName(p))}</span>${typeTag(p.type)}</button>`).join('') || `<p class="muted">${t('No sync pair found.')}</p>`;
  }
});
document.addEventListener('change', e => { const k = e.target.dataset?.stratF; if (k) { stratFilter[k] = e.target.value; route(); } });
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-strat-open],[data-strat-new],[data-strat-view],[data-strat-close],[data-strat-cancel],[data-strat-edit],[data-strat-revise],[data-strat-submit],[data-strat-withdraw],[data-strat-del],[data-strat-archive],[data-strat-approve],[data-strat-changes],[data-strat-apply],[data-strat-add],[data-strat-drop],[data-save]');
  if (!el) return;
  const d = el.dataset, rev = id => S.strats.revisions.find(x => x.id === +id);
  if (d.stratOpen) { stratOpen = +d.stratOpen; stratEdit = null; route(); window.scrollTo({ top: 0 }); }
  else if ('stratNew' in d) { stratEdit = blankStrat(); stratOpen = null; route(); }
  else if (d.stratView) { stratView = d.stratView; route(); }
  else if ('stratClose' in d) { stratOpen = null; route(); }
  else if ('stratCancel' in d) { stratEdit = null; route(); }
  else if (d.stratEdit) { stratEdit = { ...rev(d.stratEdit), team: (rev(d.stratEdit).team || []).map(x => ({ ...x })) }; route(); }
  else if (d.stratRevise) {   // a new revision starts as a copy of the published one
    const r = rev(d.stratRevise);
    stratEdit = { ...r, id: null, strategy_id: r.strategy_id, review_note: '', team: (r.team || []).map(x => ({ ...x })) }; route();
  }
  else if (d.stratAdd) { readStratForm(); stratEdit.team.push({ pair_id: d.stratAdd }); route(); }
  else if (d.stratDrop !== undefined) { readStratForm(); stratEdit.team.splice(+d.stratDrop, 1); route(); }
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

// ── Next rounds: what the open round and the ones after it will bring, and what the datamine knows about coming Gym Battles ──
const leaderCard = (s, name, n, stage) => {
  const l = s.leaders.find(x => x.name === name) || { name }, rule = leaderRule(s, name, n), focus = leaderFocus(s, name, n);
  const dl = stage?.leaders.find(x => x.name === name), u = dl?.units?.[0];
  return `<div class="nr-l" style="--tc:${tc(l.type)}">${leaderImg(s, name)}<div><b>${esc(name)}</b> ${(l.weakness || []).map(w => img(typeIcon(w), 'ti', w)).join('')}
    <small class="muted">${esc(rule || t('No rules'))}</small>
    ${focus.length ? `<div class="chips-l">${focus.map(f => `<span class="chip">${esc(f)}</span>`).join('')}</div>` : ''}
    ${u ? `<small class="muted">${t('Boss HP')} ${fmtN(u.hp)}${(u.passives || []).length ? ` · ${esc(u.passives.join(', '))}` : ''}</small>` : ''}</div></div>`;
};
// What changed between the stored snapshot of a season and the latest datamine
function snapshotDiff(s, g) {
  const snap = s.gym_data?.stages || [], out = [];
  if (snap.length && snap.length !== g.stages.length) out.push(t('{a} circuits stored, {b} in the datamine', { a: snap.length, b: g.stages.length }));
  g.stages.forEach((st, i) => st.leaders.forEach(l => {
    const old = snap[i]?.leaders.find(x => x.name === l.name);
    if (!old) { if (snap.length) out.push(`${st.name} · ${l.name}: ${t('new')}`); return; }
    const a = JSON.stringify([old.theme, old.rules, old.focus]), b = JSON.stringify([l.theme, l.rules, l.units?.[0]?.focus || []]);
    if (a !== b) out.push(`${st.name} · ${l.name}`);
  }));
  return out;
}
function nextRounds(s, g) {
  const st = state(), meta = GYMS_META(), now = Date.now();
  const over = st.phase === 'ended' || st.finished, start = st.active || 1;
  const rounds = over ? [] : [start, start + 1, start + 2].filter(n => circuitAt(s, n));
  const known = new Set(S.seasons.map(x => x.gym_key).filter(Boolean));
  const coming = GYMS().filter(x => !known.has(x.name) && Date.parse((x.phases.find(p => p.name === 'Battle') || {}).start + 'Z') > now);
  const diff = g ? snapshotDiff(s, g) : [];
  const stageOf = n => g?.stages[Math.min(n, g.stages.length) - 1];
  const src = `<div class="card pad nr-src"><b>${t('Where this comes from')}</b>
    <p class="muted">${t('Season data stored on {d}.', { d: fmtD(s.created_at) })} ${meta.builtAt ? t('Datamine: game version {v}, built {d}.', { v: (meta.versions || []).join(', ') || '—', d: fmtD(meta.builtAt) }) : t('The datamine could not be loaded: showing the stored data only.')}</p>
    ${diff.length ? `<p class="notice">${ico('note')} ${t('The datamine differs from the stored data in {n} places.', { n: diff.length })}</p><ul class="muted">${diff.slice(0, 8).map(x => `<li>${esc(x)}</li>`).join('')}${diff.length > 8 ? `<li>…</li>` : ''}</ul>
      ${isStaff() ? `<button class="btn" data-apply-datamine>${t('Update the stored data from the datamine')}</button>` : `<small class="muted">${t('A mod or the admin can apply it.')}</small>`}`
      : g ? `<p class="muted">${ico('check')} ${t('The stored data matches the datamine.')}</p>` : ''}</div>`;
  return `${src}
  <h2 class="section">${esc(s.name)} <small>${over ? t('No rounds left in this Gym Battle.') : t('the open round and the next two')}</small></h2>
  ${rounds.map(n => { const c = circuitAt(s, n);
    return `<section class="card pad nr"><div class="row"><h3>${esc(c.label)}${n === st.active ? ` <span class="badge good">${t('open')}</span>` : ''}</h3><span class="spacer"></span><small class="muted">${t('{n} points per leader', { n: fmtN(c.pts) })}</small></div>
      <div class="nr-grid">${s.leaders.map(l => leaderCard(s, l.name, n, stageOf(n))).join('')}</div></section>`; }).join('')}
  <h2 class="section">${t('Coming Gym Battles')} <small>${t('from the datamine, not confirmed by the game yet')}</small></h2>
  ${coming.map(x => { const b = x.phases.find(p => p.name === 'Battle') || {}, first = x.stages[0], sx = { leaders: first.leaders.map(l => ({ name: l.name, type: l.type, weakness: [...new Set((l.units || []).map(u => u.weakness).filter(Boolean))] })), gym_data: seasonFromGym(x).gym_data };
    return `<section class="card pad nr"><div class="row"><h3>${esc(x.name)}</h3><span class="badge gold">${t('Datamine, unconfirmed')}</span><span class="spacer"></span><small class="muted">${fmtDT(b.start + 'Z')} → ${fmtDT(b.end + 'Z')}</small></div>
      <small class="muted">${esc(first.name)}</small><div class="nr-grid">${sx.leaders.map(l => leaderCard(sx, l.name, 1, first)).join('')}</div></section>`; }).join('')
    || `<p class="muted">${t('The datamine has no Gym Battle after this one yet.')}</p>`}`;
}
document.addEventListener('click', async e => {
  if (!e.target.closest('[data-apply-datamine]')) return;
  const s = season(), g = GYMS().find(x => x.name === (s.gym_key || s.name));
  if (!g || !confirm(t('Replace the stored rules and boss focus of {s} with the datamine? Scores and rounds are not touched.', { s: s.name }))) return;
  if (await act(() => api.updateSeason(s.id, { gym_data: seasonFromGym(g).gym_data }), t('Stored data updated.'))) { S.seasons = await api.seasons(); route(); }
});
// ═══════════════════════════════════════════════════════════════
//  TRAINER LODGE: which topics each Sync Pair likes (static lookup, copied from Serebii with the date)
// ═══════════════════════════════════════════════════════════════
const lodgeState = { mode: 'trainer', q: '', trainer: '', cat: '' };
const LODGE_PTS = ['10', '7', '5'];
async function loadLodge() {
  if (S.lodge) return;
  try { const r = await fetch('data/lodge.json'); if (r.ok) S.lodge = await r.json(); } catch { /* shown as unavailable */ }
}
function renderLodge() {
  const d = S.lodge, ls = lodgeState;
  if (!d) { loadLodge().then(() => { if (S.lodge && location.hash.startsWith('#/lodge')) route(); }); return `<div class="toolbar"><h1>${t('Trainer Lodge')}</h1></div><p class="muted">${t('Loading…')}</p>`; }
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
document.addEventListener('input', e => { if (e.target.id === 'lodge-q') { lodgeState.q = e.target.value; const pos = e.target.selectionStart; route(); const el = $('#lodge-q'); el?.focus(); el?.setSelectionRange(pos, pos); } });
document.addEventListener('change', e => { if (e.target.dataset?.lodgeCat !== undefined) { lodgeState.cat = e.target.value; route(); } });
document.addEventListener('click', e => {
  const m = e.target.closest('[data-lodge-mode]'), tr = e.target.closest('[data-lodge-trainer]');
  if (m) { lodgeState.mode = m.dataset.lodgeMode; lodgeState.q = ''; route(); }
  if (tr) { lodgeState.trainer = tr.dataset.lodgeTrainer; route(); }
});

// ═══════════════════════════════════════════════════════════════
//  SYNC GRID: moves and passives of a pair, and a grid builder (rules in grid.js)
// ═══════════════════════════════════════════════════════════════
const G = { pairId: '', detail: null, err: '', ix: null, active: new Set(), moveLevel: 5, energyCap: null, sel: null, tab: 'grid', buildId: null,
  name: '', purpose: '', visibility: 'private', saved: null, hash: '', msg: '' };
const gridZoom = () => { try { return +localStorage.getItem('gym-grid-zoom') || 1; } catch { return 1; } };
const BUILD_WHY = { 'not-adjacent': 'next to no active tile', 'move-level': 'needs a higher move level', energy: 'over the energy limit', unknown: 'tile no longer exists' };
let gridQuery = '';

function renderGrid(pairId = '', buildId = '') {
  if (!pairId) return gridHome();
  if (G.pairId !== pairId || (buildId && G.buildId !== +buildId)) {
    Object.assign(G, { pairId, detail: null, err: '', ix: null, active: new Set(), sel: null, tab: 'grid', buildId: null, name: '', purpose: '', visibility: 'private', saved: null, msg: '', moveLevel: 5, energyCap: null });
    const mine = ownedPair(S.me, pairId);
    if (mine) G.moveLevel = Math.min(5, mine.level || 5);
    const b = buildId && S.builds.find(x => x.id === +buildId);
    if (b) Object.assign(G, { buildId: b.id, name: b.name, purpose: b.purpose, visibility: b.visibility, moveLevel: b.move_level, energyCap: b.energy_cap, active: new Set(b.nodes), saved: b });
    const dexId = pairById(pairId) && dexIdOf(pairById(pairId));
    (dexId ? loadPairDetail(dexId) : Promise.reject(new Error('unmapped'))).then(d => { G.detail = d; G.ix = indexGrid(d.grid || []); G.hash = gridHash(d.grid || []); if (location.hash.startsWith('#/grid/')) route(); })
      .catch(() => { G.err = 'load'; if (location.hash.startsWith('#/grid/')) route(); });
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
  if (e.target.id === 'grid-q') { gridQuery = e.target.value; const pos = e.target.selectionStart; route(); const el = $('#grid-q'); el?.focus(); el?.setSelectionRange(pos, pos); }
  if (e.target.id === 'grid-zoom') { try { localStorage.setItem('gym-grid-zoom', e.target.value); } catch { /* private mode */ } const b = $('#grid-board'); if (b) { const sc = $('.grid-scroll'), l = sc?.scrollLeft, tp = sc?.scrollTop; b.innerHTML = gridBoard(); const n = $('.grid-scroll'); n.scrollLeft = l; n.scrollTop = tp; } }
});
document.addEventListener('change', e => {
  if (e.target.id === 'g-level') { gridKeepFields(); G.moveLevel = +e.target.value; gridRedraw(); }
  if (e.target.id === 'g-cap') { gridKeepFields(); G.energyCap = e.target.value === '' ? null : Math.max(0, +e.target.value); gridRedraw(); }
  if (e.target.id === 'g-vis') { gridKeepFields(); G.visibility = e.target.value; gridRedraw(); }
});
document.addEventListener('click', async e => {
  const tile = e.target.closest('[data-gtile]'), tog = e.target.closest('[data-gtoggle]'), tab = e.target.closest('[data-gtab]');
  if (tab) { G.tab = tab.dataset.gtab; route(); return; }
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

// ═══════════════════════════════════════════════════════════════
//  FREE GEMS: what is still to be earned until the end of the month (Free Gems only, a projection)
// ═══════════════════════════════════════════════════════════════
const gemUi = { tab: 'projection', month: 0, edit: null, evEdit: null };
const GEM_KINDS = [['daily', 'Every day'], ['on_date', 'One day'], ['window', 'Once, any day in the range']];
const fmtServerDay = d => new Date(`${d}T00:00:00Z`).toLocaleDateString(locale(), { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
function renderGems() {
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
    if (await act(() => api.saveGemSettings(patch), t('Saved.'))) { S.gems = await api.gems(); route(); }
  }
});
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-gem-tab],[data-gem-month],[data-gem-new],[data-gem-ev-new],[data-gem-cancel],[data-gem-edit],[data-gem-del],[data-gem-ev-del]');
  if (!el) return;
  const d = el.dataset, refresh = async () => { S.gems = await api.gems(); route(); };
  if (d.gemTab) { gemUi.tab = d.gemTab; route(); }
  else if (d.gemMonth !== undefined) { gemUi.month = +d.gemMonth; route(); }
  else if ('gemNew' in d) { gemUi.edit = { kind: 'daily' }; gemUi.evEdit = null; route(); }
  else if ('gemEvNew' in d) { gemUi.evEdit = {}; gemUi.edit = null; route(); }
  else if ('gemCancel' in d) { gemUi.edit = gemUi.evEdit = null; route(); }
  else if (d.gemEdit) { gemUi.edit = { ...S.gems.rewards.find(r => r.id === +d.gemEdit) }; route(); window.scrollTo({ top: 0 }); }
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
    if (await act(() => api.saveGemReward(row), t('Saved.'))) { gemUi.edit = null; S.gems = await api.gems(); route(); }
  }
  if (e.target.id === 'gem-ev-form') {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (await act(() => api.saveGemEvent({ name: f.name.trim(), start_date: f.start_date, end_date: f.end_date, source: f.source.trim(), created_by: S.me }), t('Saved.'))) { gemUi.evEdit = null; S.gems = await api.gems(); route(); }
  }
});

// ═══════════════════════════════════════════════════════════════
//  PLAN
// ═══════════════════════════════════════════════════════════════
function ruleShort(text) {
  if (/Zero physical/i.test(text)) return ['SPEC', 'r-spec', t('Opponents take no physical damage → use Special attackers')];
  if (/Zero special/i.test(text)) return ['PHYS', 'r-phys', t('Opponents take no special damage → use Physical attackers')];
  if (/P-move/i.test(text)) return ['P+5', 'r-pmove', t('P-move power +5')];
  return ['—', 'r-none', text || t('No rules')];
}
const fitFor = (uid, types) => types.map(ty => readiness(owned(uid), towerFloor(uid, ty), ty, pairById)).sort((a, b) => b.score - a.score)[0]
  || { score: 0, pairs: [], floor: 0, count: 0 };

function planLeaders() {
  const s = season();
  const st = state();
  const types = [...new Set(s.leaders.flatMap(l => l.weakness || []))];
  const members = S.profiles.filter(p => !st.banned.has(p.id));
  const stages = Math.max(3, Math.min(s.gym_data?.stages?.length || 3, 6));
  const scoreMax = Math.max(1, ...members.flatMap(p => types.map(ty => readiness(owned(p.id), towerFloor(p.id, ty), ty, pairById).score)));

  return `
  <p class="lead">${t('Each Gym Leader: weakness, the rule in every circuit, strategy notes, and the squad — who fights them and with which sync pairs from their own roster. Best fit ranks members by their three strongest pairs of a weakness type (level + EX + EX Role) plus a quarter of that type’s tower floors.')}</p>
  <div class="plan-grid">${s.leaders.map(l => {
    const w = l.weakness || [];
    const asg = S.asg.filter(a => a.leader === l.name);
    const note = S.notes.find(n => n.leader === l.name)?.note || '';
    const sugg = members.map(p => ({ p, fit: fitFor(p.id, w) })).sort((a, b) => b.fit.score - a.fit.score).slice(0, 5);
    const focus = leaderFocus(s, l.name, stages);
    return `<article class="card plan" style="--tc:${tc(l.type)}">
      <div class="plan-head">${leaderImg(s, l.name)}<div><h3>${esc(l.name)}</h3>${typeTag(l.type)}
        <div class="weak-line">${t('Weak to')} ${w.map(typeTag).join(' ') || '—'}</div></div>
        <span class="count">${t('{n} assigned', { n: asg.length })}</span></div>
      <div class="body">
      ${s.gym_data?.stages?.length ? `<div class="rules">${Array.from({ length: stages + 3 }, (_, i) => i + 1).map(n => {
        const c = circuitAt(s, n);
        if (!c) return '';
        const [txt, cls, tip] = ruleShort(leaderRule(s, l.name, n));
        return `<span class="rule ${cls}" title="${esc(c.label)}: ${esc(tip)}"><small>${esc(roundShort(c.label))}</small>${txt}</span>`;
      }).join('')}</div>` : ''}
      ${focus.length ? `<div class="chips">${focus.map(f => `<span class="badge">${esc(f)}</span>`).join('')}</div>` : ''}
      <div class="note"><div class="sub">${t('Notes')}</div>
        ${isStaff() ? `<textarea data-note="${esc(l.name)}" rows="2" placeholder="${t('Strategy, suggested teams…')}">${esc(note)}</textarea>` : `<p>${esc(note) || '<span class="muted">—</span>'}</p>`}</div>
      <div><div class="sub">${t('Squad')}</div>
        <div class="squad">${asg.map(a => squadRow(a)).join('') || `<p class="muted" style="margin:0">${t('nobody yet')}</p>`}</div>
        ${isStaff() ? `<div class="assign-new" style="margin-top:8px"><select data-asg-add="${esc(l.name)}"><option value="">+ ${t('Assign a member…')}</option>${members.filter(p => !asg.some(a => a.user_id === p.id)).map(p => `<option value="${p.id}">${esc(nameOf(p))}</option>`).join('')}</select></div>` : ''}</div>
      <div><div class="sub">${t('Best fit')}</div><div class="line">${sugg.map(({ p, fit }) => `
        <span class="fit" title="${t('{n} pairs · tower {f}/40', { n: fit.count, f: fit.floor })}"><a href="#/member/${p.id}"><b>${esc(nameOf(p))}</b></a>${fit.pairs.slice(0, 3).map(x => ownIcon(x.pair, x, 'xs')).join('')}<small>${fit.floor}F</small>
          ${isStaff() && !asg.some(a => a.user_id === p.id) ? `<button class="add" data-asg-quick="${esc(l.name)}|${p.id}" title="${t('Assign with a suggested team')}">+</button>` : ''}</span>`).join('')}</div></div>
      </div>
    </article>`;
  }).join('')}</div>

  <section class="section">
    <h2>${t('Weakness coverage')} <small>${t('owned pairs · tower floor')}</small></h2>
    <div class="card scroll"><table class="table heatmap">
      <thead><tr><th>${t('Member')}</th>${types.map(ty => `<th>${typeTag(ty)}</th>`).join('')}</tr></thead>
      <tbody>${members.map(p => `<tr><td><a class="who" href="#/member/${p.id}">${av(p.id, 'xs')}${esc(nameOf(p))}</a></td>${types.map(ty => {
        const r = readiness(owned(p.id), towerFloor(p.id, ty), ty, pairById);
        return `<td class="heat" style="--h:${(r.score / scoreMax).toFixed(2)};--tc:${TYPE_COLORS[ty]}" title="${esc(r.pairs.slice(0, 3).map(x => `${pairName(x.pair)} ${levelLabel(x.level)}`).join('\n'))}"><b>${r.count || '·'}</b><small>${r.floor}F</small></td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>
  </section>`;
}
// ─── Plan page: Gym Leaders · Strategy · Facilitator ───
let planView = 'leaders', strategyEdit = null;   // strategyEdit = the draft text while a staff member edits
function renderPlan() {
  const s = season();
  if (!s) return seasonBar() + noSeason();
  const tabs = [['leaders', 'Gym Leaders', 'swords'], ['strategy', 'Strategy', 'note'], ['facilitator', 'Facilitator', 'bolt'], ['roles', 'Roles', 'users']];
  lockCtx = frozen() && !['strategy', 'roles'].includes(planView);
  try { return planPage(s, tabs); } finally { lockCtx = false; }
}
function planPage(s, tabs) {
  return `${seasonBar()}${lockCtx ? `<p class="notice">${ico('lock')} ${t('This Gym Battle is over. Only the admin can change it now.')}</p>` : ''}
  <div class="toolbar"><h1>${t('Plan')}</h1><div class="seg">${tabs.map(([k, l, i]) => `<button class="${planView === k ? 'on' : ''}" data-pview="${k}">${ico(i)} ${t(l)}</button>`).join('')}</div></div>
  ${planView === 'strategy' ? planStrategy(s) : planView === 'facilitator' ? planFacilitator(s) : planView === 'roles' ? planRoles(s) : planLeaders()}`;
}
document.addEventListener('click', e => { if (e.target.closest('[data-goto-fac]')) { planView = 'facilitator'; facEdit = null; } });   // the link itself navigates
document.addEventListener('click', e => {
  const b = e.target.closest('[data-pview]');
  if (!b) return;
  planView = b.dataset.pview; strategyEdit = null; facEdit = null; route();
});

// ── Roles: one battle role and one main type per member and season, and the scores by them ──
const BATTLE_ROLES = [['DDs', 'Main damage dealers'], ['HHs', 'Heavy hitters'], ['Facilitator', 'Sets the fight up'], ['Finisher', 'Closes the fight'], ['Helper', 'Helps wherever needed']];
const rolesFilter = { role: '', type: '', stageType: '', leader: '' };
const stageTypeOf = (s, leader) => (s.leaders.find(l => l.name === leader)?.weakness || [])[0] || '';
// A run is "main" when the stage's type (weakness of its Gym Leader) is the member's main type as it was when the run was logged,
// "support" when it differs, "unclassified" when either is unknown. Reviews only confirm the label: points never change.
const runClass = (s, r) => { const st = stageTypeOf(s, r.leader); return !r.main_type_at || !st ? 'unclassified' : r.main_type_at === st ? 'main' : 'support'; };
const reviewOf = id => S.reviews.find(x => x.run_id === id);
const REVIEW_LABEL = { pending: ['', 'Waiting for review'], confirmed: ['good', 'Confirmed'], needs_correction: ['bad', 'Needs correction'] };
const reviewStatus = id => reviewOf(id)?.status || 'pending';
function planRoles(s) {
  const st = state(), sm = uid => S.sm.find(m => m.user_id === uid) || {};
  const f = rolesFilter, staff = isStaff();
  const stageTypes = [...new Set(s.leaders.map(l => stageTypeOf(s, l.name)).filter(Boolean))];
  const rows = S.profiles.map(p => {
    const m = sm(p.id), mine = S.runs.filter(r => r.user_id === p.id);
    const stage = mine.filter(r => (!f.leader || r.leader === f.leader) && (!f.stageType || stageTypeOf(s, r.leader) === f.stageType));
    const by = k => mine.filter(r => runClass(s, r) === k), sum = a => a.reduce((x, r) => x + r.score, 0), sup = by('support');
    return { p, role: m.battle_role || '', type: m.main_type || '', total: st.perMember[p.id]?.score || 0, banned: st.banned.has(p.id),
      stage: stage.reduce((a, r) => a + r.score, 0), stageRuns: stage.length, mainPts: sum(by('main')), supPts: sum(sup), unPts: sum(by('unclassified')),
      supRuns: sup.length, pend: sup.filter(r => reviewStatus(r.id) === 'pending').length };
  }).filter(r => (!f.role || (f.role === 'none' ? !r.role : r.role === f.role)) && (!f.type || (f.type === 'none' ? !r.type : r.type === f.type)))
    .sort((a, b) => (f.stageType || f.leader ? b.stage - a.stage : b.total - a.total));
  const stageOn = !!(f.stageType || f.leader);
  const sel = (name, val, opts, any) => `<select data-rf="${name}"><option value="">${t(any)}</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${val === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const typeOpts = TYPES.map(ty => [ty, t(ty)]);
  const others = S.seasons.filter(x => x.id !== s.id);
  return `<section class="section"><h2>${t('Battle roles')} <small>${t('one role and one main type per member in each Gym Battle')}</small></h2>
    <div class="card pad filters-row">
      ${sel('role', f.role, [['none', t('Not assigned')], ...BATTLE_ROLES.map(([k]) => [k, k])], 'All roles')}
      ${sel('type', f.type, [['none', t('Not assigned')], ...typeOpts], 'All main types')}
      ${sel('stageType', f.stageType, stageTypes.map(ty => [ty, t(ty)]), 'Any stage type')}
      ${sel('leader', f.leader, s.leaders.map(l => [l.name, l.name]), 'Any Gym Leader')}
      ${staff && others.length ? `<span class="spacer"></span><select id="roles-copy-from"><option value="">${t('Copy roles from…')}</option>${others.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>` : ''}
    </div>
    <div class="card scroll"><table class="table roles">
      <thead><tr><th>${t('Member')}</th><th>${t('Role')}</th><th>${t('Main type')}</th><th class="num">${t('Season total')}</th><th class="num">${t('Main')}</th><th class="num">${t('Support')}</th><th class="num">${t('Unclassified')}</th><th class="num">${t('Support runs')}</th>${stageOn ? `<th class="num">${t('Filtered stages')}</th>` : ''}</tr></thead>
      <tbody>${rows.map(r => `<tr class="${r.banned ? 'dim' : ''}"><td><a class="who" href="#/member/${r.p.id}">${av(r.p.id, 'xs')}${esc(nameOf(r.p))}</a>${r.banned ? ` <span class="badge bad">${t('locked')}</span>` : ''}</td>
        <td>${staff ? `<select data-role-of="${r.p.id}" data-field="battle_role"><option value="">${t('Not assigned')}</option>${BATTLE_ROLES.map(([k]) => `<option ${r.role === k ? 'selected' : ''}>${k}</option>`).join('')}</select>` : r.role ? `<span class="badge">${r.role}</span>` : `<span class="muted">${t('Not assigned')}</span>`}</td>
        <td>${staff ? `<select data-role-of="${r.p.id}" data-field="main_type"><option value="">${t('Not assigned')}</option>${TYPES.map(ty => `<option value="${ty}" ${r.type === ty ? 'selected' : ''}>${t(ty)}</option>`).join('')}</select>` : r.type ? typeTag(r.type) : `<span class="muted">${t('Not assigned')}</span>`}</td>
        <td class="num"><b>${fmtN(r.total)}</b></td><td class="num">${fmtN(r.mainPts)}</td><td class="num">${fmtN(r.supPts)}</td><td class="num muted">${fmtN(r.unPts)}</td>
        <td class="num">${r.supRuns ? `${r.supRuns}${r.pend ? ` <span class="badge gold" title="${t('Waiting for review')}">${r.pend}</span>` : ''}` : '—'}</td>${stageOn ? `<td class="num"><b>${fmtN(r.stage)}</b> <small class="muted">${t('{n} runs', { n: r.stageRuns })}</small></td>` : ''}</tr>`).join('') || `<tr><td colspan="5" class="muted pad">${t('Nobody matches these filters.')}</td></tr>`}</tbody></table></div>
    ${supportReview(s)}
    <p class="muted">${t('Points come from the run log as it is: the season total never changes with the filters, the stage column only adds up the matching stages. A stage’s type is the weakness of its Gym Leader.')}</p></section>`;
}
document.addEventListener('change', async e => {
  const rf = e.target.dataset?.rf;
  if (rf) { rolesFilter[rf] = e.target.value; route(); return; }
  const of = e.target.dataset?.roleOf;
  if (of) {
    if (await act(() => api.setSeasonRole(S.sid, of, { [e.target.dataset.field]: e.target.value || null }), t('Saved.'))) { S.sm = await api.seasonMembers(S.sid); route(); }
    return;
  }
  if (e.target.id === 'roles-copy-from' && e.target.value) {
    const from = +e.target.value, src = await api.seasonMembers(from);
    const rows = src.filter(m => m.battle_role || m.main_type).map(m => ({ season_id: S.sid, user_id: m.user_id, battle_role: m.battle_role || null, main_type: m.main_type || null }));
    if (!rows.length) { toast(t('That Gym Battle has no roles to copy.')); e.target.value = ''; return; }
    if (!confirm(t('Copy {n} roles into this Gym Battle? Existing roles of those members are replaced; review them afterwards.', { n: rows.length }))) { e.target.value = ''; return; }
    if (await act(() => api.setSeasonRoles(rows), t('Roles copied.'))) { S.sm = await api.seasonMembers(S.sid); route(); }
  }
});

// The support runs: stages of a type other than the member's main type. Staff confirm the label or ask for a correction.
function supportReview(s) {
  const staff = isStaff();
  const list = S.runs.filter(r => runClass(s, r) === 'support' && (staff || r.user_id === S.me));
  if (!list.length) return '';
  const order = { pending: 0, needs_correction: 1, confirmed: 2 };
  const rows = [...list].sort((a, b) => order[reviewStatus(a.id)] - order[reviewStatus(b.id)] || b.occurred_at.localeCompare(a.occurred_at));
  return `<h2 class="section">${t('Support runs')} <small>${t('{n} waiting for review', { n: list.filter(r => reviewStatus(r.id) === 'pending').length })}</small></h2>
  <p class="muted">${t('A run on a stage of another type than the member’s main type. Reviewing only confirms that label: the points, tickets and round progress stay as logged.')}</p>
  <div class="card scroll"><table class="table"><thead><tr><th>${t('Member')}</th><th>${t('Stage')}</th><th>${t('Main type then')}</th><th class="num">${t('Score')}</th><th>${t('When')}</th><th>${t('Review')}</th></tr></thead>
    <tbody>${rows.slice(0, 60).map(r => { const rv = reviewOf(r.id), [cls, label] = REVIEW_LABEL[reviewStatus(r.id)];
      return `<tr><td>${esc(r.member_name)}</td><td>${esc(r.leader)} ${typeTag(stageTypeOf(s, r.leader))}</td><td>${typeTag(r.main_type_at)}</td><td class="num"><b>${fmtN(r.score)}</b></td><td class="muted nowrap">${fmtDT(r.occurred_at)}</td>
        <td><span class="badge ${cls}">${t(label)}</span>${rv?.note ? `<br><small class="muted">${esc(rv.note)}</small>` : ''}
          ${staff ? `<div class="row"><button class="btn sm" data-rv="${r.id}" data-st="confirmed">${t('Confirm')}</button><button class="btn sm ghost" data-rv="${r.id}" data-st="needs_correction">${t('Needs correction')}</button>${rv ? `<button class="btn sm ghost" data-rv-clear="${r.id}">${t('Reset')}</button>` : ''}</div>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-rv],[data-rv-clear]');
  if (!b) return;
  const refresh = async () => { S.reviews = await api.runReviews(); route(); };
  if (b.dataset.rvClear) { if (await act(() => api.deleteRunReview(+b.dataset.rvClear), t('Saved.'))) await refresh(); return; }
  let note = '';
  if (b.dataset.st === 'needs_correction') { note = (prompt(t('What should be corrected?')) || '').trim(); if (!note) return; }
  if (await act(() => api.saveRunReview({ run_id: +b.dataset.rv, status: b.dataset.st, note }), t('Saved.'))) await refresh();
});

// ── Strategy: the season's rules and requirements ──
// Tiny markup: "# Heading", "- point", "  - sub point", **bold**, anything else is a paragraph.
function renderRules(text) {
  const inline = x => esc(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  let html = '', depth = 0;
  const close = to => { while (depth > to) { html += '</ul>'; depth--; } };
  for (const raw of String(text || '').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { close(0); continue; }
    const h = line.match(/^#+\s*(.+)$/), li = line.match(/^(\s*)[-*•]\s+(.+)$/);
    if (h) { close(0); html += `<h3 class="rule-h">${inline(h[1])}</h3>`; }
    else if (li) { const want = li[1].length >= 2 ? 2 : 1; while (depth < want) { html += '<ul>'; depth++; } close(want); html += `<li>${inline(li[2])}</li>`; }
    else { close(0); html += `<p>${inline(line.trim())}</p>`; }
  }
  close(0);
  return html;
}
function planStrategy(s) {
  const staff = isStaff(), others = S.seasons.filter(x => x.id !== s.id && (x.strategy || '').trim());
  if (strategyEdit !== null && staff) {
    return `<form class="card pad form" id="strategy-form">
      <p class="muted" style="margin:0">${t('Write the rules and requirements for this Gym Battle. Start a section with “# ”, list points with “- ” (indent two spaces for a sub-point), wrap words in **double stars** for bold.')}</p>
      <textarea name="strategy" rows="22" spellcheck="true" placeholder="# 1. General requirements&#10;- By default every sync pair has EX and EX Role unlocked&#10;- ...">${esc(strategyEdit)}</textarea>
      <div class="row"><button class="btn primary">${t('Save')}</button><button type="button" class="btn ghost" data-strategy-cancel>${t('Cancel')}</button>
        ${others.length ? `<select data-strategy-copy><option value="">${t('Copy the rules from…')}</option>${others.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>` : ''}</div>
    </form>`;
  }
  const text = (s.strategy || '').trim();
  return `<div class="strategy">
    ${staff ? `<div class="toolbar"><span class="muted">${t('Visible to the whole gym · only the admin and mods can edit')}</span>
      <button class="btn ${text ? '' : 'primary'}" data-strategy-edit>${ico('edit')} ${text ? t('Edit the rules') : t('Write the rules')}</button></div>` : ''}
    ${text ? `<article class="card pad rules-doc">${renderRules(text)}</article>`
      : `<div class="empty card">${img(`${POMA}images/icon_masterex.png`, 'pi lg')}<h2>${t('No rules written yet')}</h2><p class="muted">${staff ? t('Write the general requirements, ticket usage and timing rules for this Gym Battle.') : t('Your admin has not written the rules for this Gym Battle yet.')}</p></div>`}
  </div>`;
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-strategy-edit]')) { strategyEdit = season().strategy || ''; route(); }
  if (e.target.closest('[data-strategy-cancel]')) { strategyEdit = null; route(); }
});
document.addEventListener('change', e => {
  if (!('strategyCopy' in e.target.dataset) || !e.target.value) return;
  const from = S.seasons.find(x => x.id === +e.target.value);
  if (from && confirm(t('Replace what is written with the rules of {s}?', { s: from.name }))) { strategyEdit = from.strategy; route(); }
  else e.target.value = '';
});
document.addEventListener('submit', async e => {
  if (e.target.id !== 'strategy-form') return;
  e.preventDefault();
  const strategy = new FormData(e.target).get('strategy');
  if (await act(() => api.updateSeason(S.sid, { strategy }), t('Rules saved.'))) { S.seasons = await api.seasons(); strategyEdit = null; route(); }
});

// ── Facilitator planning ──
// The facilitator spends a ticket before each battle to set it up for the others.
const DUTIES = [['rebuff', 'Lower Type Rebuff'], ['stats', 'Lower stats'], ['status', 'Status effects']];
let facEdit = null;   // { leader, user_id, q }
const facOf = (leader, uid) => S.fac.find(f => f.leader === leader && f.user_id === uid);
const facKey = f => `${f.leader}|${f.user_id}`;
const facOpen = f => facEdit && facEdit.leader === f.leader && facEdit.user_id === f.user_id;
function facRow(f) {
  const edit = isStaff(), open = facOpen(f);
  const slots = [0, 1, 2].map(i => {
    const id = f.team?.[i];
    if (!id) return `<span class="slot0">${edit ? '+' : ''}</span>`;
    const mp = ownedPair(f.user_id, id), p = pairById(id);
    return `<span title="${esc(pairName(p))} · ${levelLabel(mp?.level || 1)}${mp?.ex ? ' EX' : ''}">${ownIcon(p, mp, 'xs')}</span>`;
  }).join('');
  return `<div class="sq ${open ? 'open' : ''}"><a class="who" href="#/member/${f.user_id}/pairs">${av(f.user_id, 'xs')}<span>${esc(nameOf(profile(f.user_id)))}${f.note ? `<small>${esc(f.note)}</small>` : ''}</span></a>
      <span class="slots3">${slots}</span>
      ${edit ? `<button class="btn sm ${open ? 'primary' : 'ghost'}" data-fac-edit="${esc(facKey(f))}" title="${t('Choose sync pairs')}">${ico('edit')}</button><button class="x" data-fac-del="${esc(facKey(f))}" aria-label="${t('Remove')}">${ico('x')}</button>` : ''}</div>
    <div class="duties">${DUTIES.map(([k, l]) => `<span class="duty ${(f.does || []).includes(k) ? 'on' : ''}">${t(l)}</span>`).join('')}</div>
    ${open ? facEditor(f) : ''}`;
}
function facEditor(f) {
  const s = season(), l = leaderOf(s, f.leader), w = l.weakness || [], who = nameOf(profile(f.user_id));
  const q = facEdit.q.trim().toLowerCase();
  const all = owned(f.user_id).map(mp => ({ ...mp, pair: pairById(mp.pair_id) })).filter(x => x.pair);
  const lowers = x => w.some(ty => rebuffs(x.pair, ty));
  const list = all.filter(x => f.team.includes(x.pair_id) || (q ? `${x.pair.trainer} ${x.pair.pokemon} ${x.pair.type}`.toLowerCase().includes(q) : lowers(x) || /Support|Tech/.test(x.pair.role)))
    .sort((a, b) => lowers(b) - lowers(a) || pairWeight(b) - pairWeight(a)).slice(0, 80);
  return `<div class="sq-edit">
    <div class="duty-pick">${DUTIES.map(([k, lb]) => `<button type="button" class="btn sm ${(f.does || []).includes(k) ? 'primary' : 'ghost'}" data-fac-do="${k}">${t(lb)}</button>`).join('')}</div>
    <div class="row"><input data-fac-q placeholder="${t('Search {n}’s roster…', { n: esc(who) })}" value="${esc(facEdit.q)}" autocomplete="off">
      <button class="btn sm" data-fac-suggest>${ico('bolt')} ${t('Suggest')}</button>
      <button class="btn sm primary" data-fac-done>${t('Done')}</button></div>
    <p class="hint">${t('Pick up to 3 of {n}’s sync pairs to set up {l}: pairs that lower its Type Rebuff come first.', { n: esc(who), l: esc(f.leader) })}</p>
    <div class="roster">${list.map(x => {
      const i = f.team.indexOf(x.pair_id), tag = lowers(x);
      return `<button type="button" class="rp ${i >= 0 ? 'on' : f.team.length >= 3 ? 'off' : ''} ${tag ? 'tagged' : ''}" data-fac-pair="${x.pair_id}" ${i >= 0 ? `data-n="${i + 1}"` : ''}
        title="${esc(pairName(x.pair))} · ${esc(x.pair.role)} · ${levelLabel(x.level)}${x.ex ? ' EX' : ''}${tag ? ' · ' + t('lowers Type Rebuff') : ''}">${img(typeIcon(x.pair.type), 'ti')}${ownIcon(x.pair, x, 'sm')}<small>${levelLabel(x.level)}${x.ex ? ' EX' : ''}</small></button>`;
    }).join('') || `<p class="hint">${t('Nothing found.')}</p>`}</div>
    <input data-fac-note placeholder="${t('Note for {n} (optional)', { n: esc(who) })}" value="${esc(f.note)}">
  </div>`;
}
function planFacilitator(s) {
  const st = state(), staff = isStaff();
  const members = S.profiles.filter(p => !st.banned.has(p.id));
  return `<p class="lead">${t('The facilitator spends one ticket before each battle to set it up for everyone else: lower the opponent’s Type Rebuff, lower its stats and apply status conditions. Plan who does it for each Gym Leader and with which sync pairs.')}</p>
  <div class="plan-grid">${s.leaders.map(l => {
    const w = l.weakness || [], rows = S.fac.filter(f => f.leader === l.name);
    const cand = members.filter(p => !rows.some(f => f.user_id === p.id))
      .map(p => ({ p, n: owned(p.id).filter(x => w.some(ty => rebuffs(pairById(x.pair_id) || {}, ty))).length })).sort((a, b) => b.n - a.n);
    return `<article class="card plan" style="--tc:${tc(l.type)}">
      <div class="plan-head">${leaderImg(s, l.name)}<div><h3>${esc(l.name)}</h3>${typeTag(l.type)}
        <div class="weak-line">${t('Weak to')} ${w.map(typeTag).join(' ') || '—'}</div></div></div>
      <div class="body">
        <div><div class="sub">${t('Facilitator')}</div>
          <div class="squad">${rows.map(facRow).join('') || `<p class="muted" style="margin:0">${t('nobody yet')}</p>`}</div>
          ${staff ? `<div class="assign-new" style="margin-top:8px"><select data-fac-add="${esc(l.name)}"><option value="">+ ${t('Assign a facilitator…')}</option>${cand.map(({ p, n }) => `<option value="${p.id}">${esc(nameOf(p))}${n ? ` · ${t('{n} Rebuff pairs', { n })}` : ''}</option>`).join('')}</select></div>` : ''}</div>
      </div></article>`;
  }).join('')}</div>`;
}
async function saveFac(f, patch, msg) {
  const row = { season_id: S.sid, leader: f.leader, user_id: f.user_id, team: f.team || [], does: f.does || [], note: f.note || '', ...patch, updated_by: S.me };
  const ok = await act(() => api.saveFacilitator(row), msg);
  if (ok) S.fac = await api.facilitators(S.sid);
  return ok;
}
async function addFacilitator(leader, uid) {
  const team = suggestFacilitator(owned(uid), leaderOf(season(), leader).weakness || []).map(x => x.pair_id);
  if (!await saveFac({ leader, user_id: uid }, { team, does: ['rebuff', 'stats', 'status'] }, t('{n} will set up {l}.', { n: nameOf(profile(uid)), l: leader }))) return;
  facEdit = { leader, user_id: uid, q: '' };
  route();
}
const saveFacNote = debounce((f, note) => saveFac(f, { note }, t('Note saved.')), 700);
document.addEventListener('change', e => { if (e.target.dataset.facAdd && e.target.value) addFacilitator(e.target.dataset.facAdd, e.target.value); });
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-fac-edit],[data-fac-del],[data-fac-pair],[data-fac-do],[data-fac-suggest],[data-fac-done]');
  if (!el) return;
  const d = el.dataset;
  const key = d.facEdit || d.facDel;
  if (d.facEdit) { const [leader, uid] = key.split('|'); facEdit = facEdit && facEdit.leader === leader && facEdit.user_id === uid ? null : { leader, user_id: uid, q: '' }; return route(); }
  if (d.facDel) {
    const [leader, uid] = key.split('|');
    if (await act(() => api.removeFacilitator(S.sid, leader, uid))) { S.fac = await api.facilitators(S.sid); if (facEdit?.leader === leader) facEdit = null; route(); }
    return;
  }
  const f = facEdit && facOf(facEdit.leader, facEdit.user_id);
  if (!f) return;
  if ('facDone' in d) { facEdit = null; return route(); }
  if (d.facDo) { const does = f.does.includes(d.facDo) ? f.does.filter(x => x !== d.facDo) : [...f.does, d.facDo]; if (await saveFac(f, { does })) route(); return; }
  if ('facSuggest' in d) {
    const team = suggestFacilitator(owned(f.user_id), leaderOf(season(), f.leader).weakness || []).map(x => x.pair_id);
    if (await saveFac(f, { team })) route();
    return;
  }
  if (d.facPair) {
    const has = f.team.includes(d.facPair);
    if (!has && f.team.length >= 3) return toast(t('A team has at most 3 sync pairs.'), true);
    if (await saveFac(f, { team: has ? f.team.filter(x => x !== d.facPair) : [...f.team, d.facPair] })) route();
  }
});
document.addEventListener('input', e => {
  if ('facQ' in e.target.dataset && facEdit) {
    facEdit.q = e.target.value;
    const pos = e.target.selectionStart; route();
    const el = $('[data-fac-q]'); if (el) { el.focus(); el.setSelectionRange(pos, pos); }
  }
  if ('facNote' in e.target.dataset && facEdit) { const f = facOf(facEdit.leader, facEdit.user_id); if (f) { f.note = e.target.value; saveFacNote(f, e.target.value); } }
});

const saveNote = debounce(async (leader, note) => {
  await act(() => api.saveNote({ season_id: S.sid, leader, note, updated_by: S.me }), t('Note saved.'));
  S.notes = await api.notes(S.sid);
}, 800);
document.addEventListener('input', e => { if (e.target.dataset.note) saveNote(e.target.dataset.note, e.target.value); });

// ─── Squads: staff pick who fights a leader and which of their own pairs they bring ───
let asgEdit = null;   // { leader, user_id, q, all } — the one squad row being edited
const asgKey = a => `${a.leader}|${a.user_id}`;
const isOpen = a => asgEdit && asgEdit.leader === a.leader && asgEdit.user_id === a.user_id;

// One squad row. `withLeader` shows the leader instead of the member (member profile).
function squadRow(a, withLeader = false) {
  const s = season(), edit = isStaff(), open = isOpen(a);
  const slots = [0, 1, 2].map(i => {
    const id = a.team?.[i];
    if (!id) return `<span class="slot0">${edit ? '+' : ''}</span>`;
    const mp = ownedPair(a.user_id, id), p = pairById(id);
    return `<span title="${esc(pairName(p))} · ${levelLabel(mp?.level || 1)}${mp?.ex ? ' EX' : ''}">${ownIcon(p, mp, 'xs')}</span>`;
  }).join('');
  const who = withLeader
    ? `<span class="who">${leaderImg(s, a.leader)}<span>${esc(a.leader)}${a.note ? `<small>${esc(a.note)}</small>` : ''}</span></span>`
    : `<a class="who" href="#/member/${a.user_id}/plan">${av(a.user_id, 'xs')}<span>${esc(nameOf(profile(a.user_id)))}${a.note ? `<small>${esc(a.note)}</small>` : ''}</span></a>`;
  return `<div class="sq ${open ? 'open' : ''}">${who}<span class="slots3">${slots}</span>
    ${edit ? `<button class="btn sm ${open ? 'primary' : 'ghost'}" data-asg-edit="${esc(asgKey(a))}" title="${t('Choose sync pairs')}">${ico('edit')}</button>
      <button class="x" data-asg-del="${esc(asgKey(a))}" aria-label="${t('Remove')}">${ico('x')}</button>` : ''}</div>
    ${open ? asgEditor(a) : ''}`;
}

function asgEditor(a) {
  const s = season(), st = state(), l = leaderOf(s, a.leader), w = l.weakness || [];
  const q = asgEdit.q.trim().toLowerCase();
  const list = owned(a.user_id).map(mp => ({ ...mp, pair: pairById(mp.pair_id) })).filter(x => x.pair)
    .filter(x => a.team.includes(x.pair_id) || (q ? pairName(x.pair).toLowerCase().includes(q) : asgEdit.all || w.includes(x.pair.type)))
    .sort((x, y) => (w.includes(y.pair.type) - w.includes(x.pair.type)) || pairWeight(y) - pairWeight(x));
  const c = st.active && circuitAt(s, st.active);
  const rule = c && s.gym_data?.stages?.length ? ruleShort(leaderRule(s, a.leader, st.active)) : null;
  const who = nameOf(profile(a.user_id));
  return `<div class="sq-edit">
    <div class="row"><input data-asg-q placeholder="${t('Search {n}’s roster…', { n: esc(who) })}" value="${esc(asgEdit.q)}" autocomplete="off">
      <button class="btn sm ${asgEdit.all ? '' : 'ghost'}" data-asg-all>${asgEdit.all ? t('All types') : t('Weakness types')}</button>
      <button class="btn sm" data-asg-suggest>${ico('bolt')} ${t('Suggest')}</button>
      <button class="btn sm primary" data-asg-done>${t('Done')}</button></div>
    <p class="hint">${t('Pick up to 3 of {n}’s own sync pairs for {l}.', { n: esc(who), l: esc(a.leader) })}${rule ? ` ${esc(roundShort(c.label))}: ${esc(rule[2])}.` : ''}</p>
    <div class="roster">${list.map(x => {
      const i = a.team.indexOf(x.pair_id);
      return `<button type="button" class="rp ${i >= 0 ? 'on' : a.team.length >= 3 ? 'off' : ''}" data-asg-pair="${x.pair_id}" ${i >= 0 ? `data-n="${i + 1}"` : ''}
        title="${esc(pairName(x.pair))} · ${esc(x.pair.role)} · ${levelLabel(x.level)}${x.ex ? ' EX' : ''}">${img(typeIcon(x.pair.type), 'ti')}${ownIcon(x.pair, x, 'sm')}<small>${levelLabel(x.level)}${x.ex ? ' EX' : ''}</small></button>`;
    }).join('') || `<p class="hint">${q ? t('Nothing found.') : t('No pairs of the weakness types in this roster — try All types.')}</p>`}</div>
    <input data-asg-note placeholder="${t('Note for {n} (optional)', { n: esc(who) })}" value="${esc(a.note)}">
  </div>`;
}

async function saveAsg(a, patch, msg) {
  const row = { season_id: S.sid, leader: a.leader, user_id: a.user_id, team: a.team || [], note: a.note || '', ...patch, updated_by: S.me };
  const ok = await act(() => api.saveAssignment(row), msg);
  if (ok) S.asg = await api.assignments(S.sid);
  return ok;
}
// Re-render, keeping the roster search focused while typing
function rerender() {
  const q = document.activeElement?.matches?.('[data-asg-q]') ? document.activeElement.selectionStart : null;
  route();
  if (q != null) { const el = $('[data-asg-q]'); if (el) { el.focus(); el.setSelectionRange(q, q); } }
}
async function assign(leader, uid) {
  const existing = assignment(uid, leader);
  if (!existing) {
    const team = suggestTeam(owned(uid), leaderOf(season(), leader).weakness || [], pairById).map(x => x.pair_id);
    if (!await saveAsg({ leader, user_id: uid }, { team }, t('{n} assigned to {l}.', { n: nameOf(profile(uid)), l: leader }))) return;
  }
  asgEdit = { leader, user_id: uid, q: '', all: false };
  rerender();
}
const asgFromKey = k => { const [leader, uid] = k.split('|'); return assignment(uid, leader); };
const saveAsgNote = debounce((a, note) => saveAsg(a, { note }, t('Note saved.')), 700);

document.addEventListener('change', e => {
  const d = e.target.dataset;
  if (d.asgAdd && e.target.value) assign(d.asgAdd, e.target.value);
  if (d.asgAddLeader && e.target.value) assign(e.target.value, d.asgAddLeader);
});
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-asg-quick],[data-asg-edit],[data-asg-del],[data-asg-pair],[data-asg-suggest],[data-asg-all],[data-asg-done]');
  if (!el) return;
  e.preventDefault();
  const d = el.dataset;
  if (d.asgQuick) { const [leader, uid] = d.asgQuick.split('|'); return assign(leader, uid); }
  if (d.asgEdit) {
    const a = asgFromKey(d.asgEdit);
    asgEdit = isOpen(a) ? null : { leader: a.leader, user_id: a.user_id, q: '', all: false };
    return rerender();
  }
  if (d.asgDel) {
    const a = asgFromKey(d.asgDel);
    if (await act(() => api.removeAssignment(S.sid, a.leader, a.user_id))) { S.asg = await api.assignments(S.sid); if (isOpen(a)) asgEdit = null; rerender(); }
    return;
  }
  const a = asgEdit && assignment(asgEdit.user_id, asgEdit.leader);
  if (!a) return;
  if ('asgDone' in d) { asgEdit = null; return rerender(); }
  if ('asgAll' in d) { asgEdit.all = !asgEdit.all; return rerender(); }
  if ('asgSuggest' in d) {
    const team = suggestTeam(owned(a.user_id), leaderOf(season(), a.leader).weakness || [], pairById).map(x => x.pair_id);
    if (await saveAsg(a, { team })) rerender();
    return;
  }
  if (d.asgPair) {
    const has = a.team.includes(d.asgPair);
    if (!has && a.team.length >= 3) return toast(t('A team has at most 3 sync pairs.'), true);
    const team = has ? a.team.filter(x => x !== d.asgPair) : [...a.team, d.asgPair];
    if (await saveAsg(a, { team })) rerender();
  }
});
document.addEventListener('input', e => {
  if ('asgQ' in e.target.dataset && asgEdit) { asgEdit.q = e.target.value; rerender(); }
  if ('asgNote' in e.target.dataset && asgEdit) {
    const a = assignment(asgEdit.user_id, asgEdit.leader);
    if (a) { a.note = e.target.value; saveAsgNote(a, e.target.value); }
  }
});

// ═══════════════════════════════════════════════════════════════
//  MEMBERS
// ═══════════════════════════════════════════════════════════════
let memberView = 'list';
function memberRows() {
  const st = state();
  return S.profiles.map(p => {
    const mine = owned(p.id);
    const floors = TYPES.map(ty => towerFloor(p.id, ty));
    const byType = TYPES.map(ty => [ty, mine.filter(x => pairById(x.pair_id)?.type === ty).length]).filter(x => x[1]).sort((a, b) => b[1] - a[1]);
    return { p, pairs: mine.length, ex: mine.filter(x => x.ex).length, sa: mine.filter(x => x.level >= 10).length, byType,
      tower: floors.reduce((a, b) => a + b, 0), top: floors.filter(f => f >= TOWER_TOP).length, season: st?.perMember[p.id], banned: st?.banned.has(p.id) };
  }).sort((a, b) => (b.season?.score || 0) - (a.season?.score || 0) || nameOf(a.p).localeCompare(nameOf(b.p)));
}
// A member's local clock: shown on their card, refreshed by one shared timer (and when the tab comes back)
const clockText = tz => { const c = clockIn(tz, viewTz(), Date.now(), locale()); return `<b>${esc(c.time)}</b>${c.day ? ` <em>${c.day > 0 ? '+' : ''}${c.day}d</em>` : ''} · ${esc(tz)}`; };
const clockHtml = p => validTz(p.timezone) ? `<small class="clock" data-clock="${esc(p.timezone)}">${clockText(p.timezone)}</small>` : `<small class="clock muted">${t('Time zone not set')}</small>`;
const tickClocks = () => document.querySelectorAll('[data-clock]').forEach(el => { el.innerHTML = clockText(el.dataset.clock); });
setInterval(tickClocks, 20000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tickClocks(); });
function renderMembers() {
  if (memberView === 'types' || (memberView === 'dash' && !isStaff())) memberView = 'list';
  const rows = memberRows();
  const heat = (v, max, ty) => `<td class="heat" style="--h:${Math.min(1, v / max).toFixed(2)};--tc:${TYPE_COLORS[ty]}"><b>${v || '·'}</b></td>`;

  return `<div class="toolbar"><h1>${t('Members')} <small>${t('{n} people', { n: S.profiles.length })}</small></h1>
    <div class="seg">${[['list', 'Cards'], ['tower', 'Tower by type'], ...(isStaff() ? [['dash', 'Tower dashboard']] : [])].map(([k, l]) => `<button class="${memberView === k ? 'on' : ''}" data-mview="${k}">${t(l)}</button>`).join('')}</div></div>
  ${memberView === 'dash' && isStaff() ? towerDashboard(rows) : memberView === 'list' ? `<div class="mgrid">${rows.map(r => `
    <article class="card mcard ${r.banned ? 'dim' : ''}">
      <div class="mtop">${av(r.p.id)}<div><a class="mname" href="#/member/${r.p.id}">${esc(nameOf(r.p))}</a>
        <small class="muted">@${esc(r.p.username)}</small> ${rankTag(r.p.role)}${r.banned ? ` <span class="badge bad">${t('locked')}</span>` : ''}</div></div>
      <div class="clock-row">${clockHtml(r.p)}</div>
      <div class="mstats"><div><b>${r.pairs}</b>${t('pairs')}</div><div><b>${r.ex}</b>EX</div><div><b>${r.tower}</b>${t('floors')}</div><div><b>${fmtK(r.season?.score || 0)}</b>${t('score')}</div></div>
      <div class="mtypes">${r.byType.slice(0, 6).map(([ty, n]) => `<span style="--tc:${TYPE_COLORS[ty]}" title="${t(ty)}">${img(typeIcon(ty), 'ti', ty)}${n}</span>`).join('')}</div>
      ${isStaff() ? `<div class="mlinks"><a class="btn sm" href="#/member/${r.p.id}/pairs">${t('Roster')}</a><a class="btn sm" href="#/member/${r.p.id}/tower">${t('Tower')}</a><a class="btn sm" href="#/member/${r.p.id}/plan">${t('Battle plan')}</a></div>` : ''}
    </article>`).join('')}</div>`
  : `<div class="card scroll"><table class="table heatmap">
    <thead><tr><th>${t('Member')}</th>${TYPES.map(ty => `<th title="${t(ty)}">${img(typeIcon(ty), 'ti', ty)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr><td><a class="who" href="#/member/${r.p.id}">${av(r.p.id, 'xs')}${esc(nameOf(r.p))}</a></td>${TYPES.map(ty => heat(towerFloor(r.p.id, ty), TOWER_TOP, ty)).join('')}</tr>`).join('')}</tbody></table></div>`}`;
}
// Staff only: members × types with totals, a member search, a type filter and when each row was last updated.
// A missing record shows as "not updated" instead of 0.
const dashFilter = { q: '', types: new Set() };
function towerDashboard(rows) {
  const types = dashFilter.types.size ? TYPES.filter(ty => dashFilter.types.has(ty)) : TYPES;
  const q = dashFilter.q.trim().toLowerCase();
  const list = rows.filter(r => !q || `${nameOf(r.p)} ${r.p.username}`.toLowerCase().includes(q))
    .map(r => ({ r, rec: S.tower.filter(x => x.user_id === r.p.id), sum: types.reduce((a, ty) => a + towerFloor(r.p.id, ty), 0) })).sort((a, b) => b.sum - a.sum);
  const avg = ty => { const v = list.filter(x => x.rec.some(z => z.type === ty)).map(x => towerFloor(x.r.p.id, ty)); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null; };
  const last = recs => recs.map(x => x.updated_at).filter(Boolean).sort().at(-1);
  return `<div class="card pad filters-row"><input id="dash-q" placeholder="${t('Search members…')}" value="${esc(dashFilter.q)}">
    ${TYPES.map(ty => `<button class="pill ${dashFilter.types.has(ty) ? 'on' : ''}" data-dash-type="${ty}" title="${t(ty)}">${img(typeIcon(ty), 'ti', ty)}</button>`).join('')}
    ${dashFilter.types.size ? `<button class="btn sm ghost" data-dash-clear>${t('All types')}</button>` : ''}</div>
  <div class="card scroll"><table class="table heatmap"><thead><tr><th>${t('Member')}</th>${types.map(ty => `<th title="${t(ty)}">${img(typeIcon(ty), 'ti', ty)}</th>`).join('')}<th class="num">${t('Total')}</th><th>${t('Updated')}</th></tr></thead>
    <tbody>${list.map(({ r, rec, sum }) => `<tr><td><a class="who" href="#/member/${r.p.id}">${av(r.p.id, 'xs')}${esc(nameOf(r.p))}</a></td>
      ${types.map(ty => rec.some(z => z.type === ty) ? `<td class="heat" style="--h:${(towerFloor(r.p.id, ty) / TOWER_TOP).toFixed(2)};--tc:${TYPE_COLORS[ty]}"><b>${towerFloor(r.p.id, ty) || '·'}</b></td>` : `<td class="heat nil" title="${t('not updated')}"><b>—</b></td>`).join('')}
      <td class="num"><b>${sum}</b></td><td class="muted nowrap">${rec.length ? fmtD(last(rec)) : t('not updated')}</td></tr>`).join('')}</tbody>
    <tfoot><tr><th>${t('Average')}</th>${types.map(ty => `<th class="num">${avg(ty) ?? '—'}</th>`).join('')}<th></th><th></th></tr></tfoot></table></div>
  <p class="muted">${t('"—" means the member has not entered that tower yet; it is not counted as 0 in the average.')}</p>`;
}
document.addEventListener('input', e => { if (e.target.id === 'dash-q') { dashFilter.q = e.target.value; const pos = e.target.selectionStart; route(); const el = $('#dash-q'); el?.focus(); el?.setSelectionRange(pos, pos); } });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-dash-type]');
  if (b) { const ty = b.dataset.dashType; dashFilter.types.has(ty) ? dashFilter.types.delete(ty) : dashFilter.types.add(ty); route(); }
  if (e.target.closest('[data-dash-clear]')) { dashFilter.types.clear(); route(); }
});
document.addEventListener('click', e => { const b = e.target.closest('[data-mview]'); if (b) { memberView = b.dataset.mview; route(); } });

// ─── Roster sheet (one per type) ───
// Works like the gym's spreadsheet: every cell is one of the member's own pairs, picked by hand.
// Members fill their own row; the admin and mods can fill anyone's.
let rosterType = null, rosterSort = 'fit', sheetPick = null;   // sheetPick = { uid, slot, q }
function defaultRosterType() {
  const s = season();
  return s?.leaders.flatMap(l => l.weakness || [])[0] || 'Normal';
}
const sheetCells = (uid, ty) => Object.fromEntries(S.sheet.filter(x => x.user_id === uid && x.type === ty).map(x => [x.slot, x.pair_id]));
const ownedWithPair = uid => owned(uid).map(x => ({ ...x, pair: pairById(x.pair_id) })).filter(x => x.pair);

function renderRoster() {
  return `<div class="toolbar"><h1>${t('Roster by type')}</h1>
    <p class="muted" style="margin:0">${t('One sheet per type. Click a cell to pick the pair from that member’s roster — members fill their own row, the admin and mods fill anyone’s.')}</p></div>
  ${typeRoster(memberRows())}`;
}
const rosterCell = x => x
  ? `<div class="tc" title="${esc(pairName(x.pair))} · ${esc(x.pair.role)} · ${levelLabel(x.level)}${x.ex ? ' · 6★ EX' : ''}${x.ex_role ? ' · EX Role' : ''}">${ownIcon(x.pair, x, 'sm')}<small>${levelLabel(x.level)}${x.ex_role ? ' <b>EXR</b>' : ''}</small></div>`
  : `<span class="nope" aria-label="${t('none')}">${ico('x')}</span>`;
const tagsFor = (p, ty, slot) => slot.k === 'wtz' ? (p.wtz || []).filter(w => wtzScore(p, ty) >= 2 && (w.includes(ty) || /Sunny|Rain|Sand|Hail|Terrain/.test(w)))
  : slot.k === 'rebuff' ? (p.rebuff || []).filter(r => r === ty || r === 'Weakness').map(r => `${r === 'Weakness' ? t('Weakness') : r} Rebuff ↓`) : [];

function typeRoster(rows) {
  const ty = rosterType || defaultRosterType();
  const data = rows.map(r => ({ r, mine: ownedWithPair(r.p.id), cells: sheetCells(r.p.id, ty),
    fit: readiness(owned(r.p.id), towerFloor(r.p.id, ty), ty, pairById).score }))
    .sort(rosterSort === 'name' ? (a, b) => nameOf(a.r.p).localeCompare(nameOf(b.r.p)) : (a, b) => b.fit - a.fit);
  const canFill = data.some(d => canEdit(d.r.p.id));
  const head = SHEET_SLOTS.map(sl => {
    const p = sl.fixed && pairById(sl.fixed());
    return p ? `<th class="core fixed" title="${esc(pairName(p))}">${pairIcon(p, 'xs')}<span>${esc(t(sl.label))}</span></th>` : `<th title="${esc(t(sl.hint))}">${esc(t(sl.label))}</th>`;
  }).join('');
  const row = d => SHEET_SLOTS.map((sl, i) => {
    const uid = d.r.p.id;
    if (sl.fixed) return `<td>${rosterCell(d.mine.find(x => x.pair_id === sl.fixed()))}</td>`;
    const has = sl.k in d.cells, v = d.cells[sl.k], edit = canEdit(uid);
    const open = sheetPick && sheetPick.uid === uid && sheetPick.slot === sl.k;
    const body = has ? (v ? rosterCell(d.mine.find(x => x.pair_id === v) || { pair: pairById(v), level: 1 }) : rosterCell(null))
      : edit ? `<span class="sc-add">${ico('plus')}</span>` : '<span class="sc-blank"></span>';
    return `<td class="sc ${open ? 'open' : ''} ${i > SHEET_SLOTS.length / 2 ? 'right' : ''}">${edit
      ? `<button type="button" class="sc-btn" data-sc="${uid}|${sl.k}" title="${esc(t(sl.hint))}">${body}</button>` : body}${open ? sheetPicker(d, ty, sl) : ''}</td>`;
  }).join('');

  return `<div class="pf">
    <div class="tchips">${TYPES.map(x => `<button class="tchip ${x === ty ? 'on' : ''}" data-rtype="${x}" style="--tc:${TYPE_COLORS[x]}" title="${t(x)}">${img(typeIcon(x), 'ti', x)}${esc(t(x))}</button>`).join('')}</div>
    <div class="pf-row">
      ${canFill ? `<button class="btn sm" data-sheet-fill title="${t('Fill the empty cells with each member’s best matching pair')}">${ico('bolt')} ${t('Auto-fill empty cells')}</button>` : ''}
      <span class="muted small">${t('EX WTZ = sets the (EX) weather, terrain or zone for this type · Rebuff = lowers the opponents’ Type Rebuff')}</span>
      <div class="seg sm" style="margin-left:auto">${[['fit', 'Best fit first'], ['name', 'Name A–Z']].map(([k, l]) => `<button class="${rosterSort === k ? 'on' : ''}" data-rsort="${k}">${t(l)}</button>`).join('')}</div>
    </div>
  </div>
  <div class="card scroll sheet-wrap"><table class="table troster" style="--tc:${TYPE_COLORS[ty]}">
    <thead><tr><th>#</th><th>${t('Member')}</th>${head}<th class="num">${t('Tower')}</th></tr></thead>
    <tbody>${data.map((d, i) => `<tr class="${d.r.banned ? 'dim' : ''} ${d.r.p.id === S.me ? 'me' : ''}">
      <td class="rank">${i + 1}</td>
      <td><a class="who" href="#/member/${d.r.p.id}/pairs">${av(d.r.p.id, 'xs')}${esc(nameOf(d.r.p))}</a><small class="muted count">${t('{n} pairs', { n: d.mine.filter(x => x.pair.type === ty).length })}</small></td>
      ${row(d)}<td class="num">${towerFloor(d.r.p.id, ty)}<small class="muted">F</small></td></tr>`).join('')}</tbody></table></div>`;
}

// The dropdown of one cell. It lists the pairs of the sheet's type, with the ones that fit the column
// (Physical, Special, EX WTZ…) on top. A pair of another type is one search away: type its name.
const pickCtx = uid => ({ r: { p: profile(uid) }, mine: ownedWithPair(uid), cells: sheetCells(uid, rosterType || defaultRosterType()) });

function sheetPickList(d, ty, slot) {
  const q = (sheetPick.q || '').trim().toLowerCase();
  const cur = d.cells[slot.k];
  const where = new Map();   // pair → the other columns of this row that already hold it
  for (const [k, v] of Object.entries(d.cells)) if (v && k !== slot.k) (where.get(v) || where.set(v, []).get(v)).push(t(SHEET_SLOTS.find(x => x.k === k)?.label || k));
  for (const sl of SHEET_SLOTS) if (sl.fixed && sl.k !== slot.k && sl.fixed()) (where.get(sl.fixed()) || where.set(sl.fixed(), []).get(sl.fixed())).push(t(sl.label));
  const match = x => !q || `${x.pair.trainer} ${x.pair.pokemon} ${x.pair.type} ${x.pair.role} ${x.pair.alt || ''}`.toLowerCase().includes(q);
  const inType = x => q || x.pair.type === ty;   // other types only show up when the user types something
  // "Other" columns are for whatever is left: pairs already placed in this row are filtered out (the cell's own pair stays)
  const isOther = slot.k.startsWith('other'), free = x => !isOther || !where.has(x.pair_id) || x.pair_id === cur;
  const fitting = isOther ? [] : rankForSlot(d.mine, ty, slot).filter(x => match(x) && inType(x)), inFit = new Set(fitting.map(x => x.pair_id));
  const strongest = (a, b) => pairWeight(b) - pairWeight(a) || a.pair.trainer.localeCompare(b.pair.trainer);
  const sameType = d.mine.filter(x => match(x) && free(x) && !inFit.has(x.pair_id) && x.pair.type === ty).sort(strongest);
  const others = !q ? [] : d.mine.filter(x => match(x) && free(x) && !inFit.has(x.pair_id) && x.pair.type !== ty).sort((a, b) => TYPES.indexOf(a.pair.type) - TYPES.indexOf(b.pair.type) || strongest(a, b));
  const item = (x, why) => {
    const also = where.get(x.pair_id);
    return `<button type="button" class="${x.pair_id === cur ? 'on' : ''}" data-sc-pick="${x.pair_id}">
      ${ownIcon(x.pair, x, 'xs')}<span><b>${esc(x.pair.trainer)}</b><small>${esc(x.pair.pokemon)} · ${esc(roleKey(x.pair.role).replace(/^./, c => c.toUpperCase()))} · ${levelLabel(x.level)}${x.ex ? ' · EX' : ''}${x.ex_role ? ' · EXR' : ''}</small>
      ${why.length ? `<em>${why.map(esc).join(' · ')}</em>` : ''}</span>${also ? `<i>${t('also in {c}', { c: esc(also.join(', ')) })}</i>` : ''}</button>`;
  };
  const group = (title, list, why = () => []) => list.length ? `<div class="sc-sec">${title} <small>${list.length}</small></div>${list.map(x => item(x, why(x))).join('')}` : '';
  const body = group(t('Suggested for {slot}', { slot: esc(t(slot.label)) }), fitting, x => tagsFor(x.pair, ty, slot))
    + group(isOther ? t('Remaining {t} pairs', { t: esc(t(ty)) }) : t('Other {t} pairs', { t: esc(t(ty)) }), sameType, x => tagsFor(x.pair, ty, slot))
    + group(t('Other types'), others, x => tagsFor(x.pair, ty, slot));
  const hint = q ? '' : `<p class="sc-hint">${t('Showing {t} pairs. Type a name to find a pair of another type.', { t: esc(t(ty)) })}</p>`;
  if (body) return body + hint;
  const why = q ? t('Nothing in this roster matches “{q}”.', { q: esc(sheetPick.q) })
    : d.mine.length ? t('No {t} pairs in this roster yet.', { t: esc(t(ty)) }) : t('No sync pairs yet.');
  return `<p class="muted">${why} ${t('A pair must be in the roster first — add it under Sync pairs.')} <a href="#/member/${sheetPick.uid}/pairs">${t('Open roster')}</a></p>${hint}`;
}
function sheetPicker(d, ty, slot) {
  return `<div class="sc-pick" role="listbox">
    <div class="sc-pick-h"><b>${esc(t(slot.label))}</b><small>${esc(nameOf(d.r.p))} · ${esc(t(slot.hint))}</small>
      <input class="sc-q" data-sc-q placeholder="${t('Search {n}’s pairs…', { n: esc(nameOf(d.r.p)) })}" value="${esc(sheetPick.q || '')}" autocomplete="off"></div>
    <div class="sc-list">${sheetPickList(d, ty, slot)}</div>
    <div class="sc-pick-f">
      <button type="button" class="btn sm" data-sc-none>${ico('x')} ${t('None')}</button>
      ${slot.k in d.cells ? `<button type="button" class="btn sm ghost" data-sc-clear>${t('Clear')}</button>` : ''}
    </div></div>`;
}
async function saveCell(uid, slot, pair_id) {
  const ty = rosterType || defaultRosterType();
  const ok = pair_id === undefined
    ? await act(() => api.clearSheetCell(uid, ty, slot))
    : await act(() => api.saveSheetCell({ user_id: uid, type: ty, slot, pair_id, updated_by: S.me }));
  if (ok) { S.sheet = await api.sheet(); sheetPick = null; route(); }
}

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-rtype],[data-rsort],[data-sc],[data-sc-pick],[data-sc-none],[data-sc-clear],[data-sheet-fill]');
  if (!el) {
    if (sheetPick && !e.target.closest('.sc-pick')) { sheetPick = null; if ($('.troster')) route(); }
    return;
  }
  const d = el.dataset;
  if (d.rtype) { rosterType = d.rtype; sheetPick = null; route(); }
  if (d.rsort) { rosterSort = d.rsort; route(); }
  if (d.sc) {
    const [uid, slot] = d.sc.split('|');
    sheetPick = sheetPick && sheetPick.uid === uid && sheetPick.slot === slot ? null : { uid, slot, q: '' };
    route();
    $('.sc-q')?.focus();
  }
  if (d.scPick) saveCell(sheetPick.uid, sheetPick.slot, d.scPick);
  if ('scNone' in d) saveCell(sheetPick.uid, sheetPick.slot, null);
  if ('scClear' in d) saveCell(sheetPick.uid, sheetPick.slot, undefined);
  if ('sheetFill' in d) {
    const ty = rosterType || defaultRosterType();
    const rows = S.profiles.filter(p => canEdit(p.id)).flatMap(p =>
      Object.entries(autoFill(owned(p.id), ty, sheetCells(p.id, ty))).map(([slot, pair_id]) => ({ user_id: p.id, type: ty, slot, pair_id, updated_by: S.me })));
    if (!rows.length) return toast(t('Nothing to fill — every cell with a matching pair is already set.'));
    if (isStaff() && !confirm(t('Fill {n} empty cells on the {t} sheet?', { n: rows.length, t: t(ty) }))) return;
    if (await act(() => api.saveSheetCells(rows), t('Filled {n} cells.', { n: rows.length }))) { S.sheet = await api.sheet(); route(); }
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetPick) { sheetPick = null; route(); } });
document.addEventListener('input', e => {
  if (!('scQ' in e.target.dataset) || !sheetPick) return;
  sheetPick.q = e.target.value;
  const ty = rosterType || defaultRosterType();
  e.target.closest('.sc-pick').querySelector('.sc-list').innerHTML = sheetPickList(pickCtx(sheetPick.uid), ty, SHEET_SLOTS.find(x => x.k === sheetPick.slot));
});

// ═══════════════════════════════════════════════════════════════
//  MEMBER PROFILE
// ═══════════════════════════════════════════════════════════════
let memberTab = 'pairs', editingInfo = false;
// Roster filters. The shown order is frozen until a filter, the sort or the owned set changes,
// so toggling EX / stars / level never makes a card jump away under the cursor.
const pairFilter = { q: '', types: new Set(), role: '', status: '', sort: 'type' };
let pairOrder = { key: '', ids: [] };
const SORTS = [['type', 'By type'], ['strength', 'Strongest first'], ['name', 'Name A–Z'], ['new', 'Newest first'], ['rarity', 'Base rarity']];
const STATUS = [['', 'All'], ['ex', '6★ EX'], ['noex', 'Not EX yet'], ['low', 'Below 5★'], ['sa', 'Superawakened']];
const ROLE_KEYS = ['strike', 'tech', 'support', 'sprint', 'field', 'multi'];
const statusOk = (x, st) => !st || (st === 'ex' ? x.ex : st === 'noex' ? !x.ex : st === 'low' ? (x.stars || 5) < 5 : x.level > 5);
const pairSort = {
  type: (a, b) => TYPES.indexOf(a.pair.type) - TYPES.indexOf(b.pair.type) || pairWeight(b) - pairWeight(a) || a.pair.trainer.localeCompare(b.pair.trainer),
  strength: (a, b) => pairWeight(b) - pairWeight(a) || a.pair.trainer.localeCompare(b.pair.trainer),
  name: (a, b) => a.pair.trainer.localeCompare(b.pair.trainer) || a.pair.pokemon.localeCompare(b.pair.pokemon),
  new: (a, b) => String(b.pair.release || '').localeCompare(String(a.pair.release || '')),
  rarity: (a, b) => a.pair.rarity - b.pair.rarity || (a.stars || 5) - (b.stars || 5) || a.pair.trainer.localeCompare(b.pair.trainer),
};
const MTABS = ['pairs', 'tower', 'plan', 'runs'];

function renderMember(id = S.me, tab = '') {
  if (MTABS.includes(tab)) memberTab = tab;
  const p = profile(id);
  if (!p) return `<div class="empty card"><h2>${t('Member not found')}</h2><p class="muted">${t('The account may have been deleted.')}</p></div>`;
  const edit = canEdit(id), mine = owned(id);
  const floors = TYPES.reduce((a, ty) => a + towerFloor(id, ty), 0);
  const fav = pairById(avatarPair(id)?.pair_id);
  const nAsg = S.asg.filter(a => a.user_id === id).length;
  return `
  <section class="banner profile-head" style="--tc:${tc(fav?.type)}">
    ${av(id, 'lg')}
    <div>
      <span class="kicker">${rankName(p.role)}</span>
      <h1>${esc(nameOf(p))}</h1>
      <p class="muted">@${esc(p.username)}${p.facebook ? ` · Facebook: ${esc(p.facebook)}` : ''} · ${t('joined {d}', { d: fmtD(p.joined_at) })}</p>
      ${p.note ? `<p>${esc(p.note)}</p>` : ''}
    </div>
    <div class="stats"><div><b>${mine.length}</b>${t('pairs')}</div><div><b>${mine.filter(x => x.ex).length}</b>EX</div>
      <div><b>${mine.filter(x => x.level >= 10).length}</b>10/5</div><div><b>${floors}</b>${t('tower floors')}</div></div>
    ${edit ? `<button class="btn" data-edit-info>${ico('edit')} ${editingInfo ? t('Close') : t('Edit profile')}</button>` : ''}
  </section>
  ${isStaff() && id !== S.me ? `<div class="manage">${ico('edit')} ${t('You are managing {n}: changes to their roster, tower and battle plan are saved for them.', { n: esc(nameOf(p)) })}</div>` : ''}
  ${editingInfo && edit ? `<form class="card pad form" id="info-form" style="margin-top:14px">
    <div class="grid3"><label>${t('In-game name')}<input name="display_name" value="${esc(p.display_name)}"></label>
    <label>Facebook<input name="facebook" value="${esc(p.facebook)}"></label>
    <label>${t('Joined')}<input name="joined_at" type="date" value="${esc(p.joined_at)}"></label></div>
    <div class="av-up">${av(id, 'lg')}<div>
      <b>${t('Profile picture')}</b>
      <div class="row"><label class="btn">${ico('plus')} ${t('Upload a photo')}<input type="file" accept="image/*" hidden data-avatar-file></label>
        ${p.avatar_url ? `<button type="button" class="btn ghost" data-avatar-remove>${t('Remove photo')}</button>` : ''}</div>
      <small class="muted">${t('Cropped to a square and saved straight away. Without a photo, a sync pair is used.')}</small></div></div>
    <label>${t('Sync pair as the picture (when there is no photo)')}<select name="avatar"><option value="">${t('Strongest sync pair (automatic)')}</option>${[...mine].sort((a, b) => pairWeight(b) - pairWeight(a)).map(x => `<option value="${x.pair_id}" ${x.pair_id === p.avatar ? 'selected' : ''}>${esc(pairName(pairById(x.pair_id)))}</option>`).join('')}</select></label>
    <label>${t('Time zone')}<select name="timezone"><option value="">${t('Not set (use this device: {z})', { z: browserTz() })}</option>${[...new Set([p.timezone, ...allTimezones()].filter(Boolean))].map(z => `<option value="${esc(z)}" ${z === p.timezone ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></label>
    <label>${t('Note')}<textarea name="note" rows="2">${esc(p.note)}</textarea></label>
    <div><button class="btn primary">${t('Save')}</button></div></form>` : ''}
  <div class="toolbar tabs">
    <div class="seg">
      <button class="${memberTab === 'pairs' ? 'on' : ''}" data-mtab="pairs">${t('Sync pairs')} (${mine.length})</button>
      <button class="${memberTab === 'tower' ? 'on' : ''}" data-mtab="tower">${t('Pasio Tower')}</button>
      <button class="${memberTab === 'plan' ? 'on' : ''}" data-mtab="plan">${t('Battle plan')}${nAsg ? ` (${nAsg})` : ''}</button>
      <button class="${memberTab === 'runs' ? 'on' : ''}" data-mtab="runs">${t('Runs this season')}</button>
    </div>
    ${!edit ? `<span class="muted">${t('View only — the member, mods and the admin can edit.')}</span>` : ''}
  </div>
  <div id="member-tab">${tabBody(id, edit)}</div>`;
}
const tabBody = (id, edit) => ({ pairs: pairsTab, tower: towerTab, plan: planTab, runs: runsTab }[memberTab] || pairsTab)(id, edit);

function pairsTab(id, edit) {
  const f = pairFilter;
  const mine = owned(id).map(x => ({ ...x, pair: pairById(x.pair_id) })).filter(x => x.pair);
  const byId = new Map(mine.map(x => [x.pair_id, x]));
  const key = JSON.stringify([id, f.q, [...f.types], f.role, f.status, f.sort, mine.map(x => x.pair_id).sort()]);
  if (pairOrder.key !== key) {
    const q = f.q.trim().toLowerCase();
    pairOrder = { key, ids: mine.filter(x => (!f.types.size || f.types.has(x.pair.type)) && (!f.role || roleKey(x.pair.role) === f.role)
      && statusOk(x, f.status) && (!q || `${x.pair.trainer} ${x.pair.pokemon}`.toLowerCase().includes(q)))
      .sort(pairSort[f.sort]).map(x => x.pair_id) };
  }
  const shown = pairOrder.ids.map(pid => byId.get(pid)).filter(Boolean);
  const count = ty => mine.filter(x => x.pair.type === ty).length;
  const filtered = f.q || f.types.size || f.role || f.status;
  const card = x => ownedCard(x, edit);
  let body;
  if (!shown.length) body = `<p class="muted pad">${mine.length ? t('No sync pair matches these filters.') : t('No sync pairs yet.')}</p>`;
  else if (f.sort === 'type') {
    body = TYPES.filter(ty => shown.some(x => x.pair.type === ty)).map(ty => {
      const list = shown.filter(x => x.pair.type === ty);
      return `<div class="group-h">${img(typeIcon(ty), 'ti', ty)}${esc(t(ty))} <small>${list.length}</small></div><div class="owned-grid">${list.map(card).join('')}</div>`;
    }).join('');
  } else body = `<div class="owned-grid">${shown.map(card).join('')}</div>`;

  return `
  ${edit ? `<div class="card add-pair"><b>${id === S.me ? t('Add a sync pair you own') : t('Add a sync pair {n} owns', { n: esc(nameOf(profile(id))) })}</b>
    <div class="search-box"><input id="own-search" placeholder="${t('Type a trainer or Pokémon name…')}" autocomplete="off"><div class="results" id="own-results"></div></div>
    <button class="btn ${trk.open ? 'primary' : ''}" data-trk-toggle>${ico('plus')} ${t('Import from SyncPairsTracker')}</button></div>
  ${trk.open ? trackerPanel(id) : ''}` : ''}
  <div class="pf">
    <div class="pf-row">
      <label class="search">${ico('search')}<input data-pq placeholder="${t('Search {n} pairs…', { n: mine.length })}" value="${esc(f.q)}" autocomplete="off"></label>
      <label class="sort">${t('Sort')}<select data-psort>${SORTS.map(([k, l]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${t(l)}</option>`).join('')}</select></label>
    </div>
    <div class="tchips">${TYPES.filter(count).map(ty => `<button class="tchip ${f.types.has(ty) ? 'on' : ''}" data-ptype="${ty}" style="--tc:${TYPE_COLORS[ty]}" title="${t(ty)}">${img(typeIcon(ty), 'ti', ty)}${count(ty)}</button>`).join('')}</div>
    <div class="pf-row">
      <div class="seg sm">${['', ...ROLE_KEYS].map(r => `<button class="${f.role === r ? 'on' : ''}" data-prole="${r}">${r ? `${img(roleIcon(r), 'ri')}${t(r[0].toUpperCase() + r.slice(1))}` : t('All roles')}</button>`).join('')}</div>
      <div class="seg sm">${STATUS.map(([k, l]) => `<button class="${f.status === k ? 'on' : ''}" data-pstatus="${k}">${t(l)}</button>`).join('')}</div>
      <span class="count">${t('{a} of {b}', { a: shown.length, b: mine.length })}</span>
      ${filtered ? `<button class="reset" data-preset>${t('Clear filters')}</button>` : ''}
    </div>
  </div>
  ${body}`;
}

// One owned pair = one tile: icon (shows stars / EX), then "4/5 · EXR" underneath.
// Click it to open a small editor: stars (pairs below 5★) → 6★ EX → EX Role, and move level.
let pairEdit = null;
function ownedCard(x, edit) {
  const p = x.pair, stars = x.stars || p.rarity, open = pairEdit === p.id;
  return `<div class="owned tile ${x.level > 5 ? 'sa' : ''} ${open ? 'open' : ''}" data-pair="${p.id}" data-stars="${stars}">
    <button type="button" class="tile-btn" data-tile="${p.id}" title="${esc(pairName(p))} · ${esc(p.role)}${x.ex_role ? ` · EX Role ${esc(p.exRole)}` : ''}">
      ${ownIcon(p, x, 'md')}<span class="cap">${levelLabel(x.level)}${x.ex_role ? '<b>EXR</b>' : ''}</span></button>
    ${open ? pairPop(x, edit) : ''}</div>`;
}
function pairPop(x, edit) {
  const p = x.pair, max = p.maxBonus, stars = x.stars || p.rarity;
  const starBtns = [1, 2, 3, 4, 5].map(n => {
    const base = n <= p.rarity;
    return `<button type="button" class="${n <= stars ? 'on' : ''} ${base ? 'base' : 'up'}" ${edit && !base ? `data-own-star="${n}"` : 'disabled'}
      title="${base ? t('Base rarity {n}★', { n: p.rarity }) : t('Raise to {n}★', { n })}">${ico('star')}</button>`;
  }).join('');
  return `<div class="pop" role="dialog">
    <div class="pop-h"><b>${esc(p.trainer)}</b><small>${esc(p.pokemon)}</small>
      <span class="o-tags">${typeTag(p.type)}${roleTag(p.role)}</span></div>
    <div class="o-ctl">
      ${p.rarity < 5 ? `<span class="stars" title="${t('Raise the stars to 5★ to unlock 6★ EX')}">${starBtns}</span>` : ''}
      <button class="tog ex ${x.ex ? 'on' : ''}" data-own="${p.id}" data-k="ex" ${edit && stars >= 5 ? '' : 'disabled'} title="${stars < 5 ? t('Raise to 5★ first') : t('6★ EX unlocked')}">EX</button>
      ${p.exRole ? `<button class="tog ${x.ex_role ? 'on' : ''}" data-own="${p.id}" data-k="ex_role" ${edit ? '' : 'disabled'} title="EX Role: ${esc(p.exRole)}">${img(roleIcon(p.exRole, true), 'ri')}</button>` : ''}
      <select data-own="${p.id}" data-k="level" ${edit ? '' : 'disabled'} title="${t('Move level')}${max === 10 ? ' · ' + t('6/5–10/5 = Superawakened') : ''}">
        ${Array.from({ length: max }, (_, i) => i + 1).map(l => `<option value="${l}" ${l === x.level ? 'selected' : ''}>${levelLabel(l)}</option>`).join('')}</select>
      ${edit ? `<button class="x" data-own-del="${p.id}" aria-label="${t('Remove')}" title="${t('Remove')}">${ico('x')}</button>` : ''}
    </div></div>`;
}
// Keep the editor inside the window
function placePop() {
  const pop = $('.tile.open .pop');
  if (!pop) return;
  const r = pop.getBoundingClientRect();
  if (r.right > innerWidth - 8) pop.style.left = `${-(r.right - innerWidth + 8)}px`;
  if (r.left < 8) pop.style.left = `${8 - r.left}px`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-tile]');
  if (b) { pairEdit = pairEdit === b.dataset.tile ? null : b.dataset.tile; redrawTab(); return; }
  if (pairEdit && !e.target.closest('.tile.open')) { pairEdit = null; if ($('#member-tab')) redrawTab(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && pairEdit) { pairEdit = null; redrawTab(); } });

// ─── Import a SyncPairsTracker backup into the roster ───
const trk = { open: false, text: '', replace: false };
function trkPlan(uid) {
  const parsed = parseTrackerBackup(trk.text);
  if (parsed.error) return { parsed };
  const { rows, unknown } = trackerRows(parsed.entries, pairByTrackerKey);
  const have = new Map(owned(uid).map(x => [x.pair_id, x]));
  const seen = new Set(rows.map(r => r.pair_id));
  const fresh = rows.filter(r => !have.has(r.pair_id)).length;
  const changed = rows.filter(r => { const h = have.get(r.pair_id); return h && (h.level !== r.level || (h.stars || 0) !== r.stars || !!h.ex !== r.ex || !!h.ex_role !== r.ex_role); }).length;
  const dropped = [...have.keys()].filter(id => !seen.has(id));
  return { parsed, rows: rows.filter((r, i) => rows.findIndex(x => x.pair_id === r.pair_id) === i), unknown, fresh, changed, dropped };
}
function trkPreview(uid) {
  if (!trk.text.trim()) return `<p class="muted">${t('Nothing pasted yet.')}</p>`;
  const plan = trkPlan(uid);
  if (plan.parsed.error) return `<p class="form-err">${plan.parsed.error === 'json' ? t('That is not a SyncPairsTracker backup — copy it with the tracker’s Export button.') : t('No sync pairs found in that backup.')}</p>`;
  return `<p><b>${t('{n} sync pairs recognised', { n: plan.rows.length })}</b> · ${t('{a} new, {b} changed, {c} unchanged', { a: plan.fresh, b: plan.changed, c: plan.rows.length - plan.fresh - plan.changed })}
    ${plan.unknown.length ? `<br><span class="muted">${t('{n} entries are not in the pair list and were skipped.', { n: plan.unknown.length })}</span>` : ''}
    ${trk.replace && plan.dropped.length ? `<br><span class="warn">${t('{n} pairs of this roster are not in the backup and will be removed.', { n: plan.dropped.length })}</span>` : ''}</p>`;
}
function trackerPanel(uid) {
  return `<div class="card pad trk">
    <h3>${t('Import from SyncPairsTracker')}</h3>
    <ol><li>${t('Open the tracker, tick your sync pairs and press')} <b>Export</b> — ${t('it copies a backup to your clipboard.')} <a href="${POMA}" target="_blank" rel="noopener">${t('Open the tracker')}</a></li>
      <li>${t('Paste it below. Levels, stars, 6★ EX and EX Role come along.')}</li></ol>
    <textarea id="trk-text" rows="4" placeholder='{"002|0095":"4|3|0|000|0|0", …}' spellcheck="false">${esc(trk.text)}</textarea>
    <div class="row"><button class="btn sm" data-trk-paste>${t('Paste from clipboard')}</button>
      <div class="seg sm"><button class="${trk.replace ? '' : 'on'}" data-trk-mode="merge">${t('Add & update')}</button><button class="${trk.replace ? 'on' : ''}" data-trk-mode="replace">${t('Replace roster')}</button></div></div>
    <div id="trk-preview">${trkPreview(uid)}</div>
    <div class="row"><button class="btn primary" data-trk-go>${t('Import')}</button><button class="btn ghost" data-trk-toggle>${t('Cancel')}</button></div>
  </div>`;
}
document.addEventListener('input', e => {
  if (e.target.id !== 'trk-text') return;
  trk.text = e.target.value;
  $('#trk-preview').innerHTML = trkPreview(memberId());
});
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-trk-toggle],[data-trk-paste],[data-trk-mode],[data-trk-go]');
  if (!el) return;
  const uid = memberId(), d = el.dataset;
  if ('trkToggle' in d) { trk.open = !trk.open; if (!trk.open) trk.text = ''; redrawTab(); }
  if ('trkPaste' in d) {
    try { trk.text = await navigator.clipboard.readText(); } catch { return toast(t('Could not read the clipboard — paste into the box instead.'), true); }
    redrawTab();
  }
  if (d.trkMode) { trk.replace = d.trkMode === 'replace'; redrawTab(); }
  if ('trkGo' in d) {
    const plan = trkPlan(uid);
    if (plan.parsed.error || !plan.rows.length) return toast(t('Paste a SyncPairsTracker backup first.'), true);
    if (trk.replace && plan.dropped.length && !confirm(t('Replace the roster? {n} pairs that are not in the backup will be removed.', { n: plan.dropped.length }))) return;
    const rows = plan.rows.map(r => ({ user_id: uid, ...r }));
    if (await act(async () => { await api.upsertMemberPairs(rows); if (trk.replace && plan.dropped.length) await api.deleteMemberPairs(uid, plan.dropped); },
      t('Imported {n} sync pairs ({a} new, {b} updated).', { n: rows.length, a: plan.fresh, b: plan.changed }))) {
      [S.mp, S.asg, S.sheet] = await Promise.all([api.memberPairs(), S.sid ? api.assignments(S.sid) : [], api.sheet()]);
      Object.assign(trk, { open: false, text: '' });
      redrawTab();
    }
  }
});

// The tower overview as a PNG (drawn on a canvas, no outside images so it can always be saved or copied)
function towerCanvas(id) {
  const p = profile(id), W = 960, rowH = 58, top = 150, rows = Math.ceil(TYPES.length / 2), H = top + rows * rowH + 56;
  const dpr = 2, cv = document.createElement('canvas');
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement), acc = css.getPropertyValue('--accent').trim() || '#e83a2a';
  g.fillStyle = '#12151f'; g.fillRect(0, 0, W, H);
  g.fillStyle = acc; g.fillRect(0, 0, W, 8);
  const font = (w, px) => { g.font = `${w} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`; };
  const total = TYPES.reduce((a, ty) => a + towerFloor(id, ty), 0);
  g.fillStyle = '#fff'; font(800, 40); g.fillText(nameOf(p).slice(0, 28), 40, 70);
  g.fillStyle = '#9aa3b8'; font(600, 18); g.fillText(`${(window.GYM_CONFIG || {}).gymName || ''} · Pasio Tower`, 40, 100);
  g.fillStyle = '#fff'; font(800, 44); g.textAlign = 'right'; g.fillText(`${total}`, W - 40, 70);
  g.fillStyle = '#9aa3b8'; font(600, 16); g.fillText(`/ ${TYPES.length * TOWER_TOP} ${t('floors')}`, W - 40, 98); g.textAlign = 'left';
  TYPES.forEach((ty, i) => {
    const col = i < rows ? 0 : 1, row = i % rows, x = 40 + col * 440, y = top + row * rowH;
    const rec = S.tower.find(r => r.user_id === id && r.type === ty), f = rec?.floor || 0, c = TYPE_COLORS[ty] || '#888';
    g.fillStyle = c; g.beginPath(); g.arc(x + 12, y + 14, 10, 0, 7); g.fill();
    g.fillStyle = '#fff'; font(700, 18); g.fillText(t(ty), x + 32, y + 20);
    g.textAlign = 'right'; font(800, 18); g.fillStyle = rec ? '#fff' : '#6c7590'; g.fillText(rec ? `${f} / ${TOWER_TOP}` : t('not updated'), x + 400, y + 20); g.textAlign = 'left';
    g.fillStyle = '#242a3b'; g.beginPath(); g.roundRect(x, y + 30, 400, 10, 5); g.fill();
    if (f) { g.fillStyle = c; g.beginPath(); g.roundRect(x, y + 30, Math.max(10, 400 * f / TOWER_TOP), 10, 5); g.fill(); }
  });
  g.fillStyle = '#6c7590'; font(500, 14);
  g.fillText(`${t('Exported')} ${new Date().toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short', timeZone: viewTz() })} (${viewTz()})`, 40, H - 22);
  return cv;
}
const towerBlob = id => new Promise(res => towerCanvas(id).toBlob(res, 'image/png'));
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-tower-img]');
  if (!b) return;
  const id = b.dataset.towerImg, blob = await towerBlob(id);
  if (b.dataset.mode === 'copy') {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast(t('Image copied.')); return; }
    catch { toast(t('Copying images is not supported here — the image was saved instead.')); }
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `pasio-tower-${profile(id)?.username || id}.png` });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
});
function towerTab(id, edit) {
  const total = TYPES.reduce((a, ty) => a + towerFloor(id, ty), 0);
  return `<div class="row" style="margin-bottom:8px"><button class="btn" data-tower-img="${id}" data-mode="save">${ico('out')} ${t('Save as image')}</button>
    <button class="btn ghost" data-tower-img="${id}" data-mode="copy">${t('Copy image')}</button></div>
  <p class="lead">${t('Pasio Tower has one 40-floor tower per type, and only pairs of that type can climb it — the higher the floor, the more experience with that type. Total: {n} of {max} floors.', { n: total, max: TYPES.length * TOWER_TOP })}</p>
  <div class="tower-grid">${TYPES.map(ty => {
    const f = towerFloor(id, ty);
    return `<div class="card tw ${f >= TOWER_TOP ? 'top' : ''}" style="--tc:${TYPE_COLORS[ty]}">
      <div class="tw-head">${typeTag(ty)}<span class="tw-val">${edit
        ? `<input class="tw-n" type="number" min="0" max="${TOWER_TOP}" step="1" inputmode="numeric" value="${f}" data-tower="${ty}" aria-label="${t('{type} tower floor', { type: t(ty) })}" title="${t('Type a floor number')}">`
        : `<b>${f}</b>`}<small> / ${TOWER_TOP}</small></span></div>
      <div class="meter"><i style="width:${f / TOWER_TOP * 100}%"></i></div>
      ${edit ? `<input type="range" min="0" max="${TOWER_TOP}" value="${f}" data-tower="${ty}" aria-label="${t('{type} tower floor', { type: t(ty) })}">` : ''}
    </div>`;
  }).join('')}</div>`;
}

function planTab(id) {
  const s = season();
  if (!s) return `<p class="muted pad">${t('No Gym Battle season yet')}</p>`;
  const mine = S.asg.filter(a => a.user_id === id);
  const free = s.leaders.filter(l => !mine.some(a => a.leader === l.name));
  return `<p class="lead">${t('Which Gym Leaders {n} fights in {s}, and with which sync pairs from their own roster.', { n: esc(nameOf(profile(id))), s: esc(s.name) })}</p>
  <div class="squad" style="max-width:760px">${mine.map(a => squadRow(a, true)).join('') || `<p class="muted">${t('Not assigned to any Gym Leader yet.')}</p>`}</div>
  ${isStaff() && free.length ? `<div class="assign-new" style="margin-top:10px"><select data-asg-add-leader="${id}"><option value="">+ ${t('Assign to a Gym Leader…')}</option>${free.map(l => `<option value="${esc(l.name)}">${esc(l.name)}</option>`).join('')}</select></div>` : ''}`;
}

function runsTab(id) {
  const list = S.runs.filter(r => r.user_id === id), st = state();
  return list.length ? `<div class="card list">${list.map(runLine).join('')}</div>
    <p class="muted">${t('{s} points · {t} of {g} tickets', { s: fmtN(list.reduce((a, r) => a + r.score, 0)), t: list.reduce((a, r) => a + r.tickets, 0), g: st?.granted ?? 0 })}</p>`
    : `<p class="muted pad">${t('No runs in the selected season.')}</p>`;
}

const memberId = () => location.hash.split('/')[2] || S.me;
const redrawTab = () => { $('#member-tab').innerHTML = tabBody(memberId(), canEdit(memberId())); placePop(); };

// Save one owned pair and redraw in place (the frozen order keeps the card where it is)
async function saveOwned(uid, pid, patch) {
  if (await act(() => api.upsertMemberPair({ user_id: uid, pair_id: pid, ...patch }))) { S.mp = await api.memberPairs(); redrawTab(); }
}
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-mtab],[data-ptype],[data-prole],[data-pstatus],[data-preset],[data-edit-info],[data-own-add],[data-own-del],[data-own-star],.tog[data-own]');
  if (!el) return;
  const uid = memberId(), d = el.dataset;
  if (d.mtab) { memberTab = d.mtab; asgEdit = null; route(); }
  if (d.ptype) { pairFilter.types.has(d.ptype) ? pairFilter.types.delete(d.ptype) : pairFilter.types.add(d.ptype); redrawTab(); }
  if ('prole' in d) { pairFilter.role = d.prole; redrawTab(); }
  if ('pstatus' in d) { pairFilter.status = d.pstatus; redrawTab(); }
  if ('preset' in d) { Object.assign(pairFilter, { q: '', role: '', status: '' }); pairFilter.types.clear(); redrawTab(); }
  if ('editInfo' in d) { editingInfo = !editingInfo; route(); }
  if (d.ownAdd) {
    if (await act(() => api.upsertMemberPair({ user_id: uid, pair_id: d.ownAdd, level: 1 }), t('Added {p}.', { p: pairName(pairById(d.ownAdd)) }))) {
      S.mp = await api.memberPairs(); route(); $('#own-search')?.focus();
    }
  }
  if (d.ownDel) {
    if (!confirm(t('Remove {p} from the owned list?', { p: pairName(pairById(d.ownDel)) }))) return;
    if (await act(() => api.deleteMemberPair(uid, d.ownDel))) { [S.mp, S.asg, S.sheet] = await Promise.all([api.memberPairs(), S.sid ? api.assignments(S.sid) : [], api.sheet()]); redrawTab(); }
  }
  if (d.ownStar) {
    const pid = el.closest('[data-pair]').dataset.pair, cur = ownedPair(uid, pid), p = pairById(pid);
    const n = +d.ownStar, now = cur.stars || p.rarity;
    const stars = n === now ? Math.max(p.rarity, n - 1) : n;   // click the top star again to step back
    saveOwned(uid, pid, stars < 5 ? { stars, ex: false } : { stars });
  }
  if (el.classList.contains('tog')) {
    const cur = ownedPair(uid, d.own), on = !cur[d.k];
    saveOwned(uid, d.own, { [d.k]: on });
  }
});
document.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset.own && el.dataset.k === 'level') saveOwned(memberId(), el.dataset.own, { level: +el.value });
  if ('psort' in el.dataset) { pairFilter.sort = el.value; redrawTab(); }
  if (el.dataset.tower) {   // the slider and the number box save the same way; typed numbers are kept within 0–40
    const floor = Math.max(0, Math.min(TOWER_TOP, Math.round(Number(el.value)) || 0));
    if (await act(() => api.upsertTower({ user_id: memberId(), type: el.dataset.tower, floor }), t('{type} tower: floor {n}', { type: t(el.dataset.tower), n: floor }))) {
      S.tower = await api.tower(); redrawTab();
    }
  }
});
// Click a floor number to type it: select it so typing replaces it
document.addEventListener('focusin', e => { if (e.target.classList?.contains('tw-n')) e.target.select(); });
document.addEventListener('keydown', e => { if (e.target.classList?.contains('tw-n') && e.key === 'Enter') e.target.blur(); });
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.tower) {   // live while dragging or typing; saved on change
    const tile = el.closest('.tw'), v = Math.max(0, Math.min(TOWER_TOP, Math.round(Number(el.value)) || 0));
    tile.querySelector('.meter i').style.width = `${v / TOWER_TOP * 100}%`;
    if (el.type === 'range') tile.querySelector('.tw-n').value = v;
    else if (el.value !== '') tile.querySelector('input[type=range]').value = v;
  }
  if ('pq' in el.dataset) {
    pairFilter.q = el.value;
    const pos = el.selectionStart;
    redrawTab();
    const n = $('[data-pq]'); n.focus(); n.setSelectionRange(pos, pos);
  }
  if (el.id === 'own-search') {
    const have = new Set(owned(memberId()).map(x => x.pair_id));
    const q = el.value.trim().toLowerCase();
    const res = q.length < 2 ? [] : PAIRS().filter(p => !have.has(p.id) && `${p.trainer} ${p.pokemon}`.toLowerCase().includes(q)).slice(0, 12);
    $('#own-results').innerHTML = res.map(p => `<button type="button" data-own-add="${p.id}">${pairIcon(p, 'xs')}<span>${esc(pairName(p))}</span>${typeTag(p.type)}<small>${t('up to {n}/5', { n: p.maxBonus })}</small></button>`).join('')
      || (q.length >= 2 ? `<p class="muted">${t('Nothing found (or already owned).')}</p>` : '');
  }
});
// Profile photo: crop the middle square to 256 px in the browser, then upload
async function squarePhoto(file, size = 256) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const side = Math.min(bmp.width, bmp.height), c = Object.assign(document.createElement('canvas'), { width: size, height: size });
  c.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error(t('Could not read that image.')))), 'image/webp', 0.86));
}
document.addEventListener('change', async e => {
  if (!('avatarFile' in e.target.dataset) || !e.target.files?.[0]) return;
  const file = e.target.files[0];
  if (!file.type.startsWith('image/')) return toast(t('Please choose an image file.'), true);
  if (file.size > 12e6) return toast(t('That image is too large (12 MB max).'), true);
  const done = await act(async () => api.uploadAvatar(memberId(), await squarePhoto(file)), t('Photo saved.'));
  if (done) { S.profiles = await api.profiles(); route(); }
});
document.addEventListener('click', async e => {
  if (!e.target.closest('[data-avatar-remove]')) return;
  if (await act(() => api.removeAvatar(memberId()), t('Photo removed.'))) { S.profiles = await api.profiles(); route(); }
});
document.addEventListener('submit', async e => {
  if (e.target.id !== 'info-form') return;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  if (await act(() => api.updateProfile(memberId(), f), t('Profile saved.'))) { S.profiles = await api.profiles(); editingInfo = false; route(); }
});

// ═══════════════════════════════════════════════════════════════
//  ACCOUNT
// ═══════════════════════════════════════════════════════════════
function renderSettings() {
  const a = getAppearance();
  return `<div class="toolbar"><h1>${t('Settings')}</h1></div>
  <section class="card pad settings">
    <h2 class="title">${t('Style')}</h2>
    <div class="style-grid">${STYLES.map(x => `
      <button class="style-card ${a.style === x.id ? 'on' : ''}" data-set-style="${x.id}">
        <span class="preview" data-style="${x.id}" data-theme="${document.documentElement.dataset.theme}" data-accent="${a.accent}">
          <i class="pv-bar"></i><i class="pv-card"><b></b><b></b></i><i class="pv-btn"></i></span>
        <b>${x.name}</b><small>${t(x.note)}</small></button>`).join('')}</div>
    <div class="set-row"><span>${t('Mode')}</span>
      <div class="seg">${MODES.map(([k, l]) => `<button class="${a.mode === k ? 'on' : ''}" data-set-mode="${k}">${k === 'light' ? ico('sun') : k === 'dark' ? ico('moon') : ''}${t(l)}</button>`).join('')}</div></div>
    <div class="set-row"><span>${t('Accent')}</span>
      <div class="swatches">${ACCENTS.map(x => `<button class="swatch ${a.accent === x.id ? 'on' : ''}" data-set-accent="${x.id}" style="--sw:${x.color}" title="${t(x.name)}" aria-label="${t(x.name)}"></button>`).join('')}</div></div>
    <div class="set-row"><span>${t('Mascot')}</span>
      <div class="mascot-set">
        <div class="mascot-pick">${[...MASCOTS.map(m => [m.id, m.name]), ['off', t('Off')]].map(([k, l]) => `<button class="${a.mascot === k || (k === 'kai' && !MASCOTS.some(m => m.id === a.mascot) && a.mascot !== 'off') ? 'on' : ''}" data-set-mascot="${k}">${k === 'off' ? `<span class="m-off">${ico('x')}</span>` : mascotHead(k, a.mascotStyle)}<span>${esc(l)}</span></button>`).join('')}</div>
        <div class="seg sm">${MASCOT_STYLES.map(([k, l]) => `<button class="${a.mascotStyle === k ? 'on' : ''}" data-set-mstyle="${k}">${t(l)}</button>`).join('')}</div>
      </div></div>
    <div class="set-row"><span>${t('Language')}</span>${langSelect()}</div>
  </section>
  <div class="cols section">
    <form class="card pad form" id="pw-form"><h2 class="title">${t('Change password')}</h2>
      <label>${t('New password')}<input name="pw" type="password" minlength="8" autocomplete="new-password" required></label>
      <label>${t('Repeat it')}<input name="pw2" type="password" minlength="8" autocomplete="new-password" required></label>
      <div><button class="btn primary">${t('Change password')}</button></div><p class="form-err" id="pw-err"></p></form>
    <div class="card pad"><h2 class="title">${t('Signed in')}</h2>
      <p class="row">${av(S.me)} <b>${esc(nameOf(meP()))}</b> (@${esc(meP().username)}) ${rankTag(meP().role, true)}</p>
      <div class="row"><a class="btn" href="#/member/${S.me}">${ico('users')} ${t('My profile, pairs & tower')}</a><button class="btn ghost" data-signout>${ico('out')} ${t('Sign out')}</button></div></div>
  </div>`;
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-set-style],[data-set-mode],[data-set-accent],[data-set-mascot],[data-set-mstyle]');
  if (!el) return;
  const d = el.dataset;
  applyAppearance(d.setStyle ? { style: d.setStyle } : d.setMode ? { mode: d.setMode } : d.setMascot ? { mascot: d.setMascot } : d.setMstyle ? { mascotStyle: d.setMstyle } : { accent: d.setAccent });
  showMascot();
  if (d.setMascot && d.setMascot !== 'off') companion.greet(t(MASCOTS.find(m => m.id === d.setMascot).cry[1]));
  route();
});
document.addEventListener('submit', async e => {
  if (e.target.id !== 'pw-form') return;
  e.preventDefault();
  const f = new FormData(e.target);
  if (f.get('pw') !== f.get('pw2')) { $('#pw-err').textContent = t('The passwords do not match.'); return; }
  if (await act(() => api.changePassword(f.get('pw')), t('Password changed.'))) e.target.reset();
});
document.addEventListener('click', async e => {
  if (!e.target.closest('[data-signout]')) return;
  await api.signOut();
  S.me = null;
  location.hash = '#/login';
  route();
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN
// ═══════════════════════════════════════════════════════════════
let adminTab = 'seasons', newAccount = null;
const genPassword = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');

function renderAdmin() {
  if (!isStaff()) return `<div class="empty card">${t('Only the admin and mods can open this page.')}</div>`;
  return `<div class="toolbar"><h1>${t('Admin')}</h1><div class="seg">
    <button class="${adminTab === 'seasons' ? 'on' : ''}" data-atab="seasons">${t('Gym Battle seasons')}</button>
    ${isAdmin() ? `<button class="${adminTab === 'accounts' ? 'on' : ''}" data-atab="accounts">${t('Accounts')}</button>` : ''}
    <button class="${adminTab === 'catalog' ? 'on' : ''}" data-atab="catalog">${t('Pair catalog')}</button>
    <button class="${adminTab === 'activity' ? 'on' : ''}" data-atab="activity">${t('Activity')}</button>
  </div></div><div id="admin-body"><p class="muted">${t('Loading…')}</p></div>`;
}
after.admin = async () => {
  if (!isStaff()) return;
  const body = $('#admin-body');
  if (adminTab === 'seasons') { body.innerHTML = adminSeasons(); prefillSeason(); }
  if (adminTab === 'accounts' && isAdmin()) body.innerHTML = adminAccounts();
  if (adminTab === 'catalog') body.innerHTML = `<div class="card pad"><h2 class="title">${t('Pair catalog')}</h2>
    <p>${t('The database has {a} sync pairs; the tracker ({v}) lists {b}.', { a: `<b>${await api.catalogCount()}</b>`, b: `<b>${PAIRS().length}</b>`, v: esc(catalogVersion()) })}</p>
    <p class="muted">${t('Sync again after a game update so members can add the new pairs.')}</p>
    <button class="btn primary" data-sync-catalog>${t('Sync {n} pairs', { n: PAIRS().length })}</button></div>`;
  if (adminTab === 'activity') {
    const list = await api.activity();
    body.innerHTML = `<div class="card scroll"><table class="table"><thead><tr><th>${t('When')}</th><th>${t('Who')}</th><th>${t('What')}</th><th>${t('Details')}</th></tr></thead>
      <tbody>${list.map(a => `<tr><td class="muted nowrap">${fmtDT(a.at)}</td><td>${esc(a.actor_name)}</td><td><span class="badge">${esc(a.action)}</span></td>
        <td class="muted">${esc(activityText(a))}</td></tr>`).join('') || `<tr><td colspan="4" class="muted">${t('Nothing yet.')}</td></tr>`}</tbody></table></div>`;
  }
};
function activityText(a) {
  const d = a.detail || {};
  if (a.action.startsWith('runs.')) return `${d.member_name || ''} · ${d.leader || ''} · round ${d.round ?? ''} · ${fmtN(d.score)}`;
  if (a.action.startsWith('account.')) return `${d.username || d.display_name || d.user_id || ''}${d.role ? ' → ' + d.role : ''}`;
  if (a.action.startsWith('seasons.')) return d.name || '';
  if (a.action.startsWith('profiles.')) return d.display_name || d.username || '';
  return JSON.stringify(d).slice(0, 120);
}

function adminSeasons() {
  const s = season(), gyms = GYMS();
  return `<div class="cols">
  <form class="card pad form" id="season-form"><h2 class="title">${t('New season')}</h2>
    <label>${t('Take Gym Leaders & circuits from the datamine')}
      <select name="gym"><option value="">— ${t('enter them by hand')} —</option>${gyms.map((g, i) => `<option value="${i}" ${i === gyms.length - 1 ? 'selected' : ''}>${esc(g.name)} · ${esc((g.stages[0]?.leaders || []).map(l => l.name).join(', '))}</option>`).join('')}</select></label>
    <label>${t('Season name')}<input name="name" required placeholder="SS4 Sinnoh"></label>
    <div class="grid3"><label>${t('Battle starts (your time)')}<input name="battle_start" type="datetime-local" required></label>
      <label>${t('Battle ends')}<input name="battle_end" type="datetime-local" required></label>
      <label>${t('Target score (e.g. Top 100)')}<input name="target_score" type="number" min="0"></label></div>
    <div class="grid4"><label>${t('Tickets on day 1')}<input name="tickets_day1" type="number" value="12" min="0"></label>
      <label>${t('+ per day')}<input name="tickets_daily" type="number" value="3" min="0"></label>
      <label>${t('Cap per member')}<input name="ticket_cap" type="number" value="30" min="1"></label>
      <label>${t('Cap for the gym')}<input name="gym_ticket_cap" type="number" value="600" min="1"></label></div>
    <label class="check"><input type="checkbox" name="is_active" checked> ${t('Make it the running season')}</label>
    <label>${t('Gym Leaders when entering by hand — one per line: "Name, Type, Weakness1 Weakness2"')}<textarea name="leaders" rows="3" placeholder="Roark, Rock, Grass&#10;Gardenia, Grass, Flying"></textarea></label>
    <div><button class="btn primary">${t('Create season')}</button></div><p class="form-err" id="season-err"></p>
  </form>
  <div class="card pad"><h2 class="title">${t('Seasons')}</h2>
    <div class="scroll"><table class="table"><tbody>${S.seasons.map(x => `<tr>
      <td>${x.is_active ? '<i class="dot"></i>' : ''}<b>${esc(x.name)}</b><br><small class="muted">${esc(x.gym_key || t('entered by hand'))} · ${t('{n} leaders', { n: x.leaders.length })}</small></td>
      <td class="muted nowrap">${fmtDT(x.battle_start)}<br>${fmtDT(x.battle_end)}</td>
      <td class="acts">${x.is_active ? '' : `<button class="btn sm" data-season-activate="${x.id}">${t('Set running')}</button>`}
        ${isAdmin() ? `<button class="btn sm ghost" data-season-del="${x.id}">${t('Delete')}</button>` : ''}</td></tr>`).join('') || `<tr><td class="muted">${t('No seasons yet.')}</td></tr>`}</tbody></table></div>
    ${s ? `<h3 style="margin-top:18px">${t('Lock members in {s}', { s: esc(s.name) })}</h3><p class="muted">${t('Locked members cannot log new runs and do not count toward the combined score.')}</p>
      <div class="chips">${S.profiles.map(p => {
        const banned = S.sm.some(m => m.user_id === p.id && m.banned);
        return `<button class="pill ${banned ? 'bad' : ''}" data-ban="${p.id}">${ico(banned ? 'lock' : 'unlock')} ${esc(nameOf(p))}</button>`;
      }).join('')}</div>` : ''}
  </div></div>`;
}
function prefillSeason() {
  const f = $('#season-form');
  const g = f && GYMS()[+f.gym.value];
  if (!g || f.gym.value === '') return;
  const pre = seasonFromGym(g);
  const local = iso => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  f.name.value = g.name;
  f.battle_start.value = local(pre.battle_start);
  f.battle_end.value = local(pre.battle_end);
}

function adminAccounts() {
  return `<div class="cols">
  <form class="card pad form" id="account-form"><h2 class="title">${t('New account')}</h2>
    <p class="muted" style="margin:0">${t('The new member signs in with this username and temporary password, then changes the password and fills in their pairs and tower.')}</p>
    <div class="grid3"><label>${t('Username')}<input name="username" required pattern="[a-z0-9_.\\-]{3,32}" placeholder="${t('lowercase, digits, _ . -')}"></label>
      <label>${t('In-game name')}<input name="display_name"></label>
      <label>${t('Role')}<select name="role"><option value="member">${t('Member')}</option><option value="mod">${t('Mod')}</option><option value="admin">${t('Admin')}</option></select></label></div>
    <label>${t('Temporary password')}<div class="row"><input name="password" required minlength="8" value="${genPassword()}"><button type="button" class="btn sm ghost" data-genpw>${t('New one')}</button></div></label>
    <div><button class="btn primary">${t('Create account')}</button></div>
    ${newAccount ? `<div class="handoff">${ico('check')} ${t('Send this to {n}:', { n: `<b>${esc(newAccount.display_name || newAccount.username)}</b>` })}
      <code>${t('Link')}: ${esc(location.href.split('#')[0].split('?')[0])}\n${t('Username')}: ${esc(newAccount.username)}\n${t('Password')}: ${esc(newAccount.password)}</code></div>` : ''}
    <p class="form-err" id="account-err"></p>
  </form>
  <div class="card pad"><h2 class="title">${t('Accounts')} (${S.profiles.length})</h2>
    <div class="scroll"><table class="table"><tbody>${S.profiles.map(p => `<tr>
      <td><span class="who">${av(p.id, 'xs')}<span><b>${esc(nameOf(p))}</b><br><small class="muted">@${esc(p.username)}</small></span></span></td>
      <td>${p.id === S.me ? rankTag(p.role, true) : `<select data-role="${p.id}">${['member', 'mod', 'admin'].map(r => `<option value="${r}" ${r === p.role ? 'selected' : ''}>${rankName(r)}</option>`).join('')}</select>`}</td>
      <td class="acts">${p.id === S.me ? '' : `<button class="btn sm ghost" data-resetpw="${p.id}">${t('Reset password')}</button><button class="btn sm danger" data-deluser="${p.id}">${t('Delete')}</button>`}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted">${t('Delete the account when a member leaves: their pairs and tower go, their runs keep their name.')}</p>
  </div></div>`;
}

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-atab],[data-sync-catalog],[data-season-activate],[data-season-del],[data-ban],[data-genpw],[data-resetpw],[data-deluser]');
  if (!el) return;
  if (el.dataset.atab) { adminTab = el.dataset.atab; route(); }
  if ('syncCatalog' in el.dataset) { el.disabled = true; if (await act(() => api.syncCatalog(catalogRows()), t('Pair catalog synced.'))) after.admin(); }
  if (el.dataset.seasonActivate) { if (await act(() => api.setActiveSeason(+el.dataset.seasonActivate), t('Running season changed.'))) { S.seasons = await api.seasons(); route(); } }
  if (el.dataset.seasonDel) {
    const s = S.seasons.find(x => x.id === +el.dataset.seasonDel);
    if (prompt(t('Delete "{s}" and ALL of its runs? Type the season name to confirm:', { s: s.name })) !== s.name) return;
    if (await act(() => api.deleteSeason(s.id), t('Season deleted.'))) { await loadAll(); route(); }
  }
  if (el.dataset.ban) {
    const banned = S.sm.some(m => m.user_id === el.dataset.ban && m.banned);
    if (await act(() => api.setBanned(S.sid, el.dataset.ban, !banned))) { S.sm = await api.seasonMembers(S.sid); after.admin(); }
  }
  if ('genpw' in el.dataset) el.closest('form').password.value = genPassword();
  if (el.dataset.resetpw) {
    const p = profile(el.dataset.resetpw), pw = genPassword();
    if (!confirm(t('Reset the password of {n}? The new one will be: {pw}', { n: nameOf(p), pw }))) return;
    if (await act(() => api.adminUsers({ action: 'reset_password', user_id: p.id, password: pw }))) prompt(t('New password — send it to the member:'), pw);
  }
  if (el.dataset.deluser) {
    const p = profile(el.dataset.deluser);
    if (prompt(t('Delete the account of {n}? Their pairs and tower are removed; their runs keep their name.\nType the username "{u}" to confirm:', { n: nameOf(p), u: p.username })) !== p.username) return;
    if (await act(() => api.adminUsers({ action: 'delete', user_id: p.id }), t('Deleted {n}.', { n: nameOf(p) }))) { await loadAll(); route(); }
  }
});
document.addEventListener('change', async e => {
  if (e.target.name === 'gym' && e.target.form?.id === 'season-form') prefillSeason();
  if (e.target.dataset.role) {
    if (await act(() => api.adminUsers({ action: 'set_role', user_id: e.target.dataset.role, role: e.target.value }), t('Role changed.'))) { S.profiles = await api.profiles(); route(); }
  }
});
document.addEventListener('submit', async e => {
  if (e.target.id === 'account-form') {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    f.username = f.username.trim().toLowerCase();
    if (await act(() => api.adminUsers({ action: 'create', ...f }), t('Created account {u}.', { u: f.username }))) {
      newAccount = f;
      S.profiles = await api.profiles();
      route();
    }
  }
  if (e.target.id === 'season-form') {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const g = GYMS()[+f.gym];
    let row;
    if (f.gym !== '' && g) row = seasonFromGym(g);
    else {
      const leaders = f.leaders.split('\n').map(l => l.split(',').map(x => x.trim())).filter(x => x[0])
        .map(([name, type, weak = '']) => ({ name, type, weakness: weak.split(/\s+/).filter(Boolean) }));
      if (!leaders.length) { $('#season-err').textContent = t('Enter at least one Gym Leader (or pick a gym from the datamine).'); return; }
      const circuits = GYMS().at(-1) ? seasonFromGym(GYMS().at(-1)).circuits : [{ name: 'Circuit 1', pts: 10000, kind: 'Regular Battle' }];
      row = { gym_key: null, leaders, circuits, gym_data: {} };
    }
    Object.assign(row, { name: f.name,
      battle_start: new Date(f.battle_start).toISOString(), battle_end: new Date(f.battle_end).toISOString(),
      tickets_day1: +f.tickets_day1, tickets_daily: +f.tickets_daily, ticket_cap: +f.ticket_cap, gym_ticket_cap: +f.gym_ticket_cap,
      target_score: f.target_score ? +f.target_score : null, created_by: S.me,
      strategy: S.seasons.find(x => (x.strategy || '').trim())?.strategy || '' });   // start from the latest written rules
    const created = await act(() => api.createSeason(row), t('Created season {s}.', { s: f.name }));
    if (!created) return;
    if (f.is_active) await act(() => api.setActiveSeason(created.id));
    await loadAll();
    S.sid = created.id;
    await loadSeason();
    route();
  }
});

// ─── Boot ───────────────────────────────────────────────────
(async () => {
  applyAppearance();
  companion = mountCompanion($('#companion'), { getTips: mascotTips, t });
  showMascot();
  renderHeader('');
  try {
    await Promise.all([loadCatalog(), loadGyms(), loadPairMap()]);
    await loadTags();
    api = await createApi();
    S.me = await api.session();
    if (S.me) await loadAll();
  } catch (e) {
    view.innerHTML = `<div class="empty card"><h2>${t('Could not load')}</h2><p class="muted">${esc(e.message)}</p></div>`;
    return;
  }
  route();
  if (S.me) setTimeout(greet, 800);
})();
