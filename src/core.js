/* ═══════════════════════════════════════════════════════════════
   Shared by every page: formatting, small UI pieces, the app state `S`, the api handle and who-may-do-what.
   Pages talk back to the router through `hooks` (set once in main.js).
   ═══════════════════════════════════════════════════════════════*/
import { t, locale } from './i18n.js';
import { seasonState } from './rules.js';
import { browserTz, validTz } from './time.js';
import { trainerArt } from './art.js';
import { pairById, pairName, pairImage, TYPE_COLORS, typeIcon, roleIcon, roleKey, PLACEHOLDER, leaderImage } from './catalog.js';

export const hooks = { route: () => {}, seasonBar: () => '', noSeason: () => '' };

// ─── Helpers ────────────────────────────────────────────────
export const $ = (s, el = document) => el.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtN = n => (n ?? 0).toLocaleString('en-US');
export const fmtK = n => n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n);
// Times are shown in the viewer's chosen zone (profile), else the device's
export const viewTz = () => { const z = S.profiles.find(p => p.id === S.me)?.timezone; return validTz(z) ? z : browserTz(); };
export const fmtDT = iso => iso ? new Date(iso).toLocaleString(locale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: viewTz() }) : '—';
export const fmtD = iso => iso ? new Date(iso).toLocaleDateString(locale(), { day: '2-digit', month: 'short', year: 'numeric', timeZone: viewTz() }) : '—';
export const fmtLeft = ms => {
  const m = Math.max(0, Math.round(ms / 6e4)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m % 60}m`;
};
export const img = (src, cls = '', alt = '') => `<img src="${esc(src || PLACEHOLDER)}" class="${cls}" alt="${esc(alt)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${PLACEHOLDER}'">`;
export const pairIcon = (p, size = 'md', ex = false, stars = null) => img(pairImage(p, ex, stars), `pi ${size}`, pairName(p));
export const ownIcon = (p, mp, size = 'md') => pairIcon(p, size, mp?.ex, mp?.stars);   // as this member has it (stars / EX)
export const typeTag = t0 => t0 ? `<span class="type" style="--tc:${TYPE_COLORS[t0] || '#888'}">${img(typeIcon(t0))}${esc(t(t0))}</span>` : '';
export const roleTag = (r, ex = false) => r ? `<span class="role ${ex ? 'ex' : ''}">${img(roleIcon(r, ex), 'ri')}${ex ? 'EX ' : ''}${esc(roleKey(r).replace(/^./, c => c.toUpperCase()))}</span>` : '';
export const rankName = r => ({ admin: t('Admin'), mod: t('Mod'), member: t('Member') }[r] || r);
export const rankTag = (r, always = false) => r !== 'member' || always ? `<span class="badge role-${r}">${rankName(r)}</span>` : '';
export const debounce = (fn, ms = 400) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };
export const tc = type => TYPE_COLORS[type] || '#7a86a8';

// Notices: small cards that rise from the bottom, a tick or a warning sign, a bar that runs down while they wait.
// Up to three stack; the same message again refreshes the one shown. Hovering keeps one open; × closes it.
const TOAST_ICONS = {
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 12.5l4 4 8-9"/></svg>',
  bad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 7v6.5"/><path d="M12 17.2h.01" stroke-width="3.2"/></svg>',
};
function dropToast(el) {
  clearTimeout(el._h);
  el.classList.remove('show'); el.classList.add('out');
  setTimeout(() => el.remove(), 220);
}
export function toast(msg, bad = false) {
  const box = $('#toast');
  if (!box) return;
  box.className = 'toast-stack';
  const ms = bad ? 6000 : 3200, kind = bad ? 'bad' : 'ok';
  const arm = (el, wait) => { clearTimeout(el._h); el._h = setTimeout(() => dropToast(el), wait); };
  const same = [...box.children].find(x => x.dataset.msg === msg && x.dataset.kind === kind && !x.classList.contains('out'));
  if (same) { same.classList.remove('bump'); void same.offsetWidth; same.classList.add('bump'); arm(same, ms); return; }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.dataset.msg = msg; el.dataset.kind = kind;
  el.style.setProperty('--ms', `${ms}ms`);
  el.innerHTML = `<span class="toast-ic">${TOAST_ICONS[kind]}</span><span class="toast-msg"></span>
    <button type="button" class="toast-x" aria-label="${esc(t('Close'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg></button><i class="toast-bar"></i>`;
  el.querySelector('.toast-msg').textContent = msg;
  el.querySelector('.toast-x').addEventListener('click', () => dropToast(el));
  el.addEventListener('mouseenter', () => { clearTimeout(el._h); el.classList.add('held'); });
  el.addEventListener('mouseleave', () => { el.classList.remove('held'); arm(el, 1600); });
  box.append(el);
  while (box.querySelectorAll('.toast:not(.out)').length > 3) dropToast(box.querySelector('.toast:not(.out)'));
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  arm(el, ms);
}
export async function act(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r ?? true; } catch (e) { toast(e.message, true); return false; }
}

