// Page module: the chat. Loaded on demand by main.js (the rest of the app never waits for it, and a failure here
// stays here). startChat() runs once after signing in: it loads the conversation list and opens the live connection,
// so the unread count in the menu is right on every page.
import { $, esc, act, api, S, isStaff, profile, nameOf, av, viewTz, toast, hooks, leaderImg, tc, typeTag, img } from '../core.js';
import { typeIcon, TYPES } from '../catalog.js';
import { ico } from '../icons.js';
import { t, locale, getLang, LANGS } from '../i18n.js';
import { ask, showSheet } from '../dialog.js';
import { layout, receipt, mergeMessage, reactionSummary, applyReaction, linkify, fitBox, editable, unreadTotal, dayKey, seenBy, readers, systemText,
  REACTIONS, MAX_LEN, PAGE, MAX_FILE, EVERYONE, mentionQuery, mentionMatches, markMentions, callsMe } from '../chat.js';

// ─── State ───
const C = {
  started: false, convs: [], members: [], threads: {}, online: new Set(), typing: {}, live: 'connecting',
  open: null, reply: null, edit: null, drafts: {}, urls: {}, q: '', picking: false, rt: null, sel: null, dropped: false, panel: null,
  mode: 'chat', bsid: null,   // which tab (the chat, or the Gym Battle channels) and which battle's channels are listed
  gymHome: '#/',              // where "back to the gym" goes: the overview in the gym app, or the gym app's page from chat.html
  at: null,                   // the @mention suggestions open under the caret: { start, list, i }
};
let tmp = 0, lastTypingSent = 0, readTimer = null;
const gymName = () => (window.GYM_CONFIG || {}).gymName || t('Gym room');
const conv = cid => C.convs.find(c => c.id === cid);
const thread = cid => (C.threads[cid] ||= { msgs: [], reactions: [], more: true, loaded: false, loading: false });
const msgById = (cid, id) => thread(cid).msgs.find(m => m.id === id);
const onChat = () => /^#\/(chat|battle)(\/|$)/.test(location.hash);
const isBattle = c => c?.kind === 'battle';
const href = c => `#/${isBattle(c) ? 'battle' : 'chat'}/${c.id}`;
const home = () => `#/${C.mode}`;
const seasonOf = c => S.seasons.find(x => x.id === c?.season_id);
const leaderOfStage = c => seasonOf(c)?.leaders?.[c.stage - 1] || null;
const tr = e => t(e?.message || String(e));   // server messages are English keys
// A member's nickname in one conversation (set by anyone in a direct conversation or a group), else their name
const nickOf = (cid, uid) => C.members.find(m => m.conversation_id === cid && m.user_id === uid)?.nickname || '';
const nameIn = (cid, uid, fallback = '') => nickOf(cid, uid) || nameOf(profile(uid)) || fallback || t('Former member');
// Muted conversations (kept on this device) do not count in the unread badges and do not pop up
const MUTE = new Set((() => { try { return JSON.parse(localStorage.getItem('gym-chat-muted') || '[]'); } catch { return []; } })());
const saveMute = () => { try { localStorage.setItem('gym-chat-muted', JSON.stringify([...MUTE])); } catch { /* private mode */ } };
const loud = list => list.filter(c => !MUTE.has(c.id));
const canCustom = c => ['direct', 'group'].includes(c?.kind) || isStaff();
// @mentions: who may call @everyone here (the database decides the same way, chat_can_mention_all), whether a message
// calls me, and the members as they are written in this conversation
const canAll = c => c?.kind === 'group' || (!!c && c.kind !== 'direct' && isStaff());
const myUsername = () => profile(S.me)?.username || '';
const callsMeMsg = m => callsMe(m, S.me, myUsername());
const memberOf = (cid, username) => { const p = S.profiles.find(x => x.username === username); return p && C.members.some(m => m.conversation_id === cid && m.user_id === p.id) ? p : null; };
const whoIn = cid => n => { const p = memberOf(cid, n); return p ? { id: p.id, label: esc(nameIn(cid, p.id)), me: p.id === S.me } : null; };
// "@dan" → "@Dan" in a one-line preview (plain text)
const plainMentions = (cid, body) => String(body || '').replace(/(^|[^A-Za-z0-9_.@-])@([A-Za-z0-9_.-]{2,40})/g, (all, pre, n) => { const p = memberOf(cid, n.toLowerCase().replace(/[.-]+$/, '')); return p ? `${pre}@${nameIn(cid, p.id)}` : all; });
// Mentions reach me even in a muted conversation
const callsCount = list => list.reduce((n, c) => n + (MUTE.has(c.id) ? c.mentioned || 0 : 0), 0);
const quickEmoji = c => c?.emoji || '👍';
const QUICK = ['👍', '❤️', '😂', '🔥', '⚡', '🎉', '😮', '😢', '🙏', '👀', '💯', '✨', '🏆', '⚔️', '🛡️', '🥚'];

export const isStarted = () => C.started;
export const setGymHome = (url, standalone = false) => { C.gymHome = url; C.standalone = standalone; };
// Installing chat.html as an app of its own: the browser's offer is kept and shown as a button in the app bar
let installOffer = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installOffer = e; const b = document.querySelector('[data-capp-install]'); if (b) b.hidden = false; });
addEventListener('appinstalled', () => { installOffer = null; document.querySelector('[data-capp-install]')?.setAttribute('hidden', ''); });
export async function startChat() {
  if (C.started || !S.me) return;
  try { await refreshList(); } catch (e) { C.live = 'off'; console.warn('chat unavailable:', e); return; }
  C.started = true;
  // Without the live connection the chat still works; it just does not update by itself
  try { C.rt = await api.chatConnect(S.me, { event: onEvent, presence: onPresence, typing: onTyping, status: onStatus }); }
  catch (e) { C.live = 'off'; console.warn('chat: no live connection', e); }
}
export function stopChat() {
  C.rt?.close();
  Object.assign(C, { started: false, convs: [], members: [], threads: {}, online: new Set(), typing: {}, open: null, reply: null, edit: null, drafts: {}, urls: {}, rt: null, live: 'connecting' });
  badge();
}
async function refreshList() {
  [C.convs, C.members] = await Promise.all([api.chatOverview(), api.chatMembers()]);
  badge();
}

// ─── Unread count in the menu and the tab title ───
function badge() {
  const n = unreadTotal(loud(C.convs)) + callsCount(C.convs);
  S.chatUnread = n;
  const part = list => unreadTotal(loud(list)) + callsCount(list);
  S.chatUnreadBy = { chat: part(C.convs.filter(c => !isBattle(c))), battle: part(C.convs.filter(isBattle)) };
  for (const [k, v] of Object.entries(S.chatUnreadBy)) {   // the Chat / Gym Battle tabs under the menu
    for (const a of document.querySelectorAll(`.capp-tabs a[data-capp-tab="${k}"]`)) {
      let b = a.querySelector('.nb');
      if (v && !b) { b = document.createElement('b'); b.className = 'nb'; a.append(b); }
      if (b) { if (v) b.textContent = v > 99 ? '99+' : v; else b.remove(); }
    }
  }
  document.getElementById('chat-link')?.classList.toggle('has-new', !!n);
  for (const link of document.querySelectorAll('#nav [data-grp="members"], #subnav a[href="#/chat"], #chat-link')) {
    let b = link.querySelector('.nb');
    if (n && !b) { b = document.createElement('b'); b.className = 'nb'; link.append(b); }
    if (b) { if (n) b.textContent = n > 99 ? '99+' : n; else b.remove(); }
  }
  document.title = `${n ? `(${n > 99 ? '99+' : n}) ` : ''}${document.title.replace(/^\(\d+\+?\) /, '')}`;
}
// Leaving the chat page: stop listening for "typing…" in the conversation that was open
export function leaveChat() { C.open = null; C.sel = null; C.rt?.watch(null); }

// ─── Live events ───
function onStatus(status) {
  if (C.live === 'on' && status !== 'SUBSCRIBED') C.dropped = true;
  C.live = status === 'SUBSCRIBED' ? 'on' : status === 'CLOSED' ? 'off' : 'connecting';
  // Back after a drop: fetch what was missed meanwhile
  if (C.live === 'on' && C.dropped) {
    C.dropped = false;
    refreshList().then(() => { if (C.open) return loadThread(C.open, { fresh: true }); }).then(() => { paintList(); paintThread(); }).catch(() => {});
  }
  paintLive();
}
function onPresence(ids) { C.online = S.online = new Set(ids); paintList(); paintHead(); document.dispatchEvent(new Event('gym:presence')); }   // S.online: the profile pages show it too
function onTyping(cid, user) {
  if (user === S.me) return;
  (C.typing[cid] ||= {})[user] = Date.now() + 4000;
  paintHead(); paintList(); paintTyping();
  setTimeout(() => { paintHead(); paintList(); paintTyping(); }, 4100);
}
async function onEvent(ev, p) {
  const cid = p.conversation_id;
  // Added to a group, removed from one, renamed…: the list is fetched again; an open group I am no longer in closes
  if (ev === 'conversation') {
    await refreshList().catch(() => {});
    if (C.open === cid && !conv(cid) && onChat()) { toast(t('You are no longer in that group.')); location.hash = '#/chat'; return; }
    paintList(); paintHead();
    if (C.open === cid) { if (C.panel) paintPanel(); else paintThread(); }   // a new theme, emoji or nickname
    return;
  }
  // A conversation someone just opened with me: the fresh list already counts this message as unread
  const fresh = !conv(cid);
  if (fresh) { await refreshList().catch(() => {}); paintList(); if (ev !== 'message') return; }
  const c = conv(cid);
  if (!c) return;
  if (ev === 'message' || ev === 'message_update') {
    const th = C.threads[cid];
    if (th?.loaded) th.msgs = mergeMessage(th.msgs, p);
    if (ev === 'message') {
      if (C.typing[cid]) { delete C.typing[cid][p.sender_id]; if (C.open === cid) paintTyping(); }   // their message is here: no more dots
      c.last_message_at = p.created_at;
      c.last = snippetRow(p);
      const seen = C.open === cid && onChat() && document.visibilityState === 'visible';
      if (p.sender_id !== S.me && !seen && !p.system) {
        const called = callsMeMsg(p);
        if (!fresh) { c.unread = (c.unread || 0) + 1; if (called) c.mentioned = (c.mentioned || 0) + 1; }
        const who = nickOf(cid, p.sender_id) || p.sender_name || t('Former member'), what = p.attachment && !p.body ? t('Picture') : plainMentions(cid, p.body).slice(0, 80);
        // a mention pops up wherever it is, even in a muted conversation or a Gym Battle channel
        if (C.open === cid && onChat()) { /* already in front of me */ }
        else if (called) toast(`@ ${t('{n} mentioned you in {c}', { n: who, c: convTitle(c) })}: ${what}`);
        else if (!isBattle(c) && !MUTE.has(cid)) toast(`${c.kind === 'group' ? `${c.title} · ` : ''}${who}: ${what}`);
      }
      if (seen && p.sender_id !== S.me) markRead(cid);
      C.convs.sort((a, b) => Date.parse(b.last_message_at || b.created_at) - Date.parse(a.last_message_at || a.created_at));
    } else if (c.last?.id === p.id) c.last = snippetRow(p);
    if (p.attachment) await signUrls([p]);
  } else if (ev === 'reaction') {
    const th = C.threads[cid];
    if (th?.loaded) th.reactions = applyReaction(th.reactions, p);
    if (p.emoji && C.open === cid) popRx(p.message_id);
  } else if (ev === 'read') {
    const m = C.members.find(x => x.conversation_id === cid && x.user_id === p.user_id);
    if (m) m.last_read_at = p.last_read_at;
    if (p.user_id === S.me) c.unread = c.mentioned = 0;   // read on another device
  }
  badge();
  paintList();
  if (C.open === cid) paintThread();
}
const snippetRow = m => ({ id: m.id, sender_id: m.sender_id, sender_name: m.sender_name, body: (m.body || '').slice(0, 140), picture: !!m.attachment, deleted_at: m.deleted_at, created_at: m.created_at, system: m.system || null });

