/* ═══════════════════════════════════════════════════════════════
   Chat logic that needs no DOM: laying out a thread, read receipts,
   merging live updates, link detection, picture sizing.
   Tested in test/chat.test.mjs; the page itself is pages/chat.js.
   ═══════════════════════════════════════════════════════════════ */
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];   // the same six the database accepts
export const MAX_LEN = 4000;                 // characters per message (database check)
export const PAGE = 50;                      // messages loaded at a time
export const MAX_FILE = 5 * 1024 * 1024;     // bytes per picture, after shrinking (bucket limit)
export const MAX_SIDE = 1600;                // longest side of a picture once shrunk
export const RUN_GAP = 5 * 60e3;             // messages by the same sender closer than this read as one run
export const EDIT_WINDOW = 15 * 60e3;        // a message can be edited this long after it was sent (database check)

// Calendar day of an instant in a time zone, as YYYY-MM-DD
export const dayKey = (iso, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

// A thread as drawn: a day separator where the date changes, and each message told whether it opens / closes a run
// of messages by the same sender (only the first shows the name, only the last the avatar).
export function layout(msgs, tz) {
  const out = [];
  msgs.forEach((m, i) => {
    const prev = msgs[i - 1], next = msgs[i + 1];
    const day = dayKey(m.created_at, tz);
    if (!prev || dayKey(prev.created_at, tz) !== day) out.push({ day, at: m.created_at });
    if (m.system) { out.push({ sys: m }); return; }   // "Ann added Bob": a line of its own, it breaks a run
    const joins = (a, b) => a && b && !a.system && !b.system && a.sender_id === b.sender_id && a.sender_name === b.sender_name && !a.deleted_at === !b.deleted_at
      && Math.abs(Date.parse(b.created_at) - Date.parse(a.created_at)) < RUN_GAP && dayKey(a.created_at, tz) === dayKey(b.created_at, tz);
    out.push({ msg: m, head: !joins(prev, m), tail: !joins(m, next) });
  });
  return out;
}

// "Seen" heads, Messenger-style: each other member sits under the last message they have read up to.
// Returns { messageId: [userId…] }; system notes and messages still being sent are never an anchor.
export function seenBy(msgs, members, me) {
  const out = {};
  const anchors = msgs.filter(m => !m.pending && !m.system);
  if (!anchors.length) return out;
  const cid = anchors[0].conversation_id;
  for (const mem of members) {
    if (mem.conversation_id !== cid || mem.user_id === me) continue;
    const at = Date.parse(mem.last_read_at);
    let last = null;
    for (const m of anchors) if (Date.parse(m.created_at) <= at) last = m; else break;
    if (last && last.sender_id !== mem.user_id) (out[last.id] ||= []).push(mem.user_id);   // a head under one's own message says nothing
  }
  return out;
}

// Who has read a message and who not yet (the other members), for the "Seen by" sheet
export function readers(msg, members, me) {
  const others = members.filter(m => m.conversation_id === msg.conversation_id && m.user_id !== me && m.user_id !== msg.sender_id);
  const seen = others.filter(m => Date.parse(m.last_read_at) >= Date.parse(msg.created_at)).sort((a, b) => Date.parse(b.last_read_at) - Date.parse(a.last_read_at));
  return { seen: seen.map(m => ({ user_id: m.user_id, at: m.last_read_at })), unseen: others.filter(m => !seen.includes(m)).map(m => m.user_id) };
}

// The sentence of a system note. `name(id)` gives a member's name; `t` translates.
export function systemText(sys, name, me, t) {
  const who = id => (id === me ? t('You') : name(id) || t('Former member'));
  const list = ids => (ids || []).map(who).join(', ');
  switch (sys?.type) {
    case 'created': return t('{a} created the group “{g}”', { a: who(sys.by), g: sys.title || '' });
    case 'added': return t('{a} added {b}', { a: who(sys.by), b: list(sys.users) });
    case 'removed': return t('{a} removed {b}', { a: who(sys.by), b: list(sys.users) });
    case 'left': return t('{a} left the group', { a: who(sys.by) });
    case 'renamed': return t('{a} renamed the group to “{g}”', { a: who(sys.by), g: sys.title || '' });
    case 'admin': return t('{b} is now the group admin', { b: list(sys.users) });
    case 'theme': return sys.title ? t('{a} changed the theme to {g}', { a: who(sys.by), g: t(sys.title) }) : t('{a} reset the theme', { a: who(sys.by) });
    case 'emoji': return sys.title ? t('{a} set the quick emoji to {g}', { a: who(sys.by), g: sys.title }) : t('{a} reset the quick emoji', { a: who(sys.by) });
    case 'nickname': {
      const u = (sys.users || [])[0], self = u === sys.by;
      if (!sys.title) return self ? t('{a} cleared their nickname', { a: who(sys.by) }) : t('{a} cleared the nickname of {b}', { a: who(sys.by), b: who(u) });
      return self ? t('{a} set their nickname to {g}', { a: who(sys.by), g: sys.title }) : t('{a} set the nickname of {b} to {g}', { a: who(sys.by), b: who(u), g: sys.title });
    }
    default: return '';
  }
}

// Ticks on my own message: 'sent' once the server has it, 'read' when every other member has read past it.
// In the gym room `readers` says how many have; in a direct conversation it is 0 or 1.
export function receipt(msg, members, me) {
  if (!msg || msg.system || msg.sender_id !== me || msg.deleted_at || msg.pending) return msg?.pending ? { state: 'pending', readers: 0, of: 0 } : null;
  const others = members.filter(m => m.conversation_id === msg.conversation_id && m.user_id !== me);
  const readers = others.filter(m => Date.parse(m.last_read_at) >= Date.parse(msg.created_at)).length;
  return { state: others.length && readers === others.length ? 'read' : 'sent', readers, of: others.length };
}

// Put a message (new, edited or deleted) into a list sorted by id, replacing an older copy of it.
// A message I just sent is shown at once with a temporary key; the saved copy takes its place.
export function mergeMessage(list, msg) {
  const out = list.filter(m => m.id !== msg.id && !(msg.client_key && m.client_key === msg.client_key));
  out.push(msg);
  return out.sort((a, b) => (a.pending ? Infinity : a.id) - (b.pending ? Infinity : b.id) || 0);
}

// Reactions of one message, grouped: [{ emoji, n, mine }]
export function reactionSummary(reactions, messageId, me) {
  const by = new Map();
  for (const r of reactions) if (r.message_id === messageId) {
    const g = by.get(r.emoji) || { emoji: r.emoji, n: 0, mine: false, users: [] };
    g.n++; g.users.push(r.user_id); if (r.user_id === me) g.mine = true;
    by.set(r.emoji, g);
  }
  return REACTIONS.filter(e => by.has(e)).map(e => by.get(e));
}

// Apply a live reaction event to the list of reactions
export function applyReaction(reactions, ev) {
  const rest = reactions.filter(r => !(r.message_id === ev.message_id && r.user_id === ev.user_id));
  return ev.emoji ? [...rest, { message_id: ev.message_id, user_id: ev.user_id, emoji: ev.emoji }] : rest;
}

// Text that is already HTML-escaped, with web addresses turned into links (they open in a new tab, without a referrer)
export function linkify(escaped) {
  return escaped.replace(/\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
}

// Size of a picture shrunk to fit a square of `max`, keeping its shape (never enlarged)
export function fitBox(w, h, max = MAX_SIDE) {
  const k = Math.min(1, max / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

// Can I still edit this message?
export const editable = (msg, me, now = Date.now()) => !!msg && msg.sender_id === me && !msg.deleted_at && !msg.pending && !msg.archived
  && now - Date.parse(msg.created_at) < EDIT_WINDOW;

// Total unread over the conversation list
export const unreadTotal = convs => convs.reduce((n, c) => n + (c.unread || 0), 0);

// ─── @mentions ───
// "@username" calls a member (usernames are unique and fixed); "@everyone" / "@all" calls the whole conversation. The
// database reads them from the text the same way (chat_mentions), so what is drawn here is what it counts.
export const EVERYONE = ['everyone', 'all'];
const MENTION = /(^|[^A-Za-z0-9_.@-])@([A-Za-z0-9_.-]{2,40})/g;
const tidyName = n => n.toLowerCase().replace(/[.-]+$/, '');
// The names called in a text: ['dan', 'everyone']
export const mentionNames = body => [...new Set([...String(body || '').matchAll(MENTION)].map(m => tidyName(m[2])))];
// The "@…" being typed just before the caret, if any: { start, q } (start is where the "@" is)
export function mentionQuery(text, caret = text.length) {
  const m = /(^|[^A-Za-z0-9_.@-])@([\p{L}\p{N}_.-]{0,40})$/u.exec(text.slice(0, caret));
  return m ? { start: m.index + m[1].length, q: m[2] } : null;
}
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
// Who to suggest for "@q": people whose username, name or nickname starts with it (or a word of it does), then those
// that only contain it; at most `max`. people: [{ id, username, name, nick }]
export function mentionMatches(people, q, max = 8) {
  const f = fold(q);
  const rank = p => {
    const keys = [p.username, p.name, p.nick].filter(Boolean).map(fold);
    if (!f) return 1;
    if (keys.some(k => k.startsWith(f))) return 0;
    if (keys.some(k => k.split(/[\s_.-]+/).some(w => w.startsWith(f)))) return 1;
    return keys.some(k => k.includes(f)) ? 2 : -1;
  };
  return people.map(p => [rank(p), p]).filter(([r]) => r >= 0)
    .sort((a, b) => a[0] - b[0] || fold(a[1].nick || a[1].name).localeCompare(fold(b[1].nick || b[1].name))).slice(0, max).map(([, p]) => p);
}
// Escaped (and linkified) HTML with each mention drawn as a chip; links are left alone. who(name) gives
// { id, label, me } for a member of the conversation, null otherwise (then the text stays as it is)
export function markMentions(html, who, everyoneOk = true) {
  return html.split(/(<a\b[^>]*>[\s\S]*?<\/a>)/).map((part, i) => (i % 2 ? part : part.replace(MENTION, (all, pre, name) => {
    const n = tidyName(name), rest = name.slice(n.length);
    if (EVERYONE.includes(n)) return everyoneOk ? `${pre}<span class="mention all">@${name.slice(0, n.length)}</span>${rest}` : all;
    const p = who(n);
    return p ? `${pre}<a class="mention ${p.me ? 'me' : ''}" href="#/member/${p.id}" title="@${n}">@${p.label}</a>${rest}` : all;
  }))).join('');
}
// Does this message call me? (the database's answer when it has one; an archived message is read from its text)
export const callsMe = (msg, me, myUsername) => !!msg && msg.sender_id !== me && !msg.deleted_at && !msg.system
  && (msg.mentions ? msg.mention_all || msg.mentions.includes(me) : mentionNames(msg.body).some(n => n === myUsername));
