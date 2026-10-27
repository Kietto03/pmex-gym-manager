/* ═══════════════════════════════════════════════════════════════
   Shared by every page: formatting, small UI pieces, the app state `S`, the api handle and who-may-do-what.
   Pages talk back to the router through `hooks` (set once in main.js).
   ═══════════════════════════════════════════════════════════════*/
import { t, locale } from './i18n.js';
import { seasonState, pairWeight } from './rules.js';
import { browserTz, validTz } from './time.js';
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
export const img = (src, cls = '', alt = '') => `<img src="${esc(src || PLACEHOLDER)}" class="${cls}" alt="${esc(alt)}" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER}'">`;
export const pairIcon = (p, size = 'md', ex = false, stars = null) => img(pairImage(p, ex, stars), `pi ${size}`, pairName(p));
export const ownIcon = (p, mp, size = 'md') => pairIcon(p, size, mp?.ex, mp?.stars);   // as this member has it (stars / EX)
export const typeTag = t0 => t0 ? `<span class="type" style="--tc:${TYPE_COLORS[t0] || '#888'}">${img(typeIcon(t0))}${esc(t(t0))}</span>` : '';
export const roleTag = (r, ex = false) => r ? `<span class="role ${ex ? 'ex' : ''}">${img(roleIcon(r, ex), 'ri')}${ex ? 'EX ' : ''}${esc(roleKey(r).replace(/^./, c => c.toUpperCase()))}</span>` : '';
export const rankName = r => ({ admin: t('Admin'), mod: t('Mod'), member: t('Member') }[r] || r);
export const rankTag = (r, always = false) => r !== 'member' || always ? `<span class="badge role-${r}">${rankName(r)}</span>` : '';
export const debounce = (fn, ms = 400) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };
export const tc = type => TYPE_COLORS[type] || '#7a86a8';

export function toast(msg, bad = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast show ${bad ? 'bad' : ''}`;
  clearTimeout(toast.h);
  toast.h = setTimeout(() => el.classList.remove('show'), bad ? 5000 : 2500);
}
export async function act(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r ?? true; } catch (e) { toast(e.message, true); return false; }
}

// ─── State ──────────────────────────────────────────────────
export let api;
export const setApi = a => { api = a; };
export const S = { me: null, profiles: [], mp: [], tower: [], seasons: [], sid: null, runs: [], sm: [], asg: [], notes: [], fac: [], res: [], resources: [], lodge: null, gemSheet: null, clears: null, events: null, syncStatus: null, builds: [], reviews: [], gems: { settings: { reset_timezone: 'UTC', reset_hour: 0 }, events: [], rewards: [] }, strats: { strategies: [], revisions: [] }, sheet: [] };
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

// A member's picture: the pair they chose, else their strongest pair
export function avatarPair(uid) {
  const p = profile(uid), mine = owned(uid);
  return (p?.avatar && mine.find(x => x.pair_id === p.avatar)) || [...mine].sort((a, b) => pairWeight(b) - pairWeight(a))[0];
}
export function av(uid, size = '') {
  const url = profile(uid)?.avatar_url;
  if (url) return `<span class="av ${size}"><img class="upl" src="${esc(url)}" alt=""></span>`;
  const x = avatarPair(uid), pair = x && pairById(x.pair_id);
  return `<span class="av ${size}">${pair ? img(pairImage(pair, x.ex, x.stars), '', '') : esc((nameOf(profile(uid)) || '?')[0].toUpperCase())}</span>`;
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