// ─── Loading ───
async function loadThread(cid, { older = false, fresh = false } = {}) {
  const th = thread(cid);
  if (th.loading || (older && !th.more)) return;
  th.loading = true;
  try {
    const before = older ? th.msgs.find(m => !m.pending)?.id : null;
    // Past the live messages come the archived ones: compressed batches, read-only, one batch per step back
    if (older && th.liveDone) {
      const batch = await api.chatArchived(cid, before ?? null);
      for (const m of batch) {
        for (const [user_id, emoji] of m.reactions || []) th.reactions.push({ message_id: m.id, user_id, emoji });
        delete m.reactions;
        th.msgs = mergeMessage(th.msgs, m);
      }
      th.archMore = batch.length > 0;
      th.more = th.archMore;
      await signUrls(batch);
      return;
    }
    const page = await api.chatMessages(cid, before, PAGE);
    const rx = await api.chatReactions(page.map(m => m.id));
    if (fresh || !th.loaded) { th.msgs = [...page, ...th.msgs.filter(m => m.pending)]; th.reactions = rx; }
    else { for (const m of page) th.msgs = mergeMessage(th.msgs, m); th.reactions = [...th.reactions.filter(r => !page.some(m => m.id === r.message_id)), ...rx]; }
    th.liveDone = page.length < PAGE;
    if (!th.loaded || fresh) th.archMore = (conv(cid)?.archived || 0) > 0;
    th.more = !th.liveDone || th.archMore;
    th.loaded = true;
    await signUrls(page);
  } finally { th.loading = false; }
}
async function signUrls(msgs) {
  const paths = [...new Set(msgs.map(m => m.attachment?.path).filter(p => p && !(C.urls[p]?.exp > Date.now())))];
  if (!paths.length) return;
  try {
    const got = await api.chatMediaUrls(paths);
    for (const [p, url] of Object.entries(got)) C.urls[p] = { url, exp: Date.now() + 50 * 6e4 };
  } catch { /* the picture shows as a placeholder; the next load tries again */ }
}
function markRead(cid) {
  clearTimeout(readTimer);
  readTimer = setTimeout(async () => {
    const c = conv(cid);
    if (!c) return;
    c.unread = c.mentioned = 0;
    badge(); paintList();
    const m = C.members.find(x => x.conversation_id === cid && x.user_id === S.me);
    if (m) m.last_read_at = new Date().toISOString();
    try { await api.chatRead(cid, S.me); } catch { /* the next read mark catches up */ }
  }, 400);
}

