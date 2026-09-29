/* ═══════════════════════════════════════════════════════════════
   PMEX Gym Manager — UI (vanilla JS, hash router)
   Pages: sign-in · overview · log · plan · members · member/<id>/<tab> · account · admin
   ═══════════════════════════════════════════════════════════════ */
import { createApi, isDemo } from './api.js';
import { ico } from './icons.js';
import { STYLES, ACCENTS, MODES, getAppearance, applyAppearance } from './appearance.js';
import { mountMascot } from './mascot.js';
import { t, getLang, setLang, LANGS, locale } from './i18n.js';
import { TOWER_TOP, circuitAt, roundShort, seasonState, pointsIn, validateRun, readiness, pairWeight, levelLabel, suggestTeam } from './rules.js';
import { loadCatalog, loadGyms, PAIRS, pairById, pairName, pairImage, TYPES, TYPE_COLORS, typeIcon, roleIcon, roleKey,
  PLACEHOLDER, catalogRows, catalogVersion, GYMS, seasonFromGym, leaderRule, leaderFocus, leaderImage, POMA, DEX } from './catalog.js';

// ─── Helpers ────────────────────────────────────────────────
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = n => (n ?? 0).toLocaleString('en-US');
const fmtK = n => n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n);
const fmtDT = iso => iso ? new Date(iso).toLocaleString(locale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtD = iso => iso ? new Date(iso).toLocaleDateString(locale(), { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
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
const S = { me: null, profiles: [], mp: [], tower: [], seasons: [], sid: null, runs: [], sm: [], asg: [], notes: [], cores: [], settings: [] };
const meP = () => S.profiles.find(p => p.id === S.me);
const isStaff = () => ['admin', 'mod'].includes(meP()?.role);
const isAdmin = () => meP()?.role === 'admin';
const profile = id => S.profiles.find(p => p.id === id);
const nameOf = p => (p ? p.display_name || p.username : '');
const season = () => S.seasons.find(s => s.id === S.sid);
const owned = uid => S.mp.filter(x => x.user_id === uid);
const ownedPair = (uid, pid) => S.mp.find(x => x.user_id === uid && x.pair_id === pid);
const towerFloor = (uid, type) => S.tower.find(x => x.user_id === uid && x.type === type)?.floor || 0;
const canEdit = uid => uid === S.me || isStaff();
const leaderImg = (s, name, cls = '') => img(leaderImage(s, name), `spr ${cls}`, name);
const leaderOf = (s, name) => s?.leaders.find(l => l.name === name) || { name, weakness: [] };

// A member's picture: the pair they chose, else their strongest pair
function avatarPair(uid) {
  const p = profile(uid), mine = owned(uid);
  return (p?.avatar && mine.find(x => x.pair_id === p.avatar)) || [...mine].sort((a, b) => pairWeight(b) - pairWeight(a))[0];
}
function av(uid, size = '') {
  const x = avatarPair(uid), pair = x && pairById(x.pair_id);
  return `<span class="av ${size}">${pair ? img(pairImage(pair, x.ex, x.stars), '', '') : esc((nameOf(profile(uid)) || '?')[0].toUpperCase())}</span>`;
}

async function loadAll() {
  [S.profiles, S.mp, S.tower, S.seasons, S.cores, S.settings] = await Promise.all([api.profiles(), api.memberPairs(), api.tower(), api.seasons(), api.typeCores(), api.settings()]);
  let saved = null;
  try { saved = +localStorage.getItem('gym-season'); } catch { /* private mode */ }
  S.sid = (S.seasons.find(s => s.id === saved) || S.seasons.find(s => s.is_active) || S.seasons[0])?.id ?? null;
  await loadSeason();
}
async function loadSeason() {
  if (!S.sid) { S.runs = S.sm = S.asg = S.notes = []; return; }
  [S.runs, S.sm, S.asg, S.notes] = await Promise.all([api.runs(S.sid), api.seasonMembers(S.sid), api.assignments(S.sid), api.notes(S.sid)]);
}
const state = () => (season() ? seasonState(season(), S.runs, S.sm) : null);

// ─── Chrome (header) ────────────────────────────────────────
const NAV = [['', 'Overview', 'home'], ['log', 'Log a run', 'swords'], ['plan', 'Plan', 'plan'], ['roster', 'Roster', 'roster'],
  ['members', 'Members', 'users'], ['admin', 'Admin', 'shield']];
function renderHeader(active) {
  $('#nav').innerHTML = S.me ? NAV.filter(([k]) => k !== 'admin' || isStaff())
    .map(([k, label, icon]) => `<a href="#/${k}" class="${k === active ? 'on' : ''}">${ico(icon)}<span>${t(label)}</span></a>`).join('') : '';
  $('#userbox').innerHTML = S.me ? `<a href="#/member/${S.me}" class="user">${av(S.me)}<span>${esc(nameOf(meP()))}</span> ${rankTag(meP().role)}</a>` : '';
  $('#settings-link').innerHTML = ico('gear');
  $('#settings-link').classList.toggle('on', active === 'settings');
  $('#settings-link').title = t('Settings');
  $('#demo-flag').hidden = !isDemo;
  $('#demo-flag').textContent = t('Demo');
  $('#dex-link').href = DEX;
}
const langSelect = () => `<select id="lang" class="lang" aria-label="${t('Language')}">${LANGS.map(([k, l]) => `<option value="${k}" ${k === getLang() ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
document.addEventListener('change', e => {
  if (e.target.id !== 'lang') return;
  setLang(e.target.value);
  route();
});

// ─── Router ─────────────────────────────────────────────────
const view = $('#view');
const routes = { '': renderOverview, log: renderLog, plan: renderPlan, roster: renderRoster, members: renderMembers, member: renderMember,
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
      <div class="login-top"><h2>${t('Sign in')}</h2>${langSelect()}</div>
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
  for (const p of S.profiles) if (!st.perMember[p.id]) board.push({ key: p.id, user_id: p.id, name: nameOf(p), score: 0, tickets: 0, runs: 0 });
  const left = S.profiles.filter(p => !st.banned.has(p.id)).map(p => ({ p, left: st.granted - (st.perMember[p.id]?.tickets || 0) }))
    .filter(x => x.left > 0).sort((a, b) => b.left - a.left);
  const phase = { upcoming: t('Starts soon'), battle: t('In progress'), ended: t('Finished') }[st.phase];
  const pct = s.target_score ? Math.min(100, st.combined / s.target_score * 100) : null;
  const now = Date.now();
  const side = st.phase === 'battle' ? [t('Ends in'), fmtLeft(Date.parse(s.battle_end) - now)]
    : st.phase === 'upcoming' ? [t('Starts in'), fmtLeft(Date.parse(s.battle_start) - now)] : [t('Final score'), fmtK(st.combined)];
  const mine = S.asg.filter(a => a.user_id === S.me);

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

  ${mine.length ? `<section class="section">
    <h2>${t('Your battles')} <small>${t('planned by your admin and mods')}</small></h2>
    <div class="mine">${mine.map(a => {
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
          const banned = st.banned.has(m.user_id), gone = !m.user_id || !profile(m.user_id);
          return `<tr class="${banned ? 'dim' : ''}"><td class="rank r${i + 1}">${i + 1}</td>
            <td>${gone ? `<span class="muted">${esc(m.name)} (${t('left the gym')})</span>` : `<a class="who" href="#/member/${m.user_id}">${av(m.user_id, 'xs')}${esc(m.name)}</a>`}${banned ? ` <span class="badge bad">${t('locked')}</span>` : ''}</td>
            <td class="num"><b>${fmtN(m.score)}</b></td><td class="num">${m.tickets}</td>
            <td class="num">${gone || banned ? '—' : Math.max(0, st.granted - m.tickets)}</td>
            <td class="num">${m.tickets ? fmtN(Math.round(m.score / m.tickets)) : '—'}</td><td class="num">${m.runs}</td></tr>`;
        }).join('')}</tbody></table></div>
    </section>
    <section>
      <h2>${t('Tickets left')} <small>${t('{n} unused', { n: left.reduce((a, x) => a + x.left, 0) })}</small></h2>
      <div class="card chips">${left.length ? left.map(x => `<a class="pill" href="#/log//${st.active || ''}/${x.p.id}">${esc(nameOf(x.p))} <b>${x.left}</b></a>`).join('') : `<p class="muted">${t('Everyone has used the tickets handed out so far.')}</p>`}</div>
      <h2>${t('Recent runs')}</h2>
      <div class="card list">${S.runs.slice(0, 8).map(runLine).join('') || `<p class="muted">${t('No runs yet.')}</p>`}</div>
    </section>
  </div>`;
}
document.addEventListener('click', e => { if (e.target.closest('[data-all-rounds]')) { showAllRounds = true; route(); } });

const teamIcons = team => (team || []).map(x => {
  const p = pairById(x.pair_id);
  return `<span title="${esc(pairName(p))} ${levelLabel(x.level || 1)}${x.ex ? ' EX' : ''}">${ownIcon(p, x, 'xs')}</span>`;
}).join('');
function runLine(r) {
  const c = circuitAt(season(), r.round);
  return `<div class="run">${r.user_id && profile(r.user_id) ? av(r.user_id, 'xs') : ''}<div><b>${esc(r.member_name)}</b><small class="muted">${esc(r.leader)} · ${esc(c?.label || r.round)} · ${fmtDT(r.created_at)}</small></div>
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
function blankForm(leader = '', round = null, member = null) {
  const st = state();
  const c = circuitAt(season(), round || st.active || 1);
  const uid = member || S.me;
  return { id: null, user_id: uid, leader, round: round || st.active || 1, tickets: c?.fixed || 3, score: '', note: '', auto: true, ...autoTeam(uid, leader) };
}

function renderLog(leader = '', round = '', member = '') {
  const s = season();
  if (!s) return seasonBar() + noSeason();
  if (!form || leader || round || member) form = blankForm(leader, +round || null, member || null);
  return `${seasonBar()}
  <div class="log-layout">
    <section class="card pad" id="run-form">${runForm()}</section>
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
      <label>${t('Score')}<input name="score" type="number" min="1" step="1" inputmode="numeric" value="${esc(form.score)}" placeholder="${t('e.g. {n}', { n: 35000 })}">
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
  if (e.target.form?.id === 'run-editor' && ['score', 'note'].includes(e.target.name)) form[e.target.name] = e.target.value;
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
    form = { ...r, team: r.team.map(x => ({ ...x })), score: String(r.score), orig: r, auto: false, planned: false };
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
    score: Number(form.score), team: form.team, note: form.note || '' };
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
      <td class="muted nowrap">${fmtDT(r.created_at)}</td><td>${esc(r.member_name)}</td><td>${esc(r.leader)}</td>
      <td class="nowrap">${esc(roundShort(circuitAt(season(), r.round)?.label || r.round))}</td><td class="num">${r.tickets}</td>
      <td class="num"><b>${fmtN(r.score)}</b></td><td class="team">${teamIcons(r.team)}${r.note ? ` <span class="muted" title="${esc(r.note)}">${ico('note')}</span>` : ''}</td>
      <td class="acts">${canEdit(r.user_id) ? `<button class="btn sm ghost" data-run-edit="${r.id}">${t('Edit')}</button><button class="btn sm ghost" data-run-del="${r.id}" aria-label="${t('Delete')}">${ico('x')}</button>` : ''}</td></tr>`).join('')}
    </tbody></table>`;
}
document.addEventListener('change', e => {
  const k = e.target.dataset.lf;
  if (!k) return;
  logFilter[k] = e.target.value;
  $('#log-table').innerHTML = logTable();
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

function renderPlan() {
  const s = season();
  if (!s) return seasonBar() + noSeason();
  const st = state();
  const types = [...new Set(s.leaders.flatMap(l => l.weakness || []))];
  const members = S.profiles.filter(p => !st.banned.has(p.id));
  const stages = Math.max(3, Math.min(s.gym_data?.stages?.length || 3, 6));
  const scoreMax = Math.max(1, ...members.flatMap(p => types.map(ty => readiness(owned(p.id), towerFloor(p.id, ty), ty, pairById).score)));

  return `${seasonBar()}
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
function renderMembers() {
  if (memberView === 'types') memberView = 'list';
  const rows = memberRows();
  const heat = (v, max, ty) => `<td class="heat" style="--h:${Math.min(1, v / max).toFixed(2)};--tc:${TYPE_COLORS[ty]}"><b>${v || '·'}</b></td>`;

  return `<div class="toolbar"><h1>${t('Members')} <small>${t('{n} people', { n: S.profiles.length })}</small></h1>
    <div class="seg">${[['list', 'Cards'], ['tower', 'Tower by type']].map(([k, l]) => `<button class="${memberView === k ? 'on' : ''}" data-mview="${k}">${t(l)}</button>`).join('')}</div></div>
  ${memberView === 'list' ? `<div class="mgrid">${rows.map(r => `
    <article class="card mcard ${r.banned ? 'dim' : ''}">
      <div class="mtop">${av(r.p.id)}<div><a class="mname" href="#/member/${r.p.id}">${esc(nameOf(r.p))}</a>
        <small class="muted">@${esc(r.p.username)}</small> ${rankTag(r.p.role)}${r.banned ? ` <span class="badge bad">${t('locked')}</span>` : ''}</div></div>
      <div class="mstats"><div><b>${r.pairs}</b>${t('pairs')}</div><div><b>${r.ex}</b>EX</div><div><b>${r.tower}</b>${t('floors')}</div><div><b>${fmtK(r.season?.score || 0)}</b>${t('score')}</div></div>
      <div class="mtypes">${r.byType.slice(0, 6).map(([ty, n]) => `<span style="--tc:${TYPE_COLORS[ty]}" title="${t(ty)}">${img(typeIcon(ty), 'ti', ty)}${n}</span>`).join('')}</div>
      ${isStaff() ? `<div class="mlinks"><a class="btn sm" href="#/member/${r.p.id}/pairs">${t('Roster')}</a><a class="btn sm" href="#/member/${r.p.id}/tower">${t('Tower')}</a><a class="btn sm" href="#/member/${r.p.id}/plan">${t('Battle plan')}</a></div>` : ''}
    </article>`).join('')}</div>`
  : `<div class="card scroll"><table class="table heatmap">
    <thead><tr><th>${t('Member')}</th>${TYPES.map(ty => `<th title="${t(ty)}">${img(typeIcon(ty), 'ti', ty)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr><td><a class="who" href="#/member/${r.p.id}">${av(r.p.id, 'xs')}${esc(nameOf(r.p))}</a></td>${TYPES.map(ty => heat(towerFloor(r.p.id, ty), TOWER_TOP, ty)).join('')}</tr>`).join('')}</tbody></table></div>`}`;
}
document.addEventListener('click', e => { const b = e.target.closest('[data-mview]'); if (b) { memberView = b.dataset.mview; route(); } });

// ─── Roster by type ───
// The columns are gym-wide and staff can change them (gym_settings 'roster_columns'). Kinds:
//   role  – the member's strongest pair of a role (on-type by default), e.g. Special / Physical / Support
//   pair  – one fixed sync pair shown for every type (e.g. Anni Gloria, Red 1996 — broken everywhere)
//   core  – the type's core pairs, pinned per type by staff (else the ones most of the gym owns)
//   rest  – the member's other pairs of the type · tower – their tower floor for the type
let rosterType = null, coreEdit = false, colEdit = false, rosterSort = 'fit';
const ROLE_OPTS = [['Strike (Special)', 'Special striker'], ['Strike (Physical)', 'Physical striker'], ['Strike', 'Any striker'],
  ['Tech', 'Tech'], ['Support', 'Support'], ['Field', 'Field'], ['Sprint', 'Sprint'], ['Multi', 'Multi']];
const COL_KINDS = [['role', 'Best of a role'], ['pair', 'Fixed sync pair'], ['core', 'Type core pairs'], ['rest', 'Other pairs'], ['tower', 'Tower floor']];
const roleMatch = (p, role) => (role === 'Strike' ? /^Strike/.test(p.role) : p.role === role);
function defaultColumns() {
  const find = (name, re) => PAIRS().find(p => p.trainerName === name && re.test(p.alt))?.id;
  return [
    { kind: 'role', role: 'Strike (Special)', label: 'Special', onType: true },
    { kind: 'role', role: 'Strike (Physical)', label: 'Physical', onType: true },
    { kind: 'core', label: 'EX WT' },
    { kind: 'pair', pair: find('Gloria', /Anniversary/), label: 'Anni Gloria' },
    { kind: 'pair', pair: find('Red', /1996/), label: 'Red' },
    { kind: 'role', role: 'Support', label: 'On-type support', onType: true },
    { kind: 'rest', label: 'Others' },
    { kind: 'tower', label: 'Tower' },
  ].filter(c => c.kind !== 'pair' || c.pair);
}
const rosterCols = () => S.settings.find(x => x.key === 'roster_columns')?.value || defaultColumns();
function autoCores(ty) {
  const n = new Map();
  for (const x of S.mp) { const p = pairById(x.pair_id); if (p?.type === ty && !/Strike/.test(p.role)) n.set(p.id, (n.get(p.id) || 0) + 1); }
  return [...n].filter(([, c]) => c >= Math.max(2, S.profiles.length / 3)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);
}
const pinnedCores = ty => S.cores.find(c => c.type === ty)?.pairs || [];
const coresFor = ty => (pinnedCores(ty).length ? pinnedCores(ty) : autoCores(ty));
function defaultRosterType() {
  const s = season();
  return s?.leaders.flatMap(l => l.weakness || [])[0] || 'Normal';
}

function renderRoster() {
  return `<div class="toolbar"><h1>${t('Roster by type')}</h1><p class="muted" style="margin:0">${t('Who can carry Special or Physical, and who owns the core pairs of each type.')}</p></div>${typeRoster(memberRows())}`;
}
const rosterCell = x => x
  ? `<div class="tc" title="${esc(pairName(x.pair))} · ${esc(x.pair.role)} · ${levelLabel(x.level)}${x.ex ? ' · 6★ EX' : ''}${x.ex_role ? ' · EX Role' : ''}">${ownIcon(x.pair, x, 'sm')}<small>${levelLabel(x.level)}${x.ex_role ? ' <b>EXR</b>' : ''}</small></div>`
  : `<span class="nope" aria-label="${t('none')}">${ico('x')}</span>`;

function typeRoster(rows) {
  const ty = rosterType || defaultRosterType();
  const cols = rosterCols(), cores = coresFor(ty), pinned = pinnedCores(ty).length > 0;
  const hasCore = cols.some(c => c.kind === 'core');
  const data = rows.map(r => {
    const all = owned(r.p.id).map(x => ({ ...x, pair: pairById(x.pair_id) })).filter(x => x.pair).sort((a, b) => pairWeight(b) - pairWeight(a));
    const mine = all.filter(x => x.pair.type === ty);
    const used = new Set([...cols.filter(c => c.kind === 'pair').map(c => c.pair), ...(hasCore ? cores : [])]);
    const cells = cols.map(c => {
      if (c.kind === 'pair') return all.find(x => x.pair_id === c.pair);
      if (c.kind === 'core') return cores.map(id => all.find(x => x.pair_id === id));
      if (c.kind !== 'role') return null;
      const x = (c.onType === false ? all : mine).find(y => !used.has(y.pair_id) && roleMatch(y.pair, c.role));
      if (x) used.add(x.pair_id);
      return x;
    });
    return { r, mine, cells, rest: mine.filter(x => !used.has(x.pair_id)), fit: readiness(owned(r.p.id), towerFloor(r.p.id, ty), ty, pairById).score };
  }).sort(rosterSort === 'name' ? (a, b) => nameOf(a.r.p).localeCompare(nameOf(b.r.p)) : (a, b) => b.fit - a.fit);
  const typePairs = PAIRS().filter(p => p.type === ty).sort((a, b) => a.trainer.localeCompare(b.trainer));

  const head = cols.map(c => {
    const label = esc(t(c.label || ''));
    if (c.kind === 'pair') { const p = pairById(c.pair); return `<th class="core fixed" title="${esc(pairName(p))}">${p ? pairIcon(p, 'xs') : ''}<span>${label}</span></th>`; }
    if (c.kind === 'core') return cores.length ? cores.map(id => { const p = pairById(id); return `<th class="core" title="${esc(pairName(p))}"><em>${label}</em>${pairIcon(p, 'xs')}<span>${esc(p?.trainer || id)}</span></th>`; }).join('') : `<th class="core"><em>${label}</em></th>`;
    return `<th class="${c.kind === 'tower' ? 'num' : ''}">${label}</th>`;
  }).join('');
  const body = d => cols.map((c, i) => {
    const v = d.cells[i];
    if (c.kind === 'core') return cores.length ? v.map(x => `<td>${rosterCell(x)}</td>`).join('') : '<td class="muted">—</td>';
    if (c.kind === 'rest') return `<td class="rest">${d.rest.slice(0, 4).map(rosterCell).join('')}${d.rest.length > 4 ? `<span class="more">+${d.rest.length - 4}</span>` : ''}</td>`;
    if (c.kind === 'tower') return `<td class="num">${towerFloor(d.r.p.id, ty)}<small class="muted">F</small></td>`;
    return `<td>${rosterCell(v)}</td>`;
  }).join('');

  return `<div class="pf">
    <div class="tchips">${TYPES.map(x => `<button class="tchip ${x === ty ? 'on' : ''}" data-rtype="${x}" style="--tc:${TYPE_COLORS[x]}" title="${t(x)}">${img(typeIcon(x), 'ti', x)}${esc(t(x))}</button>`).join('')}</div>
    <div class="pf-row">
      ${hasCore ? `<span class="muted">${pinned ? t('Core pairs pinned by the admin / mods.') : t('Core pairs: the {t} supports and techs most of the gym owns.', { t: esc(t(ty)) })}</span>` : ''}
      ${isStaff() ? `${hasCore ? `<button class="btn sm ${coreEdit ? 'primary' : ''}" data-core-edit>${ico('star')} ${coreEdit ? t('Done') : t('Choose core pairs')}</button>` : ''}
        <button class="btn sm ${colEdit ? 'primary' : ''}" data-col-edit>${ico('gear')} ${colEdit ? t('Done') : t('Customize columns')}</button>` : ''}
      <div class="seg sm" style="margin-left:auto">${[['fit', 'Best fit first'], ['name', 'Name A–Z']].map(([k, l]) => `<button class="${rosterSort === k ? 'on' : ''}" data-rsort="${k}">${t(l)}</button>`).join('')}</div>
    </div>
    ${colEdit && isStaff() ? columnEditor(cols) : ''}
    ${coreEdit && isStaff() && hasCore ? `<div class="card pad core-pick">
      <p class="hint">${t('Pick up to 6 {t} pairs that matter for this type — they get their own column.', { t: esc(t(ty)) })}
        ${pinned ? `<button class="reset" data-core-auto>${t('Back to automatic')}</button>` : ''}</p>
      <div class="roster">${typePairs.map(p => {
        const i = pinnedCores(ty).indexOf(p.id);
        return `<button type="button" class="rp ${i >= 0 ? 'on' : ''}" data-core="${p.id}" ${i >= 0 ? `data-n="${i + 1}"` : ''} title="${esc(pairName(p))} · ${esc(p.role)}">${pairIcon(p, 'sm')}<small>${esc(p.trainer.split(' ')[0])}</small></button>`;
      }).join('')}</div></div>` : ''}
  </div>
  <div class="card scroll"><table class="table troster" style="--tc:${TYPE_COLORS[ty]}">
    <thead><tr><th>#</th><th>${t('Member')}</th>${head}</tr></thead>
    <tbody>${data.map((d, i) => `<tr class="${d.r.banned ? 'dim' : ''}">
      <td class="rank">${i + 1}</td>
      <td><a class="who" href="#/member/${d.r.p.id}/pairs">${av(d.r.p.id, 'xs')}${esc(nameOf(d.r.p))}</a><small class="muted count">${t('{n} pairs', { n: d.mine.length })}</small></td>
      ${body(d)}</tr>`).join('')}</tbody></table></div>`;
}

// Staff: add / remove / reorder / rename columns
function columnEditor(cols) {
  return `<div class="card pad col-edit">
    <p class="hint">${t('Columns are shared by the whole gym. Fixed pairs show for every type; role columns pick each member’s strongest pair of that role.')}</p>
    <div class="col-list">${cols.map((c, i) => `<div class="col-row">
      <span class="col-n">${i + 1}</span>
      <input class="col-label" data-col-label="${i}" value="${esc(c.label || '')}" aria-label="${t('Column name')}">
      <select data-col-kind="${i}">${COL_KINDS.map(([k, l]) => `<option value="${k}" ${c.kind === k ? 'selected' : ''}>${t(l)}</option>`).join('')}</select>
      ${c.kind === 'role' ? `<select data-col-role="${i}">${ROLE_OPTS.map(([k, l]) => `<option value="${k}" ${c.role === k ? 'selected' : ''}>${t(l)}</option>`).join('')}</select>
        <label class="chk"><input type="checkbox" data-col-ontype="${i}" ${c.onType !== false ? 'checked' : ''}> ${t('same type only')}</label>` : ''}
      ${c.kind === 'pair' ? `<span class="col-pair">${c.pair ? `${pairIcon(pairById(c.pair), 'xs')}${esc(pairName(pairById(c.pair)))}` : `<span class="muted">${t('No pair yet')}</span>`}</span>
        <div class="search-box"><input data-col-pairq="${i}" placeholder="${t('Change pair…')}" autocomplete="off"><div class="results" id="col-results-${i}"></div></div>` : ''}
      ${c.kind === 'core' ? `<span class="muted small">${t('Pinned per type with “Choose core pairs”.')}</span>` : ''}
      <span class="col-acts">
        <button class="x" data-col-move="${i}|-1" ${i === 0 ? 'disabled' : ''} aria-label="${t('Move left')}">${ico('left')}</button>
        <button class="x" data-col-move="${i}|1" ${i === cols.length - 1 ? 'disabled' : ''} aria-label="${t('Move right')}">${ico('right')}</button>
        <button class="x" data-col-del="${i}" aria-label="${t('Remove')}">${ico('x')}</button></span>
    </div>`).join('')}</div>
    <div class="row"><button class="btn sm" data-col-add>${ico('plus')} ${t('Add column')}</button>
      <button class="btn sm ghost" data-col-reset>${t('Reset to default')}</button></div>
  </div>`;
}
async function saveCols(cols) {
  if (await act(() => api.saveSetting('roster_columns', cols, S.me))) { S.settings = await api.settings(); route(); }
}
const KIND_DEFAULTS = {
  role: { role: 'Support', label: 'Support', onType: true }, pair: { pair: null, label: 'Pair' },
  core: { label: 'Core' }, rest: { label: 'Others' }, tower: { label: 'Tower' },
};

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-rtype],[data-rsort],[data-core-edit],[data-core],[data-core-auto],[data-col-edit],[data-col-add],[data-col-reset],[data-col-move],[data-col-del],[data-col-pick]');
  if (!el) return;
  const d = el.dataset, ty = rosterType || defaultRosterType();
  const cols = structuredClone(rosterCols());
  if (d.rtype) { rosterType = d.rtype; route(); }
  if (d.rsort) { rosterSort = d.rsort; route(); }
  if ('coreEdit' in d) { coreEdit = !coreEdit; route(); }
  if ('colEdit' in d) { colEdit = !colEdit; route(); }
  if ('colAdd' in d) saveCols([...cols, { kind: 'role', role: 'Tech', label: 'Tech', onType: true }]);
  if ('colReset' in d) saveCols(defaultColumns());
  if (d.colMove) {
    const [i, dir] = d.colMove.split('|').map(Number);
    [cols[i], cols[i + dir]] = [cols[i + dir], cols[i]];
    saveCols(cols);
  }
  if (d.colDel) { cols.splice(+d.colDel, 1); saveCols(cols); }
  if (d.colPick) {
    const [i, pid] = d.colPick.split('|');
    const was = cols[+i], p = pairById(pid);
    cols[+i] = { ...was, pair: pid, label: !was.pair && (!was.label || was.label === 'Pair') ? p.trainer.replace(/\s*\(.*\)/, '') : was.label };
    saveCols(cols);
  }
  const saveCores = async pairs => {
    if (await act(() => api.saveTypeCores({ type: ty, pairs, updated_by: S.me }))) { S.cores = await api.typeCores(); route(); }
  };
  if (d.core) {
    const cur = pinnedCores(ty);
    if (!cur.includes(d.core) && cur.length >= 6) return toast(t('Pick at most 6 core pairs.'), true);
    saveCores(cur.includes(d.core) ? cur.filter(x => x !== d.core) : [...cur, d.core]);
  }
  if ('coreAuto' in d) saveCores([]);
});
document.addEventListener('change', e => {
  const d = e.target.dataset;
  if (!('colLabel' in d || 'colKind' in d || 'colRole' in d || 'colOntype' in d)) return;
  const cols = structuredClone(rosterCols());
  if ('colLabel' in d) cols[+d.colLabel].label = e.target.value.trim();
  if ('colKind' in d) { const i = +d.colKind; cols[i] = { kind: e.target.value, ...KIND_DEFAULTS[e.target.value] }; }
  if ('colRole' in d) {
    const c = cols[+d.colRole], old = ROLE_OPTS.find(r => r[0] === c.role);
    const auto = !c.label || c.label === c.role || (old && [old[1], 'Special', 'Physical', 'Support', 'On-type support'].includes(c.label));
    c.role = e.target.value;
    if (auto) c.label = ROLE_OPTS.find(r => r[0] === c.role)[1];
  }
  if ('colOntype' in d) cols[+d.colOntype].onType = e.target.checked;
  saveCols(cols);
});
document.addEventListener('input', e => {
  const i = e.target.dataset.colPairq;
  if (i == null) return;
  const q = e.target.value.trim().toLowerCase();
  $(`#col-results-${i}`).innerHTML = q.length < 2 ? '' : PAIRS().filter(p => `${p.trainer} ${p.pokemon}`.toLowerCase().includes(q)).slice(0, 10)
    .map(p => `<button type="button" data-col-pick="${i}|${p.id}">${pairIcon(p, 'xs')}<span>${esc(pairName(p))}</span>${typeTag(p.type)}</button>`).join('')
    || `<p class="muted">${t('No sync pair found.')}</p>`;
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
    <label>${t('Profile picture')}<select name="avatar"><option value="">${t('Strongest sync pair (automatic)')}</option>${[...mine].sort((a, b) => pairWeight(b) - pairWeight(a)).map(x => `<option value="${x.pair_id}" ${x.pair_id === p.avatar ? 'selected' : ''}>${esc(pairName(pairById(x.pair_id)))}</option>`).join('')}</select></label>
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
    <div class="search-box"><input id="own-search" placeholder="${t('Type a trainer or Pokémon name…')}" autocomplete="off"><div class="results" id="own-results"></div></div></div>` : ''}
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
      ${p.exRole ? `<button class="tog ${x.ex_role ? 'on' : ''}" data-own="${p.id}" data-k="ex_role" ${edit && x.ex ? '' : 'disabled'} title="EX Role: ${esc(p.exRole)}${x.ex ? '' : ` — ${t('needs 6★ EX')}`}">${img(roleIcon(p.exRole, true), 'ri')}</button>` : ''}
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

function towerTab(id, edit) {
  const total = TYPES.reduce((a, ty) => a + towerFloor(id, ty), 0);
  return `<p class="lead">${t('Pasio Tower has one 40-floor tower per type, and only pairs of that type can climb it — the higher the floor, the more experience with that type. Total: {n} of {max} floors.', { n: total, max: TYPES.length * TOWER_TOP })}</p>
  <div class="tower-grid">${TYPES.map(ty => {
    const f = towerFloor(id, ty);
    return `<div class="card tw ${f >= TOWER_TOP ? 'top' : ''}" style="--tc:${TYPE_COLORS[ty]}">
      <div class="tw-head">${typeTag(ty)}<b>${f}<small> / ${TOWER_TOP}</small></b></div>
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
    if (await act(() => api.deleteMemberPair(uid, d.ownDel))) { [S.mp, S.asg] = await Promise.all([api.memberPairs(), S.sid ? api.assignments(S.sid) : []]); redrawTab(); }
  }
  if (d.ownStar) {
    const pid = el.closest('[data-pair]').dataset.pair, cur = ownedPair(uid, pid), p = pairById(pid);
    const n = +d.ownStar, now = cur.stars || p.rarity;
    const stars = n === now ? Math.max(p.rarity, n - 1) : n;   // click the top star again to step back
    saveOwned(uid, pid, stars < 5 ? { stars, ex: false, ex_role: false } : { stars });
  }
  if (el.classList.contains('tog')) {
    const cur = ownedPair(uid, d.own), on = !cur[d.k];
    saveOwned(uid, d.own, d.k === 'ex' && !on ? { ex: false, ex_role: false } : { [d.k]: on });
  }
});
document.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset.own && el.dataset.k === 'level') saveOwned(memberId(), el.dataset.own, { level: +el.value });
  if ('psort' in el.dataset) { pairFilter.sort = el.value; redrawTab(); }
  if (el.dataset.tower) {
    if (await act(() => api.upsertTower({ user_id: memberId(), type: el.dataset.tower, floor: +el.value }), t('{type} tower: floor {n}', { type: t(el.dataset.tower), n: el.value }))) {
      S.tower = await api.tower(); redrawTab();
    }
  }
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.tower) {   // live number while dragging; saved on change
    const tile = el.closest('.tw');
    tile.querySelector('.tw-head b').innerHTML = `${el.value}<small> / ${TOWER_TOP}</small>`;
    tile.querySelector('.meter i').style.width = `${el.value / TOWER_TOP * 100}%`;
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
  const el = e.target.closest('[data-set-style],[data-set-mode],[data-set-accent]');
  if (!el) return;
  const d = el.dataset;
  applyAppearance(d.setStyle ? { style: d.setStyle } : d.setMode ? { mode: d.setMode } : { accent: d.setAccent });
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
    <div class="grid4"><label>${t('Tickets on day 1')}<input name="tickets_day1" type="number" value="9" min="0"></label>
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
      target_score: f.target_score ? +f.target_score : null, created_by: S.me });
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
  mountMascot($('#mascot'));
  renderHeader('');
  try {
    await Promise.all([loadCatalog(), loadGyms()]);
    api = await createApi();
    S.me = await api.session();
    if (S.me) await loadAll();
  } catch (e) {
    view.innerHTML = `<div class="empty card"><h2>${t('Could not load')}</h2><p class="muted">${esc(e.message)}</p></div>`;
    return;
  }
  route();
})();