// ─── State ──────────────────────────────────────────────────
export let api;
export const setApi = a => { api = a; };
export const S = { me: null, profiles: [], mp: [], tower: [], seasons: [], sid: null, runs: [], sm: [], asg: [], notes: [], fac: [], res: [], resources: [], lodge: null, gemSheet: null, clears: null, events: null, syncStatus: null, builds: [], reviews: [], gems: { settings: { reset_timezone: 'UTC', reset_hour: 0 }, events: [], rewards: [] }, strats: { strategies: [], revisions: [] }, sheet: [], chatUnread: 0 };
export const meP = () => S.profiles.find(p => p.id === S.me);
export let lockCtx = false;
export const setLock = v => { lockCtx = v; };   // set while drawing a frozen page: staff controls disappear for everyone but the admin
export const isStaff = () => !lockCtx && ['admin', 'mod'].includes(meP()?.role);
export const isAdmin = () => meP()?.role === 'admin';
export const profile = id => S.profiles.find(p => p.id === id);
export const nameOf = p => (p ? p.display_name || p.username : '');
export const season = () => S.seasons.find(s => s.id === S.sid);
export const owned = uid => S.mp.filter(x => x.user_id === uid);
export const ownedPair = (uid, pid) => S.mp.find(x => x.user_id === uid && x.pair_id === pid);
export const towerFloor = (uid, type) => S.tower.find(x => x.user_id === uid && x.type === type)?.floor || 0;
// A Gym Battle that is over is frozen: only the admin can still change its log and plans (the database enforces it too)
export const frozen = () => { const s = season(); return !!s && Date.parse(s.battle_end) <= Date.now() && !isAdmin(); };
export const canEdit = uid => !lockCtx && (uid === S.me || isStaff());
export const leaderImg = (s, name, cls = '') => img(leaderImage(s, name), `spr ${cls}`, name);
export const leaderOf = (s, name) => s?.leaders.find(l => l.name === name) || { name, weakness: [] };

// A member's favorite sync pair, which they pick on their profile (it must be in their roster): their picture
// when they have no photo, and the art and colour of their profile's cover. None picked: their initials.
export function avatarPair(uid) {
  const p = profile(uid);
  return (p?.avatar && owned(uid).find(x => x.pair_id === p.avatar)) || null;
}
// Initials sit on one of ten colours, picked from the member's id (FNV-1a, so near ids still spread)
const INITIAL_COLORS = ['#e5484d', '#f76b15', '#c99a0a', '#30a46c', '#12a594', '#0090ff', '#3e63dd', '#8e4ec6', '#d6409f', '#5b6475'];
const colorOf = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return INITIAL_COLORS[(h >>> 0) % INITIAL_COLORS.length]; };
export function av(uid, size = '') {
  const url = profile(uid)?.avatar_url;
  if (url) return `<span class="av ${size}"><img class="upl" src="${esc(url)}" alt=""></span>`;
  const x = avatarPair(uid), pair = x && pairById(x.pair_id);
  if (pair) {
    // The trainer's face, cut from their 2D art (the same picture as the profile cover, so it is loaded once), on the
    // colour of the pair's type; if the art cannot be loaded, the pair's icon
    const art = trainerArt(pair, !!x.ex), icon = pairImage(pair, x.ex, x.stars);
    if (!art) return `<span class="av ${size}">${img(icon, '', '')}</span>`;
    return `<span class="av ${size} face" style="--tc:${tc(pair.type)}"><img class="face" src="${esc(art)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"
      onerror="this.onerror=null;this.className='';this.parentNode.classList.remove('face');this.src='${esc(icon)}'"></span>`;
  }
  return `<span class="av ${size} ini" style="--ab:${colorOf(uid)}"><b>${esc([...(nameOf(profile(uid)) || '?')][0].toUpperCase())}</b></span>`;
}

export async function loadAll() {
  [S.profiles, S.mp, S.tower, S.seasons, S.sheet, S.resources, S.strats, S.builds, S.gems, S.reviews] = await Promise.all([api.profiles(), api.memberPairs(), api.tower(), api.seasons(), api.sheet(), api.resources().catch(() => []), api.strategies().catch(() => ({ strategies: [], revisions: [] })), api.gridBuilds().catch(() => []), api.gems().catch(() => S.gems), api.runReviews().catch(() => [])]);
  let saved = null;
  try { saved = +localStorage.getItem('gym-season'); } catch { /* private mode */ }
  S.sid = (S.seasons.find(s => s.id === saved) || S.seasons.find(s => s.is_active) || S.seasons[0])?.id ?? null;
  await loadSeason();
}
export async function loadSeason() {
  if (!S.sid) { S.runs = S.sm = S.asg = S.notes = S.fac = S.res = []; return; }
  [S.runs, S.sm, S.asg, S.notes, S.fac, S.res] = await Promise.all([api.runs(S.sid), api.seasonMembers(S.sid), api.assignments(S.sid), api.notes(S.sid), api.facilitators(S.sid), api.results(S.sid)]);
}
export const state = () => (season() ? seasonState(season(), S.runs, S.sm) : null);