// ─── Formatting ───
const fmt = (iso, opts) => new Date(iso).toLocaleString(locale(), { timeZone: viewTz(), ...opts });
const clock = iso => fmt(iso, { hour: '2-digit', minute: '2-digit' });
function whenShort(iso) {
  if (!iso) return '';
  const tz = viewTz(), d = dayKey(iso, tz), today = dayKey(new Date().toISOString(), tz);
  if (d === today) return clock(iso);
  if (Date.now() - Date.parse(iso) < 6 * 864e5) return fmt(iso, { weekday: 'short' });
  return fmt(iso, { day: '2-digit', month: 'short' });
}
function dayLabel(iso) {
  const tz = viewTz(), d = dayKey(iso, tz);
  if (d === dayKey(new Date().toISOString(), tz)) return t('Today');
  if (d === dayKey(new Date(Date.now() - 864e5).toISOString(), tz)) return t('Yesterday');
  return fmt(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
const convTitle = c => (isBattle(c) ? (c.stage ? t('Stage {n}: {l}', { n: c.stage, l: c.title || '?' }) : t('General planning')) : c.kind === 'gym' ? gymName() : c.kind === 'group' ? c.title || t('Group') : nickOf(c.id, c.other_id) || nameOf(profile(c.other_id)) || t('Former member'));
// A group's picture: its initials on a colour taken from its name
const hue = s => [...String(s)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
const initials = s => (String(s).trim().split(/\s+/).slice(0, 2).map(w => [...w][0] || '').join('') || '#').toUpperCase();
const convAvatar = (c, size = '') => (isBattle(c) ? battleAvatar(c, size) : c.kind === 'gym' ? `<span class="av chat-gym ${size}">${ico('users')}</span>`
  : c.kind === 'group' ? `<span class="av chat-grp ${size}" style="--gh:${hue(c.id)}">${esc(initials(c.title || ''))}</span>`
  : c.other_id && profile(c.other_id) ? av(c.other_id, size) : `<span class="av ${size}">?</span>`);
// A battle channel's picture: the leader of the stage on the colour of their type, the stage number in the corner;
// the general channel shows crossed swords
function battleAvatar(c, size = '') {
  if (!c.stage) return `<span class="av chat-bgen ${size}">${ico('swords')}</span>`;
  const s = seasonOf(c), l = leaderOfStage(c);
  return `<span class="av chat-stage ${size}" style="--tc:${tc(l?.type)}">${s && c.title ? leaderImg(s, c.title) : `<b>${c.stage}</b>`}<i>${c.stage}</i></span>`;
}
// What the stage's leader is weak to, in brackets after the channel's name: "(🌿 Grass)"
function weakHtml(c) {
  const w = isBattle(c) && c.stage ? leaderOfStage(c)?.weakness || [] : [];
  return w.length ? `<span class="ch-weak" title="${esc(t('Weak to {t}', { t: w.map(x => t(x)).join(', ') }))}">(${w.map(x => `${img(typeIcon(x), 'ti', x)}${esc(t(x))}`).join(', ')})</span>` : '';
}
// ─── Translation, like on social networks ───
// A message in another language than the reader's is shown translated (the service detects the language), with the
// original one tap away. Auto-translate can be switched off (kept per device); then "Translate" in the message menu
// translates one message. Translations are fetched in batches for the open conversation and kept for the visit.
// The chat's settings are kept per device: auto-translate (and into which language), a per-conversation override, and
// whether Enter sends on a keyboard
const pref = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch { /* private mode */ } };
const TR = { auto: pref('gym-chat-autotr', 'on') !== 'off', to: pref('gym-chat-trlang', ''),
  conv: (() => { try { return JSON.parse(pref('gym-chat-trconv', '{}')) || {}; } catch { return {}; } })(),
  enter: pref('gym-chat-enter', 'on') !== 'off',
  done: {}, failed: new Set(), orig: new Set(), manual: new Set(), busy: false, timer: null };
const trLang = () => (LANGS.some(([k]) => k === TR.to) ? TR.to : getLang());
const autoIn = cid => (TR.conv[cid] ? TR.conv[cid] === 'on' : TR.auto);   // this conversation's choice, else the general one
const trKey = m => `${trLang()}|${m.id}|${m.edited_at || ''}`;
const trOf = m => TR.done[trKey(m)];
const trCan = m => !!m && m.sender_id !== S.me && !m.system && !m.deleted_at && !m.pending && !m.archived && /\p{L}/u.test(m.body || '');
const trWanted = m => autoIn(C.open) || TR.manual.has(m.id);
const trShown = m => { const r = trOf(m); return !!r?.text && !TR.orig.has(m.id) && trWanted(m); };
const langName = code => {
  let n = code;
  try { n = new Intl.DisplayNames([locale()], { type: 'language' }).of(code) || code; } catch { /* old browser */ }
  return getLang() === 'vi' ? n.charAt(0).toLocaleLowerCase('vi') + n.slice(1) : n;   // "đã dịch từ tiếng Anh"
};
function scheduleTr() { clearTimeout(TR.timer); TR.timer = setTimeout(runTr, 120); }
async function runTr() {
  const cid = C.open, th = cid && C.threads[cid];
  if (!th?.loaded || TR.busy || !onChat()) return;
  const msgs = th.msgs.filter(m => trCan(m) && !(trKey(m) in TR.done) && !TR.failed.has(trKey(m)) && (autoIn(cid) || TR.manual.has(m.id))).slice(-50);
  if (!msgs.length) return;
  TR.busy = true;
  let changed = false;
  try {
    const res = await api.chatTranslate(msgs.map(m => m.id), trLang());
    for (const m of msgs) { TR.done[trKey(m)] = res[m.id] || { from: '', text: null }; if (res[m.id]?.text) changed = true; }
  } catch (e) {
    for (const m of msgs) TR.failed.add(trKey(m));   // not again during this visit
    if (msgs.some(m => TR.manual.has(m.id))) toast(tr(e), true);
  }
  TR.busy = false;
  if (changed && C.open === cid) paintThread();
  scheduleTr();   // messages that arrived meanwhile
}
const firstName = n => (n || '').split(/\s+/)[0];
const jumbo = b => b.length <= 24 && !/[\p{L}\p{N}#*]/u.test(b) && /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F|\u200D|\s){1,24}$/u.test(b) && [...b.matchAll(/\p{Extended_Pictographic}/gu)].length <= 3;
const isAdminOf = c => c?.kind === 'group' && c.created_by === S.me;
const sysLine = sys => systemText(sys, id => nameOf(profile(id)), S.me, t);
const dots = '<i class="dots" aria-hidden="true"><b></b><b></b><b></b></i>';
const typers = cid => { const now = Date.now(); return Object.entries(C.typing[cid] || {}).filter(([, until]) => until > now).map(([u]) => u); };
function typingLine(cid) {
  const who = typers(cid).map(u => nameOf(profile(u)) || '?');
  if (!who.length) return '';
  return who.length === 1 ? (conv(cid)?.kind === 'direct' ? t('typing…') : t('{n} is typing…', { n: firstName(who[0]) })) : t('{n} people are typing…', { n: who.length });
}
function lastLine(c) {
  const l = c.last;
  if (!l) return `<span class="muted">${t('No messages yet')}</span>`;
  if (l.system) return `<i>${esc(sysLine(l.system))}</i>`;
  const who = l.sender_id === S.me ? `${t('You')}: ` : c.kind !== 'direct' ? `${esc(firstName(nickOf(c.id, l.sender_id) || l.sender_name))}: ` : '';
  if (l.deleted_at) return `${who}<i>${t('This message was deleted')}</i>`;
  return `${who}${l.picture ? `${ico('image')} ${l.body ? '' : t('Picture')}` : ''}${esc(plainMentions(c.id, l.body))}`;
}
const ticks = r => !r ? '' : r.state === 'pending' ? `<span class="ticks pending" title="${t('Sending…')}">…</span>`
  : `<span class="ticks ${r.state}" title="${r.of > 1 ? t('Read by {a} of {b}', { a: r.readers, b: r.of }) : r.state === 'read' ? t('Read') : t('Sent')}">${ico('check')}${r.state === 'read' ? ico('check') : ''}</span>`;

// ─── Drawing ───
export const renderBattle = cid => renderChat(cid, 'battle');
export function renderChat(cid, mode = 'chat') {
  C.mode = mode;
  if (!C.started) return `<div class="empty card"><h1>${t('Chat')}</h1><p class="muted">${C.live === 'off' ? t('The chat could not be reached. Try again later.') : t('Loading…')}</p></div>`;
  if (cid && !conv(cid)) return `<div class="empty card"><h1>${t('Conversation not found')}</h1><p><a class="btn primary" href="${home()}">${t('Back to the chat')}</a></p></div>`;
  C.open = cid || null;
  C.at = null;
  // A panel takes the place of the conversation: "new group" (no conversation open) or "group info" (for the open group)
  if (C.panel && (C.panel.kind === 'new' ? cid : C.panel.cid !== (cid || null))) C.panel = null;
  if (mode === 'battle') { if (C.panel?.kind === 'new') C.panel = null; C.picking = false; if (cid) C.bsid = conv(cid).season_id; }
  const main = C.panel?.kind === 'new' ? newGroupPanel() : C.panel?.kind === 'info' ? infoPanel(cid) : C.panel?.kind === 'settings' ? settingsPanel()
    : cid ? threadShell(cid) : mode === 'battle' ? battleEmpty() : `<div class="chat-empty">${ico('chat')}<p>${t('Pick a conversation, or start one with the + button.')}</p></div>`;
  if (mode === 'battle') return `<div class="chat battle ${cid || C.panel ? 'has-thread' : ''}" id="chat">
    <aside class="chat-side">${appBar()}${battleSideHead()}
      <div class="chat-live" id="chat-live">${liveHtml()}</div>
      <nav class="chat-list" id="chat-list" aria-label="${t('Gym Battle channels')}">${listHtml()}</nav>
    </aside>
    <section class="chat-main" id="chat-main" ${themeAttr(cid)}>${main}</section>
  </div>`;
  return `<div class="chat ${cid || C.panel ? 'has-thread' : ''}" id="chat">
    <aside class="chat-side">${appBar()}
      <div class="chat-side-head">
        <div class="chat-search"><span>${ico('search')}</span><input id="chat-q" placeholder="${t('Search members…')}" value="${esc(C.q)}" autocomplete="off" enterkeyhint="search"></div>
        <button class="icon-btn" data-chat-new aria-label="${t('New conversation')}" title="${t('New conversation')}">${ico(C.picking ? 'x' : 'plus')}</button></div>
      <div class="chat-live" id="chat-live">${liveHtml()}</div>
      <nav class="chat-list" id="chat-list" aria-label="${t('Conversations')}">${listHtml()}</nav>
    </aside>
    <section class="chat-main" id="chat-main" ${themeAttr(cid)}>${main}</section>
  </div>`;
}
// A conversation's theme is one of the 18 types: my bubbles, the send button and a tint take its colour
const themeAttr = cid => { const th = cid && conv(cid)?.theme; return th ? `data-theme-type="${esc(th)}" style="--ct:${tc(th)}"` : ''; };
function applyTheme() {
  const el = $('#chat-main'), th = C.open && conv(C.open)?.theme;
  if (!el) return;
  if (th) { el.dataset.themeType = th; el.style.setProperty('--ct', tc(th)); } else { delete el.dataset.themeType; el.style.removeProperty('--ct'); }
}
// The chat is an app of its own: a bar with the way back to the gym and the two tabs, Chat and Gym Battle
function appBar() {
  const n = S.chatUnreadBy || {};
  const tab = (k, label, icon) => `<a href="#/${k}" class="${C.mode === k ? 'on' : ''}" data-capp-tab="${k}" ${C.mode === k ? 'aria-current="page"' : ''}>${ico(icon)}<span>${t(label)}</span>${n[k] ? `<b class="nb">${n[k] > 99 ? '99+' : n[k]}</b>` : ''}</a>`;
  return `<div class="capp-bar"><a class="icon-btn capp-home" href="${esc(C.gymHome)}" title="${t('Back to the gym')}" aria-label="${t('Back to the gym')}">${ico('house')}</a>
    <nav class="capp-tabs" aria-label="${t('Chat')}">${tab('chat', 'Chat', 'chat')}${tab('battle', 'Gym Battle', 'swords')}</nav>
    ${C.standalone ? `<button type="button" class="icon-btn" data-capp-install ${installOffer ? '' : 'hidden'} title="${t('Install the chat as an app')}" aria-label="${t('Install the chat as an app')}">${ico('download')}</button>`
      : ''}
    <button type="button" class="icon-btn capp-set ${C.panel?.kind === 'settings' ? 'on' : ''}" data-chat-settings title="${t('Chat settings')}" aria-label="${t('Chat settings')}">${ico('sliders')}</button></div>`;
}
const liveHtml = () => (C.live === 'on' ? '' : `<span class="badge ${C.live === 'off' ? 'bad' : ''}">${C.live === 'off' ? t('Offline: messages will appear when the connection is back') : t('Connecting…')}</span>`);
function listHtml() {
  if (C.mode === 'battle') return battleListHtml();
  const q = C.q.trim().toLowerCase();
  if (C.picking || q) {   // pick someone to talk to
    const people = S.profiles.filter(p => p.id !== S.me && (!q || `${p.display_name} ${p.username}`.toLowerCase().includes(q)));
    const rooms = q ? [] : C.convs.filter(c => c.kind === 'gym');
    const newGroup = q ? '' : `<button class="chat-item chat-action" data-chat-newgroup><span class="av chat-grp" style="--gh:200">${ico('plus')}</span><span class="ci-main"><b>${t('New group')}</b><small class="muted">${t('Chat with several members at once')}</small></span></button>`;
    return `${newGroup}${rooms.map(convItem).join('')}${people.length ? `<p class="chat-list-h">${t('Members')}</p>` : ''}${people.map(p => {
      const c = C.convs.find(x => x.kind === 'direct' && x.other_id === p.id);
      return `<button class="chat-item" data-chat-with="${p.id}">${av(p.id)}${C.online.has(p.id) ? '<i class="dot-on"></i>' : ''}
        <span class="ci-main"><b>${esc(nameOf(p))}</b><small class="muted">${c ? t('Open the conversation') : t('Start a conversation')}</small></span></button>`;
    }).join('') || `<p class="muted pad">${t('Nobody matches.')}</p>`}`;
  }
  return C.convs.filter(c => !isBattle(c)).map(convItem).join('') || `<p class="muted pad">${t('No conversations yet.')}</p>`;
}
// ─── Gym Battle channels ───
// Battles that have channels, newest first; the one listed is the battle of the open channel, else the one picked,
// else the battle the app is showing, else the active one
function battleSeasons() {
  const ids = new Set(C.convs.filter(isBattle).map(c => c.season_id));
  return [...ids].map(id => S.seasons.find(s => s.id === id) || { id, name: t('Gym Battle'), battle_start: '' })
    .sort((a, b) => String(b.battle_start).localeCompare(String(a.battle_start)) || b.id - a.id);
}
function currentBattle() {
  const list = battleSeasons();
  const pick = [C.bsid, S.sid, list.find(s => s.is_active)?.id].find(id => list.some(s => s.id === id));
  C.bsid = pick ?? list[0]?.id ?? null;
  return list.find(s => s.id === C.bsid) || null;
}
function battleSideHead() {
  const list = battleSeasons(), s = currentBattle();
  const live = s && s.battle_start && Date.now() >= Date.parse(s.battle_start) && Date.now() < Date.parse(s.battle_end);
  return `${list.length > 1 ? `<label class="chat-season">${ico('flag')}<select id="chat-season" aria-label="${t('Gym Battle')}">${list.map(x => `<option value="${x.id}" ${x.id === C.bsid ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>`
      : s ? `<p class="chat-season one">${ico('flag')}<span>${esc(s.name)}</span></p>` : ''}
    ${live ? `<p class="chat-season-live"><i class="dot-live"></i>${t('Battle on now')}</p>` : ''}`;
}
function battleListHtml() {
  const s = currentBattle();
  if (!s) return `<p class="muted pad">${t('The channels of a Gym Battle appear here as soon as the battle is created.')}</p>`;
  const chans = C.convs.filter(c => isBattle(c) && c.season_id === s.id).sort((a, b) => a.stage - b.stage);
  const gen = chans.filter(c => !c.stage), stages = chans.filter(c => c.stage);
  return `${gen.map(convItem).join('')}${stages.length ? `<p class="chat-list-h">${t('Stages')}</p>` : ''}${stages.map(convItem).join('')}`;
}
function battleEmpty() {
  const s = currentBattle();
  if (!s) return `<div class="chat-empty">${ico('swords')}<p>${t('The channels of a Gym Battle appear here as soon as the battle is created.')}</p></div>`;
  const chans = C.convs.filter(c => isBattle(c) && c.season_id === s.id && c.stage).sort((a, b) => a.stage - b.stage);
  return `<div class="chat-empty battle-empty">${ico('swords')}<h2>${esc(s.name)}</h2><p>${t('A general channel to plan the battle, and one per stage to share how to beat its leader.')}</p>
    <div class="stage-grid">${chans.map(c => { const l = leaderOfStage(c); return `<a class="stage-card ${c.unread ? 'unread' : ''}" href="${href(c)}" style="--tc:${tc(l?.type)}">${battleAvatar(c)}<b>${esc(c.title || '?')}</b>${l?.type ? typeTag(l.type) : ''}${weakHtml(c)}${c.unread ? `<span class="nb ${c.mentioned ? 'at' : ''}">${c.mentioned ? '@ ' : ''}${c.unread}</span>` : ''}</a>`; }).join('')}</div></div>`;
}
function convItem(c) {
  const typing = typingLine(c.id);
  return `<a class="chat-item ${C.open === c.id ? 'on' : ''} ${c.unread ? 'unread' : ''}" href="${href(c)}">${convAvatar(c)}${c.kind === 'direct' && C.online.has(c.other_id) ? '<i class="dot-on"></i>' : ''}
    <span class="ci-main"><span class="ci-top"><span class="ci-name"><b>${esc(convTitle(c))}</b>${weakHtml(c)}</span><small>${whenShort(c.last?.created_at || c.last_message_at)}</small></span>
      <span class="ci-bottom"><small class="ci-last">${typing ? `<em class="typing">${dots} ${esc(typing)}</em>` : lastLine(c)}</small>${MUTE.has(c.id) ? `<span class="ci-muted" title="${t('Muted')}">${ico('belloff')}</span>` : ''}${c.mentioned ? `<b class="nb at" title="${esc(t('{n} mentions you', { n: c.mentioned }))}">@</b>` : ''}${c.unread ? `<b class="nb ${MUTE.has(c.id) && !c.mentioned ? 'quiet' : ''}">${c.unread > 99 ? '99+' : c.unread}</b>` : ''}</span></span></a>`;
}
function headHtml(cid) {
  const c = conv(cid), n = C.members.filter(m => m.conversation_id === cid).length;
  const typing = typingLine(cid);
  const sub = typing || (isBattle(c) ? [seasonOf(c)?.name, t('{n} members · {k} online', { n, k: C.members.filter(m => m.conversation_id === cid && C.online.has(m.user_id)).length })].filter(Boolean).join(' · ') : c.kind === 'direct' ? (C.online.has(c.other_id) ? t('online') : '') : t('{n} members · {k} online', { n, k: C.members.filter(m => m.conversation_id === cid && C.online.has(m.user_id)).length }));
  const info = `data-chat-info role="button" tabindex="0" title="${t('Conversation info')}"`;
  return `<a class="icon-btn chat-back" href="${home()}" aria-label="${t('Back to the chat')}">${ico('left')}</a>
    ${c.kind === 'direct' && c.other_id ? `<a class="ch-who" href="#/member/${c.other_id}" title="${t('Profile')}">` : `<span class="ch-who" ${info}>`}${convAvatar(c)}
    <span class="ch-t"><b>${esc(convTitle(c))} ${weakHtml(c)}</b><small class="${typing ? 'typing' : 'muted'}">${typing ? `${dots} ` : ''}${esc(sub)}</small></span>${c.kind === 'direct' && c.other_id ? '</a>' : '</span>'}
    <button type="button" class="icon-btn chat-info-btn" data-chat-info aria-label="${t('Conversation info and settings')}" title="${t('Conversation info and settings')}">${ico('info')}</button>`;
}
function threadShell(cid) {
  return `<header class="chat-head" id="chat-head">${headHtml(cid)}</header>
    <div class="chat-scroll" id="chat-scroll"><div id="chat-msgs" class="chat-msgs ${conv(cid).kind === 'direct' ? 'chat-direct' : ''}">${threadHtml(cid)}</div>
      <div id="chat-typing" class="chat-typing" aria-live="polite">${typingHtml(cid)}</div></div>
    <form class="chat-compose" id="chat-form" autocomplete="off">
      <div id="chat-at" class="chat-at" role="listbox" aria-label="${t('Mention someone')}" hidden></div>
      <div id="chat-bar">${barHtml()}</div>
      <div class="chat-input">
        <label class="icon-btn chat-attach" title="${t('Send a picture')}" aria-label="${t('Send a picture')}">${ico('image')}<input type="file" id="chat-file" accept="image/jpeg,image/png,image/webp,image/gif" hidden></label>
        <textarea id="chat-text" rows="1" maxlength="${MAX_LEN}" placeholder="${t('Write a message…')}" aria-label="${t('Write a message…')}">${esc(C.edit ? C.edit.body : C.drafts[cid] || '')}</textarea>
        ${sendBtn(cid)}
      </div>
    </form>`;
}
function barHtml() {
  const m = C.edit || C.reply;
  if (!m) return '';
  return `<div class="chat-bar">${ico(C.edit ? 'edit' : 'reply')}<span><b>${C.edit ? t('Editing message') : t('Replying to {n}', { n: esc(m.sender_id === S.me ? t('yourself') : m.sender_name || t('Former member')) })}</b>
    <small class="muted">${m.attachment && !m.body ? t('Picture') : esc((m.body || '').slice(0, 120))}</small></span>
    <button type="button" class="icon-btn" data-chat-bar-x aria-label="${t('Cancel')}">${ico('x')}</button></div>`;
}
function threadHtml(cid) {
  const th = thread(cid), c = conv(cid);
  if (!th.loaded) return `<p class="muted chat-note">${t('Loading…')}</p>`;
  const top = th.more ? `<button type="button" class="btn sm ghost chat-older" data-chat-older>${th.loading ? t('Loading…') : t('Load older messages')}</button>`
    : `<p class="chat-note muted">${isBattle(c) ? (c.stage ? t('Share how to beat {l}: teams, turn order, what to watch out for.', { l: esc(c.title || '?') }) : t('Plan the battle together: rules, tickets, who takes which stage.')) : c.kind === 'gym' ? t('The start of the gym room.') : c.kind === 'group' ? t('The start of the group “{n}”.', { n: esc(convTitle(c)) }) : t('The start of your conversation with {n}.', { n: esc(convTitle(c)) })}</p>`;
  const myRead = Date.parse(C.members.find(m => m.conversation_id === cid && m.user_id === S.me)?.last_read_at || 0);
  const seen = seenBy(th.msgs, C.members, S.me);
  let newLine = false;
  return top + layout(th.msgs, viewTz()).map(it => {
    if (it.day) return `<div class="chat-day"><span>${esc(dayLabel(it.at))}</span></div>`;
    if (it.sys) return `<div class="chat-sys" data-mid="${it.sys.id}"><span>${esc(sysLine(it.sys.system))}</span>${seen[it.sys.id] ? seenHeads(it.sys.id, seen[it.sys.id]) : ''}</div>`;
    const m = it.msg;
    let line = '';
    if (!newLine && c.unread && m.sender_id !== S.me && Date.parse(m.created_at) > myRead) { newLine = true; line = `<div class="chat-new" id="chat-new"><span>${t('New messages')}</span></div>`; }
    return line + msgHtml(m, it, c, th, seen[m.id]);
  }).join('');
}
// The faces of those who read up to here (Messenger's "seen"); a tap lists who has and who has not
function seenHeads(mid, users) {
  const shown = users.slice(0, 5), more = users.length - shown.length;
  const names = users.map(u => nameOf(profile(u)) || '?').join(', ');
  return `<button type="button" class="seen-heads" data-chat-seen="${mid}" title="${esc(t('Seen by {n}', { n: names }))}" aria-label="${esc(t('Seen by {n}', { n: names }))}">${shown.map(u => av(u, 'xs')).join('')}${more > 0 ? `<b>+${more}</b>` : ''}</button>`;
}
// Reactions, WhatsApp-style: one small pill astride the bottom edge of the bubble, the emojis given and how many;
// a tap lists who gave which (and lets me take mine back)
function rxPill(mid, rx) {
  const n = rx.reduce((k, g) => k + g.n, 0);
  const names = rx.map(g => `${g.emoji} ${g.users.map(u => nameOf(profile(u)) || '?').join(', ')}`).join('\n');
  return `<button type="button" class="msg-rx ${rx.some(g => g.mine) ? 'rx-mine' : ''} ${C.rxPop === mid ? 'rx-pop' : ''}" data-chat-rx="${mid}" title="${esc(names)}" aria-label="${esc(t('Reactions ({n})', { n }))}">${rx.slice(0, 3).map(g => `<span>${g.emoji}</span>`).join('')}${n > 1 ? `<b>${n}</b>` : ''}</button>`;
}
function popRx(mid) { C.rxPop = mid; setTimeout(() => { if (C.rxPop === mid) C.rxPop = null; }, 600); }
function msgHtml(m, it, c, th, seenHere) {
  const mine = m.sender_id === S.me && !!m.sender_id, gym = c.kind !== 'direct';   // the gym room and groups show who says what
  const quoted = m.reply_to ? th.msgs.find(x => x.id === m.reply_to) : null;
  const rx = reactionSummary(th.reactions, m.id, S.me);
  const att = m.attachment, url = att && (C.urls[att.path]?.url || att.preview);
  const box = att ? fitBox(att.w || 4, att.h || 3, 280) : null;
  const live = !m.archived;   // an archived message is kept compressed and can only be read (and quoted)
  const canDel = live && !m.deleted_at && !m.pending && (mine || isStaff());
  const trn = m.deleted_at ? null : trOf(m), shown = trShown(m), offer = trn?.text && trWanted(m);
  const body = m.deleted_at ? `<i class="muted">${m.deleted_by && m.deleted_by !== m.sender_id ? t('Removed by a moderator') : t('This message was deleted')}</i>`
    : m.body ? `<span class="msg-text ${jumbo(m.body) ? 'jumbo' : ''}">${markMentions(linkify(esc(shown ? trn.text : m.body)), whoIn(c.id), m.mentions ? m.mention_all : canAll(c) && m.sender_id === S.me)}</span>${offer ? `<button type="button" class="msg-tr" data-chat-orig="${m.id}">${ico('globe')}<span>${shown ? esc(t('Translated from {l}', { l: langName(trn.from) })) : t('Original')}</span><b>${shown ? t('See original') : t('See translation')}</b></button>` : ''}` : '';
  return `<div class="msg ${mine ? 'me' : ''} ${callsMeMsg(m) ? 'calls-me' : ''} ${it.head ? 'head' : ''} ${it.tail ? 'tail' : ''} ${C.sel === m.id ? 'sel' : ''} ${m.pending ? 'pending' : ''} ${live ? '' : 'archived'} ${rx.length ? 'has-rx' : ''}" data-mid="${m.id}">
    ${!mine && gym ? `<span class="msg-av">${it.tail ? (m.sender_id && profile(m.sender_id) ? av(m.sender_id, 'sm') : `<span class="av sm">${esc((m.sender_name || '?')[0])}</span>`) : ''}</span>` : ''}
    <div class="msg-col">
      <div class="bubble" data-chat-bubble>
        ${!mine && gym && it.head ? `<b class="msg-name">${esc(nickOf(m.conversation_id, m.sender_id) || m.sender_name || t('Former member'))}</b>` : ''}
        ${m.reply_to ? `<button type="button" class="msg-quote" data-chat-jump="${m.reply_to}"><b>${esc(quoted ? (quoted.sender_id === S.me ? t('You') : quoted.sender_name) : '')}</b><span>${quoted ? (quoted.deleted_at ? t('This message was deleted') : quoted.attachment && !quoted.body ? t('Picture') : esc(quoted.body.slice(0, 140))) : t('An earlier message')}</span></button>` : ''}
        ${att && !m.deleted_at ? `<button type="button" class="msg-img" data-chat-img="${esc(att.path)}" style="width:${box.w}px;aspect-ratio:${box.w}/${box.h}" aria-label="${t('Open the picture')}">${url ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async">` : ''}</button>` : ''}
        ${body}
        <span class="msg-meta">${live ? '' : `<span title="${t('Kept compressed: it can be read and quoted, no longer changed.')}">${t('archived')}</span> · `}${m.edited_at && !m.deleted_at ? `${t('edited')} · ` : ''}${live ? clock(m.created_at) : fmt(m.created_at, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}${mine ? ticks(receipt(m, C.members, S.me)) : ''}</span>
        ${rx.length ? rxPill(m.id, rx) : ''}
      </div>
      ${!m.deleted_at && !m.pending ? `<div class="msg-acts">${live ? `<button type="button" class="msg-react-btn" data-chat-tray="${m.id}" aria-label="${t('React')}" title="${t('React')}">${ico('smile')}</button>` : ''}<button type="button" class="msg-menu-btn" data-chat-menu="${m.id}" aria-label="${t('Message options')}" title="${t('Message options')}" aria-haspopup="menu">${ico('chev')}</button></div>` : ''}
      ${seenHere ? seenHeads(m.id, seenHere) : ''}
    </div>
  </div>`;
}
// The "typing…" bubble at the bottom of the conversation: three bouncing dots, with the face of who is typing in a group
function typingHtml(cid) {
  const who = typers(cid);
  if (!who.length) return '';
  const multi = conv(cid)?.kind !== 'direct';
  return `<div class="msg head tail typing-msg">${multi ? `<span class="msg-av">${av(who[0], 'sm')}</span>` : ''}<div class="msg-col">
    <div class="bubble typing-bubble" title="${esc(typingLine(cid))}">${dots}</div>${who.length > 1 ? `<small class="muted typing-more">${esc(typingLine(cid))}</small>` : ''}</div></div>`;
}
function paintTyping() {
  const el = $('#chat-typing'), box = $('#chat-scroll');
  if (!el || !C.open) return;
  const atBottom = box && box.scrollHeight - box.scrollTop - box.clientHeight < 90;
  el.innerHTML = typingHtml(C.open);
  if (atBottom) box.scrollTop = box.scrollHeight;
}

// ─── Groups: start one, or see and manage the open one ───
const groupPeople = (q, skip) => S.profiles.filter(p => p.id !== S.me && !skip.has(p.id) && (!q || `${p.display_name} ${p.username}`.toLowerCase().includes(q.toLowerCase())))
  .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
function peopleList(list, sel, attr) {
  return list.map(p => `<label class="chat-person ${sel.has(p.id) ? 'on' : ''}"><input type="checkbox" ${attr}="${p.id}" ${sel.has(p.id) ? 'checked' : ''}>${av(p.id)}${C.online.has(p.id) ? '<i class="dot-on"></i>' : ''}
    <span class="ci-main"><b>${esc(nameOf(p))}</b><small class="muted">@${esc(p.username)}</small></span><span class="chat-tick">${ico('check')}</span></label>`).join('') || `<p class="muted pad">${t('Nobody matches.')}</p>`;
}
const chips = sel => [...sel].map(id => `<button type="button" class="chat-chip" data-chat-unpick="${id}">${av(id, 'xs')}<span>${esc(firstName(nameOf(profile(id))))}</span>${ico('x')}</button>`).join('');
function newGroupPanel() {
  const P = C.panel;
  return `<header class="chat-head"><button type="button" class="icon-btn" data-chat-panel-x aria-label="${t('Back to the chat')}">${ico('left')}</button>
      <span class="ch-t"><b>${t('New group')}</b><small class="muted">${t('Pick the members, then give the group a name')}</small></span></header>
    <form class="chat-panel" id="chat-group-form" autocomplete="off">
      <label class="chat-field">${t('Group name')}<input name="title" maxlength="60" required placeholder="${t('e.g. Raid squad')}" value="${esc(P.title)}"></label>
      <div class="chat-chips" id="chat-chips">${chips(P.sel)}</div>
      <div class="chat-search"><span>${ico('search')}</span><input id="chat-gq" placeholder="${t('Search members…')}" value="${esc(P.q)}"></div>
      <div class="chat-people" id="chat-people">${peopleList(groupPeople(P.q, new Set()), P.sel, 'data-chat-gpick')}</div>
      <div class="chat-panel-foot"><button class="btn primary" id="chat-group-go" ${P.sel.size ? '' : 'disabled'}>${t('Create group')}${P.sel.size ? ` (${P.sel.size + 1})` : ''}</button></div>
    </form>`;
}
// Info about the open conversation, like on messaging apps: its picture and name, quick actions (profile, mute,
// search), then sections that fold: members, customizing (theme, quick emoji, nicknames), pictures sent, translation,
// and leaving. Customizing is the same for everyone in it and leaves a note in the conversation.
const toggle = (attr, on, label, hint) => `<label class="chat-set-row"><span><b>${label}</b>${hint ? `<small class="muted">${hint}</small>` : ''}</span>
  <input type="checkbox" class="switch" ${attr} ${on ? 'checked' : ''}></label>`;
function infoPanel(cid) {
  const c = conv(cid), P = C.panel;
  if (P.view === 'search') return searchPanel(c);
  const group = c.kind === 'group', direct = c.kind === 'direct', admin = isAdminOf(c), custom = canCustom(c), muted = MUTE.has(cid);
  const inConv = C.members.filter(m => m.conversation_id === cid).map(m => m.user_id)
    .sort((a, b) => (group && ((b === c.created_by) - (a === c.created_by))) || C.online.has(b) - C.online.has(a) || nameOf(profile(a)).localeCompare(nameOf(profile(b))));
  const other = direct ? profile(c.other_id) : null, l = isBattle(c) && c.stage ? leaderOfStage(c) : null;
  const status = direct ? (C.online.has(c.other_id) ? `<span class="ci-on">${t('Active now')}</span>` : `@${esc(other?.username || '')}`)
    : group ? `${t('{n} members', { n: inConv.length })} · ${t('Admin: {n}', { n: esc(nameIn(cid, c.created_by)) })}`
    : isBattle(c) ? `${esc(seasonOf(c)?.name || '')} · ${c.stage ? t('Stage {n}', { n: c.stage }) : t('General planning')}`
    : `${t('Everyone in the gym')} · ${t('{n} members', { n: inConv.length })}`;
  const act = (attr, icon, label, on = false) => `<button type="button" class="ci-act ${on ? 'on' : ''}" ${attr}><span>${ico(icon)}</span><small>${label}</small></button>`;
  const acts = [
    direct && c.other_id ? `<a class="ci-act" href="#/member/${c.other_id}"><span>${ico('users')}</span><small>${t('Profile')}</small></a>` : '',
    act('data-chat-mute', muted ? 'belloff' : 'bell', muted ? t('Unmute') : t('Mute'), muted),
    act('data-chat-search', 'search', t('Search')),
  ].join('');
  const open = (k, d) => (P.secs && k in P.secs ? P.secs[k] : d);
  const sec = (k, title, body, d = false) => `<details class="ci-sec" data-sec="${k}" ${open(k, d) ? 'open' : ''}><summary><span>${title}</span>${ico('chev')}</summary><div class="ci-body">${body}</div></details>`;
  const row = (attr, icon, label, value = '', on = false) => `<button type="button" class="ci-row ${on ? 'on' : ''}" ${attr} ${custom ? '' : 'disabled'}><span class="ci-ic">${icon}</span><span class="ci-l">${label}</span>${value ? `<small class="muted">${value}</small>` : ''}${ico('chev')}</button>`;
  const person = id => `<div class="chat-person">${av(id)}${C.online.has(id) ? '<i class="dot-on"></i>' : ''}
        <span class="ci-main"><a href="#/member/${id}"><b>${esc(nameIn(cid, id))}</b></a><small class="muted">${nickOf(cid, id) ? `${esc(nameOf(profile(id)))} · ` : ''}${id === S.me ? t('You') : C.online.has(id) ? t('online') : `@${esc(profile(id)?.username || '')}`}</small></span>
        ${group && id === c.created_by ? `<span class="badge role-mod">${t('Group admin')}</span>` : ''}
        ${admin && id !== S.me ? `<button type="button" class="icon-btn" data-chat-kick="${id}" aria-label="${t('Remove from the group')}" title="${t('Remove from the group')}">${ico('x')}</button>` : ''}</div>`;
  const theme = c.theme ? `<i class="ci-swatch" style="--sw:${tc(c.theme)}"></i>` : '<i class="ci-swatch none"></i>';
  const pick = P.pick;
  const customBody = `${custom ? '' : `<p class="muted ci-note">${t('Only mods and the admin can customize this conversation.')}</p>`}
    ${row('data-chat-pick="theme"', theme, t('Theme'), c.theme ? esc(t(c.theme)) : t('Default'), pick === 'theme')}
    ${pick === 'theme' ? `<div class="ci-themes">${['', ...TYPES].map(ty => `<button type="button" class="ci-theme ${(c.theme || '') === ty ? 'on' : ''}" data-chat-theme="${ty}" style="--sw:${ty ? tc(ty) : 'var(--accent)'}" title="${ty ? esc(t(ty)) : t('Default')}">${ty ? img(typeIcon(ty), 'ti', ty) : ico('x')}<small>${ty ? esc(t(ty)) : t('Default')}</small></button>`).join('')}</div>` : ''}
    ${row('data-chat-pick="emoji"', `<span class="ci-emoji">${esc(quickEmoji(c))}</span>`, t('Quick emoji'), c.emoji ? '' : t('Default'), pick === 'emoji')}
    ${pick === 'emoji' ? `<div class="ci-emojis">${QUICK.map(e => `<button type="button" class="${quickEmoji(c) === e ? 'on' : ''}" data-chat-emoji="${e}">${e}</button>`).join('')}</div>
      <form class="ci-inline" id="chat-emoji-form"><input name="emoji" maxlength="16" placeholder="${t('Or type any emoji')}" autocomplete="off"><button class="btn sm">${t('Use')}</button>${c.emoji ? `<button type="button" class="btn sm ghost" data-chat-emoji="">${t('Reset')}</button>` : ''}</form>` : ''}
    ${direct || group ? row('data-chat-pick="nick"', '<b class="ci-aa">Aa</b>', t('Nicknames'), '', pick === 'nick') : ''}
    ${pick === 'nick' ? `<div class="ci-nicks">${inConv.map(id => `<form class="ci-nick" data-chat-nickform="${id}">${av(id, 'sm')}<span class="ci-main"><input name="nick" maxlength="40" value="${esc(nickOf(cid, id))}" placeholder="${esc(nameOf(profile(id)) || t('Former member'))}" aria-label="${t('Nickname of {n}', { n: esc(nameOf(profile(id))) })}"><small class="muted">${esc(nameOf(profile(id)) || t('Former member'))}${id === S.me ? ` · ${t('You')}` : ''}</small></span><button class="btn sm">${t('Save')}</button></form>`).join('')}</div>` : ''}`;
  const pics = P.pics;
  const mediaBody = pics == null ? `<p class="muted ci-note">${t('Loading…')}</p>` : pics.length
    ? `<div class="ci-media">${pics.map(m => { const u = C.urls[m.attachment.path]?.url; return `<button type="button" class="ci-pic" data-chat-img="${esc(m.attachment.path)}" title="${esc(whenShort(m.created_at))}">${u ? `<img src="${esc(u)}" alt="" loading="lazy">` : ico('image')}</button>`; }).join('')}</div>`
    : `<p class="muted ci-note">${t('No pictures in this conversation yet.')}</p>`;
  const tr = TR.conv[cid] || '', opt = (v, label) => `<label class="seg-opt ${tr === v ? 'on' : ''}"><input type="radio" name="chat-convtr" data-chat-convtr="${v}" ${tr === v ? 'checked' : ''}>${label}</label>`;
  const trBody = `<div class="seg" role="radiogroup" aria-label="${t('Translation in this chat')}">${opt('', t('Like the chat settings ({s})', { s: TR.auto ? t('on') : t('off') }))}${opt('on', t('Always translate'))}${opt('off', t('Never translate'))}</div>
    <small class="muted">${t('Messages are shown in {l}. “See original” is always one tap away.', { l: esc(langName(trLang())) })}</small>
    <button type="button" class="linkish" data-chat-settings>${ico('sliders')} ${t('All chat settings')}</button>`;
  const more = [
    direct && c.other_id ? `<button type="button" class="ci-row" data-chat-groupwith="${c.other_id}"><span class="ci-ic">${ico('plus')}</span><span class="ci-l">${t('Create a group with {n}', { n: esc(firstName(nameIn(cid, c.other_id))) })}</span>${ico('chev')}</button>` : '',
    group ? `<button type="button" class="ci-row danger" data-chat-leave><span class="ci-ic">${ico('out')}</span><span class="ci-l">${t('Leave the group')}</span></button>` : '',
  ].join('');
  return `<header class="chat-head"><button type="button" class="icon-btn" data-chat-panel-x aria-label="${t('Back to the conversation')}">${ico('left')}</button>
      <span class="ch-t"><b>${t('Chat info')}</b><small class="muted">${esc(convTitle(c))}</small></span></header>
    <div class="chat-panel ci">
      <div class="ci-hero">${convAvatar(c, 'xl')}<h2>${esc(convTitle(c))} ${weakHtml(c)}</h2>${direct && nickOf(cid, c.other_id) ? `<small class="muted">${esc(nameOf(other))}</small>` : ''}
        <p class="muted">${status}</p>${l?.type ? `<p class="chat-ginfo">${typeTag(l.type)}</p>` : ''}
        <div class="ci-acts">${acts}</div></div>
      ${direct ? '' : sec('members', `${t('Chat members')} <small>${inConv.length}</small>`, `<div class="chat-people">${inConv.map(person).join('')}</div>
        ${admin ? `<h3 class="chat-list-h">${t('Add members')}</h3>
          <div class="chat-search"><span>${ico('search')}</span><input id="chat-aq" placeholder="${t('Search members…')}" value="${esc(P.q)}"></div>
          <div class="chat-people" id="chat-people">${peopleList(groupPeople(P.q, new Set(inConv)), P.sel, 'data-chat-apick')}</div>
          <div class="chat-panel-foot"><button type="button" class="btn primary" data-chat-add ${P.sel.size ? '' : 'disabled'}>${t('Add {n} to the group', { n: P.sel.size || '' })}</button></div>` : ''}
        ${admin ? `<form class="chat-rename" id="chat-rename-form"><label class="chat-field">${t('Group name')}<input name="title" maxlength="60" required value="${esc(c.title || '')}"></label><button class="btn">${t('Rename')}</button></form>` : ''}`, group)}
      ${sec('custom', t('Customize chat'), customBody, true)}
      ${sec('media', `${t('Media')}${pics?.length ? ` <small>${pics.length}</small>` : ''}`, mediaBody, true)}
      ${sec('translate', t('Translation'), trBody)}
      ${more ? sec('more', t('Privacy & support'), more, true) : ''}
    </div>`;
}
// Search in the open conversation (its messages that are not archived), newest first; a result jumps to the message
const mark = (body, q) => { const w = q.trim(); if (!w) return esc(body); const i = body.toLowerCase().indexOf(w.toLowerCase()); if (i < 0) return esc(body.slice(0, 140));
  const from = Math.max(0, i - 40); return `${from ? '…' : ''}${esc(body.slice(from, i))}<mark>${esc(body.slice(i, i + w.length))}</mark>${esc(body.slice(i + w.length, i + w.length + 100))}`; };
function hitsHtml(c) {
  const P = C.panel;
  if (!P.sq?.trim()) return `<p class="muted ci-note">${t('Type a word to find the messages that have it.')}</p>`;
  if (P.hits == null) return `<p class="muted ci-note">${t('Searching…')}</p>`;
  if (!P.hits.length) return `<p class="muted ci-note">${t('No messages match “{q}”.', { q: esc(P.sq.trim()) })}</p>`;
  return `<p class="muted ci-note">${t('{n} results', { n: P.hits.length })}</p>` + P.hits.map(m => `<button type="button" class="chat-item chat-hit" data-chat-hit="${m.id}">${m.sender_id && profile(m.sender_id) ? av(m.sender_id) : '<span class="av">?</span>'}
    <span class="ci-main"><span class="ci-top"><span class="ci-name"><b>${m.sender_id === S.me ? t('You') : esc(nickOf(c.id, m.sender_id) || m.sender_name || t('Former member'))}</b></span><small>${esc(whenShort(m.created_at))}</small></span>
      <span class="ci-bottom"><small class="ci-last">${mark(m.body, P.sq)}</small></span></span></button>`).join('');
}
function searchPanel(c) {
  return `<header class="chat-head"><button type="button" class="icon-btn" data-chat-search-x aria-label="${t('Back')}">${ico('left')}</button>
      <span class="ch-t"><b>${t('Search in the conversation')}</b><small class="muted">${esc(convTitle(c))}</small></span></header>
    <div class="chat-panel ci">
      <div class="chat-search"><span>${ico('search')}</span><input id="chat-sq" type="search" placeholder="${t('Search messages…')}" value="${esc(C.panel.sq || '')}" autocomplete="off" enterkeyhint="search"></div>
      <div class="chat-hits" id="chat-hits">${hitsHtml(c)}</div>
    </div>`;
}
async function loadPics(cid) {
  try {
    const list = await api.chatPictures(cid);
    await signUrls(list);
    if (C.panel?.kind === 'info' && C.panel.cid === cid) { C.panel.pics = list; paintPanel(); }
  } catch { if (C.panel?.kind === 'info' && C.panel.cid === cid) { C.panel.pics = []; paintPanel(); } }
}
let searchTimer = null;
async function runSearch() {
  const P = C.panel, cid = C.open, q = P?.sq?.trim();
  if (!P || !q || !cid) { if (P) P.hits = null; $('#chat-hits') && ($('#chat-hits').innerHTML = hitsHtml(conv(cid))); return; }
  try { const hits = await api.chatSearch(cid, q); if (C.panel === P && P.sq.trim() === q) P.hits = hits; } catch (e) { toast(tr(e), true); P.hits = []; }
  const el = $('#chat-hits');
  if (el && C.panel === P) el.innerHTML = hitsHtml(conv(cid));
}
// After customizing: the list (theme, emoji, nicknames) again, and everything that shows them
async function customized() { await refreshList(); paintList(); paintHead(); paintPanel(); }
// The chat's own settings (for this device)
function settingsPanel() {
  const n = Object.keys(TR.conv).length, appLang = LANGS.find(([k]) => k === getLang())?.[1] || getLang();
  return `<header class="chat-head"><button type="button" class="icon-btn" data-chat-panel-x aria-label="${t('Back to the chat')}">${ico('left')}</button>
      <span class="ch-t"><b>${t('Chat settings')}</b><small class="muted">${t('Kept on this device')}</small></span></header>
    <div class="chat-panel" id="chat-settings">
      <section class="chat-set">
        <h3 class="chat-list-h">${ico('globe')} ${t('Translation')}</h3>
        ${toggle('data-chat-set="auto"', TR.auto, t('Auto-translate'), t('Messages in other languages are shown in yours, with the original one tap away.'))}
        <label class="chat-set-row"><span><b>${t('Translate into')}</b><small class="muted">${t('Names of pairs, members and game terms are kept as they are.')}</small></span>
          <select data-chat-set="to"><option value="">${t('The app’s language ({l})', { l: esc(appLang) })}</option>${LANGS.map(([k, label]) => `<option value="${k}" ${TR.to === k ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label>
        ${n ? `<div class="chat-set-row"><span><b>${t('Chats with their own choice')}</b><small class="muted">${t('{n} conversations translate differently from this setting.', { n })}</small></span>
          <button type="button" class="btn sm" data-chat-set-reset>${t('Reset')}</button></div>` : ''}
      </section>
      <section class="chat-set">
        <h3 class="chat-list-h">${ico('pencil')} ${t('Writing')}</h3>
        ${toggle('data-chat-set="enter"', TR.enter, t('Enter sends the message'), t('On a keyboard; Shift+Enter starts a new line. On phones the send button is used.'))}
      </section>
      <section class="chat-set">
        <h3 class="chat-list-h">${ico('download')} ${t('App')}</h3>
        ${C.standalone ? `<div class="chat-set-row"><span><b>${t('Install the chat as an app')}</b><small class="muted">${installOffer ? t('It opens on its own, like a messaging app.') : t('Use your browser’s menu: “Install” or “Add to Home Screen”.')}</small></span>
          ${installOffer ? `<button type="button" class="btn sm" data-capp-install>${t('Install')}</button>` : ''}</div>`
          : `<div class="chat-set-row"><span><b>${t('The chat on its own')}</b><small class="muted">${t('Opens the chat without the rest of the gym; from there it can be installed as an app.')}</small></span>
          <a class="btn sm" href="chat.html${location.search}#/chat">${t('Open')}</a></div>`}
      </section>
    </div>`;
}
// Open (or start) the direct conversation with a member, from anywhere (their profile page)
export async function openDirect(uid) {
  await startChat();
  const cid = await act(() => api.chatOpenDirect(uid));
  if (!cid) return;
  if (!conv(cid)) await refreshList();
  C.picking = false; C.q = ''; C.panel = null;
  location.hash = `#/chat/${cid}`;
}

// Redraw parts in place (the composer and the scroll position are left alone)
function paintList() { const el = $('#chat-list'); if (el && onChat()) el.innerHTML = listHtml(); }
function paintHead() { const el = $('#chat-head'); if (el && C.open) el.innerHTML = headHtml(C.open); applyTheme(); paintSend(); }
// A panel drawn again in place, where it was scrolled to
function paintPanel() {
  const el = $('#chat-main'), box = el?.querySelector('.chat-panel');
  if (!el || !C.panel) return;
  const top = box?.scrollTop || 0;
  el.innerHTML = C.panel.kind === 'info' ? infoPanel(C.open) : C.panel.kind === 'settings' ? settingsPanel() : newGroupPanel();
  const nb = el.querySelector('.chat-panel');
  if (nb) nb.scrollTop = top;
  applyTheme();
}
function paintLive() { const el = $('#chat-live'); if (el) el.innerHTML = liveHtml(); }
function paintBar() { const el = $('#chat-bar'); if (el) el.innerHTML = barHtml(); paintSend(); }
const sendBtn = cid => { const quick = !C.edit && !(C.drafts[cid] || '').trim();
  return `<button class="btn primary chat-send ${quick ? 'quick' : ''}" data-k="${sendKey(cid)}" aria-label="${C.edit ? t('Save changes') : quick ? t('Send {e}', { e: quickEmoji(conv(cid)) }) : t('Send')}">${C.edit ? ico('check') : quick ? `<span class="qe">${esc(quickEmoji(conv(cid)))}</span>` : ico('send')}</button>`; };
const sendKey = cid => (C.edit ? 'edit' : (C.drafts[cid] || '').trim() ? 'send' : `quick:${quickEmoji(conv(cid))}`);
function paintSend() { const btn = $('.chat-send'), ta = $('#chat-text'); if (!btn || !C.open) return; if (ta && !C.edit) C.drafts[C.open] = ta.value; if (btn.dataset.k !== sendKey(C.open)) btn.outerHTML = sendBtn(C.open); }
function paintThread({ bottom = false, keepTop = false } = {}) {
  const box = $('#chat-scroll'), list = $('#chat-msgs');
  if (!box || !list || !C.open) return;
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 90, prevH = box.scrollHeight, prevTop = box.scrollTop;
  list.innerHTML = threadHtml(C.open);
  scheduleTr();
  if (keepTop) box.scrollTop = prevTop + (box.scrollHeight - prevH);
  else if (bottom || atBottom) box.scrollTop = box.scrollHeight;
  paintHead();
}

// The chat fills the screen between the top bar and, on a phone, the menu bar at the bottom; the visible part
// also shrinks when the phone's keyboard opens
// The chat fills the part of the screen that can be seen: when a phone's keyboard opens, only the composer moves up
// (the header stays, nothing behind it scrolls). The visible part is read from visualViewport, which iOS and Android
// both keep up to date while the keyboard slides.
function fit() {
  const vv = window.visualViewport, r = document.documentElement.style;
  r.setProperty('--vv-h', `${Math.round(vv?.height || innerHeight)}px`);
  r.setProperty('--vv-top', `${Math.round(vv?.offsetTop || 0)}px`);
}
let keepBottom = false;
const onViewport = () => {
  if (!onChat()) return;
  const box = $('#chat-scroll');
  keepBottom = !!box && box.scrollHeight - box.scrollTop - box.clientHeight < 90;
  fit();
  if (box && (keepBottom || document.activeElement?.id === 'chat-text')) box.scrollTop = box.scrollHeight;
};
addEventListener('resize', onViewport);
window.visualViewport?.addEventListener('resize', onViewport);
window.visualViewport?.addEventListener('scroll', () => onChat() && fit());
// iOS scrolls the whole page to bring a focused field into view; the chat is pinned, so put the page back
document.addEventListener('focusin', e => { if (onChat() && e.target.matches?.('#chat-text, #chat-q')) setTimeout(() => { if (scrollY) scrollTo(0, 0); fit(); }, 60); });

export async function afterChat(cid) {
  scrollTo(0, 0);
  fit();
  C.rt?.watch(cid || null);
  if (!cid) return;
  const th = thread(cid);
  if (!th.loaded) { try { await loadThread(cid); } catch (e) { toast(tr(e), true); } }
  if (C.open !== cid) return;   // moved on while loading
  paintThread({ bottom: true });
  const nl = $('#chat-new'), box = $('#chat-scroll');
  if (nl && box) box.scrollTop = Math.max(0, nl.offsetTop - box.clientHeight / 3);   // inside the thread only, never the page
  if (conv(cid)?.unread || C.members.some(m => m.conversation_id === cid && m.user_id === S.me && th.msgs.some(x => x.sender_id !== S.me && Date.parse(x.created_at) > Date.parse(m.last_read_at)))) markRead(cid);
  const ta = $('#chat-text');
  if (ta) { grow(ta); if (matchMedia('(pointer: fine)').matches) ta.focus(); }
  $('#chat-scroll')?.addEventListener('scroll', e => { if (e.target.scrollTop < 60 && thread(cid).more && !thread(cid).loading) older(cid); }, { passive: true });
}
async function older(cid) {
  paintThread({ keepTop: true });
  try { await loadThread(cid, { older: true }); } catch (e) { toast(tr(e), true); }
  paintThread({ keepTop: true });
}
const grow = ta => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`; ta.style.overflowY = ta.scrollHeight > 160 ? 'auto' : 'hidden'; };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && C.open && onChat() && conv(C.open)?.unread) markRead(C.open); });

// ─── @mentions in the composer ───
// Typing "@" lists the members of the conversation (and @everyone where I may call it); arrows or a tap pick one and
// "@username " is written in. The list follows what is typed after the "@": username, name or nickname, accents aside.
const atPeople = cid => C.members.filter(m => m.conversation_id === cid && m.user_id !== S.me).map(m => profile(m.user_id)).filter(Boolean)
  .map(p => ({ id: p.id, username: p.username, name: nameOf(p), nick: nickOf(cid, p.id) }));
function atUpdate(ta) {
  const cid = C.open, c = conv(cid);
  const q = c && c.kind !== 'direct' && ta.selectionStart === ta.selectionEnd ? mentionQuery(ta.value, ta.selectionStart) : null;
  if (!q) return atClose();
  const list = mentionMatches(atPeople(cid), q.q, 8), f = q.q.toLowerCase();
  if (canAll(c) && EVERYONE.some(w => w.startsWith(f))) list.unshift({ id: '', username: 'everyone', all: true });
  if (!list.length) return atClose();
  C.at = { start: q.start, list, i: C.at?.start === q.start ? Math.min(C.at.i, list.length - 1) : 0 };
  atPaint();
}
function atPaint() {
  const el = $('#chat-at');
  if (!el) return;
  if (!C.at) { el.hidden = true; el.innerHTML = ''; $('#chat-text')?.removeAttribute('aria-activedescendant'); return; }
  el.hidden = false;
  el.innerHTML = C.at.list.map((p, i) => `<button type="button" role="option" id="chat-at-${i}" class="chat-at-item ${i === C.at.i ? 'on' : ''}" aria-selected="${i === C.at.i}" data-chat-at="${i}">${p.all
    ? `<span class="av sm chat-gym">${ico('users')}</span><span class="ci-main"><b>@everyone</b><small class="muted">${t('Everyone in this conversation')}</small></span>`
    : `<span class="chat-at-av">${av(p.id, 'sm')}${C.online.has(p.id) ? '<i class="dot-on"></i>' : ''}</span><span class="ci-main"><b>${esc(p.nick || p.name)}</b><small class="muted">@${esc(p.username)}</small></span>`}</button>`).join('');
  $('#chat-text')?.setAttribute('aria-activedescendant', `chat-at-${C.at.i}`);
  el.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
}
function atClose() { if (!C.at) return; C.at = null; atPaint(); }
function atPick(i) {
  const ta = $('#chat-text'), p = C.at?.list[i];
  if (!ta || !p) { atClose(); return; }
  const end = ta.selectionStart, ins = `@${p.username} `;
  ta.value = ta.value.slice(0, C.at.start) + ins + ta.value.slice(end).replace(/^ /, '');
  const caret = C.at.start + ins.length;
  C.at = null; atPaint();
  ta.focus(); ta.setSelectionRange(caret, caret);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}
// Write at the caret ("@dan " from a message's menu), with a space before it when needed
function atInsert(text) {
  const ta = $('#chat-text');
  if (!ta) return;
  const a = ta.selectionStart ?? ta.value.length, b = ta.selectionEnd ?? a, pre = a && !/\s$/.test(ta.value.slice(0, a)) ? ' ' : '';
  ta.value = ta.value.slice(0, a) + pre + text + ta.value.slice(b);
  const caret = a + pre.length + text.length;
  ta.focus(); ta.setSelectionRange(caret, caret);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}
document.addEventListener('pointerdown', e => { if (e.target.closest?.('[data-chat-at]')) e.preventDefault(); });   // the box keeps the focus (and the phone its keyboard)
document.addEventListener('click', e => { const b = e.target.closest?.('[data-chat-at]'); if (b) atPick(+b.dataset.chatAt); });
document.addEventListener('focusout', e => { if (e.target.id === 'chat-text') setTimeout(() => { if (document.activeElement?.id !== 'chat-text') atClose(); }, 150); });
document.addEventListener('click', e => { if (e.target.id === 'chat-text') atUpdate(e.target); });

// ─── Sending ───
async function send(cid, body, attachment = null, preview = null) {
  const key = `k${++tmp}`, reply = C.reply;
  const pending = { id: `tmp-${key}`, client_key: key, pending: true, conversation_id: cid, sender_id: S.me, sender_name: nameOf(profile(S.me)),
    body, reply_to: reply?.id || null, attachment: attachment ? { ...attachment, preview } : null, created_at: new Date().toISOString() };
  const th = thread(cid);
  th.msgs = mergeMessage(th.msgs, pending);
  C.reply = null; C.drafts[cid] = '';
  paintBar(); paintThread({ bottom: true });
  try {
    const saved = await api.chatSend({ conversation_id: cid, body, reply_to: pending.reply_to, attachment });
    if (preview && attachment) C.urls[attachment.path] = { url: preview, exp: Date.now() + 50 * 6e4 };
    th.msgs = mergeMessage(th.msgs, { ...saved, client_key: key });
    th.msgs = th.msgs.filter(m => m.client_key !== key || !m.pending);
    const c = conv(cid);
    if (c) { c.last = snippetRow(saved); c.last_message_at = saved.created_at; }
    C.convs.sort((a, b) => Date.parse(b.last_message_at || b.created_at) - Date.parse(a.last_message_at || a.created_at));
  } catch (e) {
    th.msgs = th.msgs.filter(m => m.client_key !== key);
    if (!attachment) { C.drafts[cid] = body; const ta = $('#chat-text'); if (ta && !ta.value) { ta.value = body; grow(ta); } }
    C.reply = reply;
    paintBar();
    toast(tr(e), true);
  }
  paintList(); paintThread({ bottom: true });
}
// A picture is shrunk in the browser before it leaves (an animated GIF is sent as it is)
async function shrink(file) {
  if (file.type === 'image/gif') {
    const bmp = await createImageBitmap(file);
    return { blob: file, w: bmp.width, h: bmp.height };
  }
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { w, h } = fitBox(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise(res => c.toBlob(res, 'image/webp', 0.82)) || await new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
  if (!blob) throw new Error(t('Could not read that image.'));
  return { blob, w, h };
}
async function sendPicture(cid, file) {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) { toast(t('Please choose an image file.'), true); return; }
  if (file.size > 25 * 1024 * 1024) { toast(t('That image is too large (25 MB max).'), true); return; }
  let pic;
  try { pic = await shrink(file); } catch { toast(t('Could not read that image.'), true); return; }
  if (pic.blob.size > MAX_FILE) { toast(t('That picture is still over 5 MB after shrinking.'), true); return; }
  const caption = ($('#chat-text')?.value || '').trim();
  if ($('#chat-text')) { $('#chat-text').value = ''; grow($('#chat-text')); }
  const preview = URL.createObjectURL(pic.blob);
  let path;
  try { path = await api.chatUpload(cid, S.me, pic.blob); } catch (e) { toast(tr(e), true); return; }
  await send(cid, caption, { path, mime: pic.blob.type, size: pic.blob.size, w: pic.w, h: pic.h }, preview);
}

// ─── Events ───
document.addEventListener('submit', async e => {
  if (e.target.id !== 'chat-form') return;
  e.preventDefault();
  atClose();
  const cid = C.open, ta = $('#chat-text');
  if (!cid || !ta) return;
  const body = ta.value.trim();
  if (C.edit) {
    const m = C.edit;
    if (await act(async () => {
      const saved = await api.chatEdit(m.id, body);
      thread(cid).msgs = mergeMessage(thread(cid).msgs, saved);
    })) { C.edit = null; ta.value = C.drafts[cid] || ''; grow(ta); paintBar(); paintThread(); }
    return;
  }
  if (!body) { if (e.submitter?.classList.contains('quick')) send(cid, quickEmoji(conv(cid))); return; }   // the quick emoji, only from its button
  ta.value = ''; grow(ta);
  send(cid, body);
  paintSend();
});
document.addEventListener('keydown', e => {
  if (e.target.id !== 'chat-text') return;
  if (C.at && !e.isComposing) {
    const n = C.at.list.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); C.at.i = (C.at.i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; atPaint(); return; }
    if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') { e.preventDefault(); atPick(C.at.i); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); atClose(); return; }
  }
  // Enter sends on a keyboard; on a phone Enter makes a new line and the button sends
  if (e.key === 'Enter' && TR.enter && !e.shiftKey && !e.isComposing && matchMedia('(pointer: fine)').matches) { e.preventDefault(); e.target.form.requestSubmit(); }
  if (e.key === 'Escape' && (C.edit || C.reply)) { if (C.edit) e.target.value = C.drafts[C.open] || ''; C.edit = C.reply = null; paintBar(); }
  if (e.key === 'ArrowUp' && !e.target.value && !C.edit) {   // edit my last message, like most chat apps
    const m = [...thread(C.open).msgs].reverse().find(x => editable(x, S.me) && x.body);
    if (m) { e.preventDefault(); startEdit(m); }
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'chat-text') {
    grow(e.target);
    if (!C.edit) { const was = !(C.drafts[C.open] || '').trim(); C.drafts[C.open] = e.target.value; if (was !== !e.target.value.trim()) paintSend(); }
    if (e.target.value && Date.now() - lastTypingSent > 2500) { lastTypingSent = Date.now(); C.rt?.typing(C.open); }
    atUpdate(e.target);
  } else if (e.target.id === 'chat-q') {
    C.q = e.target.value;
    paintList();
  }
});
document.addEventListener('change', e => {
  if (e.target.id !== 'chat-file' || !e.target.files?.[0]) return;
  const f = e.target.files[0];
  e.target.value = '';
  if (C.open) sendPicture(C.open, f);
});
// Another battle's channels
document.addEventListener('change', e => {
  if (e.target.id !== 'chat-season') return;
  C.bsid = +e.target.value;
  if (C.open && conv(C.open)?.season_id !== C.bsid) location.hash = '#/battle'; else hooks.route();
});
// Pasting a picture sends it
document.addEventListener('paste', e => {
  if (e.target.id !== 'chat-text' || !C.open) return;
  const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/'));
  if (f) { e.preventDefault(); sendPicture(C.open, f); }
});
// Dropping pictures on the conversation sends them (several in a row, in the order dropped)
let dropOff = 0;
function dropTarget(e) {
  if (!onChat() || !C.open || !$('#chat-form') || !e.dataTransfer?.types?.includes('Files')) return null;
  return e.target.closest?.('#chat-main') || null;
}
document.addEventListener('dragover', e => {
  const main = dropTarget(e);
  if (!main) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  main.dataset.drop = t('Drop pictures here to send them');
  main.classList.add('dropping');
  clearTimeout(dropOff);
  dropOff = setTimeout(() => main.classList.remove('dropping'), 150);   // no dragover for a moment: the drag left
});
document.addEventListener('drop', async e => {
  const main = dropTarget(e);
  if (!main) return;
  e.preventDefault();
  clearTimeout(dropOff);
  main.classList.remove('dropping');
  const files = [...e.dataTransfer.files];
  const pics = files.filter(f => f.type.startsWith('image/')).slice(0, 10);
  if (!pics.length) { toast(t('Please choose an image file.'), true); return; }
  const cid = C.open;
  for (const f of pics) await sendPicture(cid, f);
});
function startEdit(m) {
  C.edit = m; C.reply = null;
  const ta = $('#chat-text');
  if (ta) { ta.value = m.body; grow(ta); ta.focus(); }
  paintBar();
}
document.addEventListener('click', async e => {
  if (!onChat()) return;
  const el = e.target.closest('[data-capp-install],[data-chat-orig],[data-chat-tr],[data-chat-new],[data-chat-with],[data-chat-older],[data-chat-reply],[data-chat-mention],[data-chat-edit],[data-chat-del],[data-chat-react],[data-chat-copy],[data-chat-menu],[data-chat-tray],[data-chat-bar-x],[data-chat-jump],[data-chat-img],.chat-lightbox');
  const d = el?.dataset || {};
  if (!el?.closest('.msg-pop, .msg-sheet') && !('chatMenu' in d) && !('chatTray' in d)) closePop();   // a click elsewhere closes the menu
  if (!el) return;
  if (el.closest('.msg-pop, .msg-sheet') && !('chatTray' in d)) closePop();   // a menu item was chosen
  if (el.classList.contains('chat-lightbox')) { el.remove(); return; }
  if (d.chatMenu) { togglePop('menu', +d.chatMenu, el, e.detail === 0); return; }
  if (d.chatTray) { togglePop('tray', +d.chatTray, el.closest('.msg-pop') ? document.querySelector(`.msg[data-mid="${CSS.escape(d.chatTray)}"] .bubble`) : el, e.detail === 0); return; }
  if (el.matches('[data-capp-install]')) { installOffer?.prompt(); return; }
  if (d.chatOrig) { const id = +d.chatOrig; if (TR.orig.has(id)) TR.orig.delete(id); else TR.orig.add(id); paintThread(); return; }
  if (d.chatTr) {
    const m = msgById(C.open, +d.chatTr);
    if (!m) return;
    TR.manual.add(m.id); TR.orig.delete(m.id); TR.failed.delete(trKey(m));
    await runTr();
    const r = trOf(m);
    if (r && !r.text) toast(t('This message is already in your language.'));
    paintThread();
    return;
  }
  if (d.chatCopy) {
    const msg = msgById(C.open, +d.chatCopy);
    try { await navigator.clipboard.writeText(msg?.body || ''); toast(t('Copied')); } catch { toast(t('Could not copy.'), true); }
    return;
  }
  if ('chatNew' in d) { C.picking = !C.picking; C.q = ''; hooks.route(); if (C.picking) $('#chat-q')?.focus(); return; }
  if (d.chatWith) {
    const cid = await act(() => api.chatOpenDirect(d.chatWith));
    if (!cid) return;
    if (!conv(cid)) await refreshList();
    C.picking = false; C.q = '';
    location.hash = `#/chat/${cid}`;
    return;
  }
  if ('chatOlder' in d) { older(C.open); return; }
  if ('chatBarX' in d) { if (C.edit) { const ta = $('#chat-text'); if (ta) ta.value = C.drafts[C.open] || ''; } C.edit = C.reply = null; paintBar(); return; }
  const m = id => msgById(C.open, +id);
  if (d.chatReply) { C.reply = m(d.chatReply); C.edit = null; C.sel = null; paintBar(); paintThread(); $('#chat-text')?.focus(); return; }
  if (d.chatMention) { const u = profile(m(d.chatMention)?.sender_id)?.username; if (u) atInsert(`@${u} `); return; }
  if (d.chatEdit) { C.sel = null; paintThread(); startEdit(m(d.chatEdit)); return; }
  if (d.chatDel) {
    const msg = m(d.chatDel);
    if (!msg || !await ask(msg.sender_id === S.me ? t('Delete this message for everyone?') : t('Remove this message from {n} for everyone?', { n: msg.sender_name }), { title: t('Delete message'), ok: t('Delete'), danger: true })) return;
    const path = msg.attachment?.path;
    const saved = await act(() => api.chatDelete(msg.id));
    if (saved) {
      thread(C.open).msgs = mergeMessage(thread(C.open).msgs, saved);
      if (path) api.chatRemoveMedia(path).catch(() => {});
      C.sel = null; paintThread();
    }
    return;
  }
  if (d.chatReact) {
    const id = +d.chatReact, cur = thread(C.open).reactions.find(r => r.message_id === id && r.user_id === S.me);
    const emoji = d.emoji && cur?.emoji !== d.emoji ? d.emoji : null;   // tapping my own reaction again removes it
    const th = thread(C.open), before = th.reactions;
    th.reactions = applyReaction(th.reactions, { message_id: id, user_id: S.me, emoji });
    el.closest('.dlg-wrap')?.querySelector('[data-dlg=yes]')?.click();   // taken back from the reactions sheet
    if (emoji) popRx(id);
    C.sel = null; paintThread();
    try { await api.chatReact(id, S.me, emoji); } catch (err) { th.reactions = before; paintThread(); toast(tr(err), true); }
    return;
  }
  if (d.chatJump) { flashMsg(d.chatJump); return; }
  if (d.chatImg) {
    const url = C.urls[d.chatImg]?.url || thread(C.open).msgs.find(x => x.attachment?.path === d.chatImg)?.attachment?.preview;
    if (url) document.body.insertAdjacentHTML('beforeend', `<div class="chat-lightbox" role="dialog" aria-label="${t('Picture')}"><img src="${esc(url)}" alt=""><span class="icon-btn">${ico('x')}</span></div>`);
    return;
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { document.querySelector('.chat-lightbox')?.remove(); closePop(); } });
function flashMsg(id) {
  const target = document.querySelector(`.msg[data-mid="${CSS.escape(String(id))}"]`), box = $('#chat-scroll');
  if (!target || !box) return false;
  box.scrollTo({ top: target.offsetTop - box.clientHeight / 2, behavior: 'smooth' });
  target.classList.add('flash'); setTimeout(() => target.classList.remove('flash'), 1600);
  return true;
}
async function jumpTo(cid, id) {
  const th = thread(cid);
  for (let i = 0; i < 40 && !th.msgs.some(m => m.id === id) && th.more && C.open === cid; i++) await loadThread(cid, { older: true });
  if (C.open !== cid) return;
  paintThread({ keepTop: true });
  if (!flashMsg(id)) toast(t('That message could not be found.'), true);
}
// After the archive ran, the loaded threads may hold messages that are now packed: load them again when opened
export function forgetThreads() { C.threads = {}; if (C.started) refreshList().then(paintList).catch(() => {}); }

// ─── The message menu, WhatsApp-style ───
// With a mouse: a chevron in the corner of the bubble opens a menu, a round smiley beside it opens the reactions;
// a right click opens the menu too. On a touch screen: a long press opens a sheet from the bottom with the reactions
// on top and the actions under them. Only one is ever open; a click elsewhere, Esc or scrolling closes it.
let popFor = null, popTop = 0;   // what is open, and where the conversation was scrolled when it opened
function menuItems(m) {
  const mine = m.sender_id === S.me, live = !m.archived && !m.system;
  const item = (attr, icon, label, cls = '') => `<button type="button" role="menuitem" class="${cls}" ${attr}="${m.id}">${ico(icon)}<span>${label}</span></button>`;
  return [
    item('data-chat-reply', 'replyl', t('Reply')),
    !mine && m.sender_id && conv(C.open)?.kind !== 'direct' && C.members.some(x => x.conversation_id === C.open && x.user_id === m.sender_id) ? item('data-chat-mention', 'at', t('Mention {n}', { n: esc(firstName(nameIn(C.open, m.sender_id))) })) : '',
    live && !m.deleted_at ? item('data-chat-tray', 'smile', t('React')) : '',
    m.body && !m.deleted_at ? item('data-chat-copy', 'copy', t('Copy')) : '',
    !trCan(m) || (trOf(m) && !trOf(m).text) ? ''   // nothing to translate, or already in my language
      : trOf(m)?.text && trWanted(m) ? item('data-chat-orig', 'globe', trShown(m) ? t('See original') : t('See translation'))
      : item('data-chat-tr', 'globe', t('Translate')),
    editable(m, S.me) && m.body ? item('data-chat-edit', 'pencil', t('Edit')) : '',
    mine && live ? item('data-chat-seen', 'eye', t('Seen by')) : '',
    live && !m.deleted_at && (mine || isStaff()) ? item('data-chat-del', 'trash', mine ? t('Delete') : t('Remove for everyone'), 'danger') : '',
  ].join('');
}
const trayHtml = m => {
  const mineNow = thread(C.open).reactions.find(r => r.message_id === m.id && r.user_id === S.me)?.emoji;
  return REACTIONS.map((e, i) => `<button type="button" class="${mineNow === e ? 'on' : ''}" style="--i:${i}" data-chat-react="${m.id}" data-emoji="${e}" aria-label="${e}">${e}</button>`).join('');
};
function closePop() {
  // fading out for a moment, but already out of the way: it takes no clicks and is never taken for the open one
  document.querySelectorAll('.msg-pop:not(.closing), .msg-sheet-wrap:not(.closing)').forEach(el => { el.classList.remove('in'); el.classList.add('closing'); setTimeout(() => el.remove(), 140); });
  document.querySelectorAll('.msg.menu-on').forEach(el => el.classList.remove('menu-on'));
  popFor = null;
}
function togglePop(kind, mid, anchor, keyboard = false) {
  const key = `${kind}:${mid}`;
  if (popFor === key) { closePop(); return; }
  closePop();
  const m = msgById(C.open, mid);
  if (!m || !anchor) return;
  popFor = key; popTop = $('#chat-scroll')?.scrollTop || 0;
  const row = anchor.closest('.msg') || document.querySelector(`.msg[data-mid="${CSS.escape(String(mid))}"]`);
  row?.classList.add('menu-on');
  const el = document.createElement('div');
  el.className = `msg-pop ${kind}`;
  el.setAttribute('role', kind === 'menu' ? 'menu' : 'toolbar');
  el.innerHTML = kind === 'menu' ? menuItems(m) : trayHtml(m);
  document.body.append(el);
  // Below the anchor when there is room, else above; never off screen
  const a = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight, mine = m.sender_id === S.me;
  let left = kind === 'tray' ? a.left + a.width / 2 - w / 2 : mine ? a.right - w : a.left;
  left = Math.max(8, Math.min(left, innerWidth - w - 8));
  let top = kind === 'tray' ? a.top - h - 8 : a.bottom + 4;
  if (kind === 'tray' && top < 8) top = a.bottom + 8;
  if (kind === 'menu' && top + h > innerHeight - 8) top = Math.max(8, a.top - h - 4);
  Object.assign(el.style, { left: `${left}px`, top: `${top}px` });
  el.style.transformOrigin = `${kind === 'tray' ? 'center' : mine ? 'right' : 'left'} ${top < a.top ? 'bottom' : 'top'}`;
  requestAnimationFrame(() => { el.classList.add('in'); if (keyboard) el.querySelector('button')?.focus({ preventScroll: true }); });   // focus moves in only for keyboard users
}
function openSheet(mid) {
  closePop();
  const m = msgById(C.open, mid);
  if (!m || m.pending || m.deleted_at) return;
  popFor = `sheet:${mid}`; popTop = $('#chat-scroll')?.scrollTop || 0;
  document.querySelector(`.msg[data-mid="${CSS.escape(String(mid))}"]`)?.classList.add('menu-on');
  const live = !m.archived && !m.system;
  const wrap = document.createElement('div');
  wrap.className = 'msg-sheet-wrap';
  wrap.innerHTML = `<div class="msg-sheet" role="menu">${live ? `<div class="msg-sheet-tray">${trayHtml(m)}</div>` : ''}<div class="msg-sheet-items">${menuItems(m).replace(/<button type="button" role="menuitem" class="" data-chat-tray="[^"]*">.*?<\/button>/, '')}</div></div>`;
  document.body.append(wrap);
  wrap.addEventListener('click', e => { if (e.target === wrap) closePop(); });
  requestAnimationFrame(() => wrap.classList.add('in'));
  navigator.vibrate?.(8);
}
// Long press on a touch screen, right click with a mouse
let press = null;
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('.chat-msgs .msg:not(.pending) .bubble');
  if (!b || e.pointerType === 'mouse' || e.target.closest('a, .msg-img, .msg-quote')) return;
  const mid = +b.closest('.msg').dataset.mid, x = e.clientX, y = e.clientY;
  press = { mid, x, y, timer: setTimeout(() => { press = null; openSheet(mid); }, 450) };
});
const cancelPress = e => { if (press && (!e || e.type !== 'pointermove' || Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10)) { clearTimeout(press.timer); press = null; } };
document.addEventListener('pointermove', cancelPress, { passive: true });
document.addEventListener('pointerup', () => cancelPress());
document.addEventListener('pointercancel', () => cancelPress());
document.addEventListener('contextmenu', e => {
  const b = e.target.closest('.chat-msgs .msg:not(.pending) .bubble');
  if (!b || e.target.closest('a')) return;
  e.preventDefault();
  const mid = +b.closest('.msg').dataset.mid;
  if (matchMedia('(hover: hover)').matches) togglePop('menu', mid, b.closest('.msg').querySelector('.msg-menu-btn') || b); else openSheet(mid);
});
// Only a real scroll by the person closes it, not the conversation settling after a redraw (a new message, a reaction)
document.addEventListener('scroll', e => { if (popFor && e.target.id === 'chat-scroll' && Math.abs(e.target.scrollTop - popTop) > 40) closePop(); }, true);
addEventListener('hashchange', closePop);

// ─── Groups and "seen by": their own listeners ───
const repaintPicker = () => {
  const P = C.panel; if (!P) return;
  const ch = $('#chat-chips'); if (ch) ch.innerHTML = chips(P.sel);
  const go = $('#chat-group-go'); if (go) { go.disabled = !P.sel.size; go.textContent = `${t('Create group')}${P.sel.size ? ` (${P.sel.size + 1})` : ''}`; }
  const add = $('[data-chat-add]'); if (add) { add.disabled = !P.sel.size; add.textContent = t('Add {n} to the group', { n: P.sel.size || '' }); }
};
document.addEventListener('change', e => {
  const id = e.target.dataset?.chatGpick || e.target.dataset?.chatApick;
  if (!id || !C.panel) return;
  if (e.target.checked) C.panel.sel.add(id); else C.panel.sel.delete(id);
  e.target.closest('.chat-person')?.classList.toggle('on', e.target.checked);
  repaintPicker();
});
document.addEventListener('input', e => {
  if (!C.panel) return;
  if (e.target.name === 'title' && e.target.form?.id === 'chat-group-form') C.panel.title = e.target.value;
  if (e.target.id === 'chat-gq' || e.target.id === 'chat-aq') {
    C.panel.q = e.target.value;
    const skip = e.target.id === 'chat-aq' ? new Set(C.members.filter(m => m.conversation_id === C.open).map(m => m.user_id)) : new Set();
    $('#chat-people').innerHTML = peopleList(groupPeople(C.panel.q, skip), C.panel.sel, e.target.id === 'chat-aq' ? 'data-chat-apick' : 'data-chat-gpick');
  }
});
document.addEventListener('submit', async e => {
  if (e.target.id === 'chat-group-form') {
    e.preventDefault();
    const cid = await act(() => api.chatCreateGroup(e.target.title.value, [...C.panel.sel]));
    if (!cid) return;
    await refreshList();
    C.panel = null;
    location.hash = `#/chat/${cid}`;
  } else if (e.target.id === 'chat-rename-form') {
    e.preventDefault();
    if (await act(() => api.chatRenameGroup(C.open, e.target.title.value), t('Saved.'))) { await refreshList(); hooks.route(); }
  }
});
document.addEventListener('click', async e => {
  if (!onChat()) return;
  const el = e.target.closest('[data-chat-newgroup],[data-chat-panel-x],[data-chat-info],[data-chat-settings],[data-chat-set-reset],[data-chat-mute],[data-chat-search],[data-chat-search-x],[data-chat-hit],[data-chat-pick],[data-chat-theme],[data-chat-emoji],[data-chat-groupwith],[data-chat-seen],[data-chat-rx],[data-chat-kick],[data-chat-add],[data-chat-leave],[data-chat-unpick]');
  if (!el) return;
  const d = el.dataset;
  if ('chatNewgroup' in d) { C.picking = false; C.q = ''; C.panel = { kind: 'new', sel: new Set(), q: '', title: '' }; if (location.hash !== '#/chat') location.hash = '#/chat'; else hooks.route(); }
  else if ('chatPanelX' in d) { C.panel = null; hooks.route(); }
  else if ('chatInfo' in d) { C.panel = { kind: 'info', cid: C.open, sel: new Set(), q: '', pics: null, secs: {} }; hooks.route(); loadPics(C.open); }
  else if ('chatMute' in d) { if (MUTE.has(C.open)) MUTE.delete(C.open); else MUTE.add(C.open); saveMute(); badge(); paintList(); paintPanel(); toast(MUTE.has(C.open) ? t('Muted: no pop-ups or badge for this conversation.') : t('Unmuted.')); }
  else if ('chatSearch' in d) { C.panel.view = 'search'; C.panel.hits = null; paintPanel(); $('#chat-sq')?.focus(); if (C.panel.sq) runSearch(); }
  else if ('chatSearchX' in d) { C.panel.view = null; paintPanel(); }
  else if (d.chatHit) { const cid = C.open, id = +d.chatHit; C.panel = null; hooks.route(); await jumpTo(cid, id); }
  else if (d.chatPick) { C.panel.pick = C.panel.pick === d.chatPick ? null : d.chatPick; paintPanel(); }
  else if ('chatTheme' in d) { if (await act(() => api.chatSetTheme(C.open, d.chatTheme))) { C.panel.pick = null; await customized(); } }
  else if ('chatEmoji' in d) { if (await act(() => api.chatSetEmoji(C.open, d.chatEmoji))) { C.panel.pick = null; await customized(); } }
  else if (d.chatGroupwith) { C.picking = false; C.q = ''; C.panel = { kind: 'new', sel: new Set([d.chatGroupwith]), q: '', title: '' }; location.hash = '#/chat'; }
  else if ('chatSettings' in d) { C.panel = C.panel?.kind === 'settings' ? null : { kind: 'settings', cid: C.open || null }; hooks.route(); }
  else if ('chatSetReset' in d) { TR.conv = {}; setPref('gym-chat-trconv', TR.conv); hooks.route(); }
  else if (d.chatUnpick) { C.panel?.sel.delete(d.chatUnpick); const box = document.querySelector(`[data-chat-gpick="${CSS.escape(d.chatUnpick)}"]`); if (box) { box.checked = false; box.closest('.chat-person')?.classList.remove('on'); } repaintPicker(); }
  else if (d.chatSeen) {
    const m = thread(C.open).msgs.find(x => String(x.id) === d.chatSeen);
    if (!m) return;
    const r = readers(m, C.members, S.me);
    const row = (id, at) => `<div class="chat-person">${av(id)}<span class="ci-main"><b>${esc(nameOf(profile(id)) || t('Former member'))}</b>${at ? `<small class="muted">${esc(whenShort(at))}</small>` : ''}</span></div>`;
    showSheet(t('Seen by'), `<h3 class="chat-list-h">${t('Seen ({n})', { n: r.seen.length })}</h3><div class="chat-people">${r.seen.map(x => row(x.user_id, x.at)).join('') || `<p class="muted">${t('Nobody yet')}</p>`}</div>
      ${r.unseen.length ? `<h3 class="chat-list-h">${t('Not yet ({n})', { n: r.unseen.length })}</h3><div class="chat-people">${r.unseen.map(id => row(id)).join('')}</div>` : ''}`);
  } else if (d.chatRx) {
    const id = +d.chatRx, m = msgById(C.open, id);
    const rx = thread(C.open).reactions.filter(r => r.message_id === id)
      .sort((a, b) => (b.user_id === S.me) - (a.user_id === S.me) || REACTIONS.indexOf(a.emoji) - REACTIONS.indexOf(b.emoji));
    const sum = reactionSummary(rx, id, S.me);
    const row = r => `<div class="chat-person rx-row">${av(r.user_id)}<span class="ci-main"><b>${r.user_id === S.me ? t('You') : esc(nameOf(profile(r.user_id)) || t('Former member'))}</b>${r.user_id === S.me && m && !m.archived ? `<button type="button" class="rx-undo" data-chat-react="${id}" data-emoji="">${t('Tap to remove')}</button>` : ''}</span><span class="rx-e">${r.emoji}</span></div>`;
    showSheet(t('Reactions ({n})', { n: rx.length }), `<div class="rx-sum">${sum.map(g => `<span class="${g.mine ? 'rx-mine' : ''}">${g.emoji} <b>${g.n}</b></span>`).join('')}</div><div class="chat-people">${rx.map(row).join('')}</div>`);
  } else if (d.chatKick) {
    if (!await ask(t('Remove {n} from the group?', { n: nameOf(profile(d.chatKick)) }), { title: t('Remove from the group'), ok: t('Remove'), danger: true })) return;
    if (await act(() => api.chatRemoveMember(C.open, d.chatKick))) { await refreshList(); hooks.route(); }
  } else if ('chatAdd' in d) {
    if (await act(() => api.chatAddMembers(C.open, [...C.panel.sel]))) { C.panel.sel = new Set(); await refreshList(); hooks.route(); }
  } else if ('chatLeave' in d) {
    if (!await ask(t('Leave “{g}”? You will no longer see its messages.', { g: convTitle(conv(C.open)) }), { title: t('Leave the group'), ok: t('Leave'), danger: true })) return;
    if (await act(() => api.chatLeaveGroup(C.open))) { C.panel = null; await refreshList(); location.hash = '#/chat'; }
  }
});
// The settings' switches and choices, saved as soon as they change
document.addEventListener('change', e => {
  if (!onChat()) return;
  const el = e.target, d = el.dataset;
  if (d.chatSet === 'auto') { TR.auto = el.checked; setPref('gym-chat-autotr', TR.auto ? 'on' : 'off'); }
  else if (d.chatSet === 'to') { TR.to = el.value; setPref('gym-chat-trlang', TR.to); }
  else if (d.chatSet === 'enter') { TR.enter = el.checked; setPref('gym-chat-enter', TR.enter ? 'on' : 'off'); }
  else if ('chatConvtr' in d && C.panel?.cid) {
    if (d.chatConvtr) TR.conv[C.panel.cid] = d.chatConvtr; else delete TR.conv[C.panel.cid];
    setPref('gym-chat-trconv', TR.conv);
    paintPanel();
  } else return;
  toast(t('Saved.'));
});
// Which sections of the info panel are open is remembered while it stays open
document.addEventListener('toggle', e => {
  const sec = e.target.closest?.('.ci-sec');
  if (sec && C.panel?.kind === 'info') (C.panel.secs ||= {})[sec.dataset.sec] = sec.open;
}, true);
document.addEventListener('input', e => {
  if (e.target.id !== 'chat-sq' || !C.panel) return;
  C.panel.sq = e.target.value; C.panel.hits = null;
  const el = $('#chat-hits'); if (el) el.innerHTML = hitsHtml(conv(C.open));
  clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 250);
});
document.addEventListener('submit', async e => {
  const f = e.target;
  if (f.id === 'chat-emoji-form') {
    e.preventDefault();
    const v = f.emoji.value.trim();
    if (v && await act(() => api.chatSetEmoji(C.open, v))) { C.panel.pick = null; await customized(); }
  } else if (f.dataset?.chatNickform) {
    e.preventDefault();
    if (await act(() => api.chatSetNickname(C.open, f.dataset.chatNickform, f.nick.value.trim()), t('Saved.'))) await customized();
  }
});
