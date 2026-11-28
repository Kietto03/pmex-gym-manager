/* ═══════════════════════════════════════════════════════════════
   Demo chat — the same methods as the chat part of api.js, in memory.
   A gym room with some history, a few direct conversations, and the
   other side of a direct conversation reads and answers what you send,
   so the live parts (ticks, typing, new messages) can be tried.
   ═══════════════════════════════════════════════════════════════ */
import { MAX_LEN, EDIT_WINDOW, REACTIONS, EVERYONE, mentionNames } from './chat.js';

export function demoChat({ me, profiles, seasons = () => [], staff, deny, t, clone, uid }) {
  const now = Date.now(), ago = min => new Date(now - min * 6e4).toISOString();
  const name = id => { const p = profiles().find(x => x.id === id); return p ? p.display_name || p.username : ''; };
  const convs = [{ id: 'c0000000-0000-4000-8000-000000000000', kind: 'gym', direct_key: null, created_at: ago(60 * 24 * 30), last_message_at: null }];
  const members = [], messages = [], reactions = [], media = {};
  const listeners = new Set();
  let nextId = 1;
  const emit = (event, payload, cid) => setTimeout(() => {
    for (const l of listeners) if (members.some(m => m.conversation_id === cid && m.user_id === l.me)) l.on.event(event, clone(payload));
  }, 0);
  const isMember = (cid, u = me()) => members.some(m => m.conversation_id === cid && m.user_id === u);
  const join = (cid, u, read = ago(60 * 24 * 30)) => { if (!isMember(cid, u)) members.push({ conversation_id: cid, user_id: u, joined_at: read, last_read_at: read }); };
  const gym = convs[0];
  // @mentions, read from the text as the database does (chat_mentions): members only, never the sender; @everyone in a
  // group by anyone, in the gym room and the battle channels by mods and the admin
  const mentionsOf = (cid, sender, body) => {
    const names = mentionNames(body), c = convs.find(x => x.id === cid), role = profiles().find(x => x.id === sender)?.role;
    return { mentions: profiles().filter(p => p.id !== sender && names.includes(p.username) && isMember(cid, p.id)).map(p => p.id),
      mention_all: names.some(n => EVERYONE.includes(n)) && (c?.kind === 'group' || (c?.kind !== 'direct' && ['admin', 'mod'].includes(role))) };
  };
  const post = (cid, sender, body, at, extra = {}) => {
    const m = { id: nextId++, conversation_id: cid, sender_id: sender, sender_name: name(sender), body, reply_to: null, attachment: null,
      created_at: at, edited_at: null, deleted_at: null, deleted_by: null, ...(extra.system ? { mentions: [], mention_all: false } : mentionsOf(cid, sender, body)), ...extra };
    messages.push(m);
    convs.find(c => c.id === cid).last_message_at = at;
    return m;
  };
  function direct(a, b) {
    const key = [a, b].sort().join(':');
    let c = convs.find(x => x.direct_key === key);
    if (!c) { c = { id: `c${String(convs.length).padStart(7, '0')}-0000-4000-8000-000000000000`, kind: 'direct', direct_key: key, created_at: new Date().toISOString(), last_message_at: null }; convs.push(c); }
    join(c.id, a, c.created_at); join(c.id, b, c.created_at);
    return c;
  }

  // Sample history: the gym room over the last two days, and a couple of direct conversations
  for (const p of profiles()) join(gym.id, p.id, ago(90));
  const u = n => uid(n);
  [[u(1), 'Morning everyone! New Gym Battle opens tonight, plan is up on the Plan page.', 60 * 26],
    [u(2), 'Thanks! I will take the Fire leader again.', 60 * 26 - 3],
    [u(5), 'Can someone check my grid for Cynthia? Not sure about the speed tiles.', 60 * 20],
    [u(3), 'Sure, share it with the gym and I will look tonight.', 60 * 20 - 4],
    [u(7), 'Round 2 is done for me, 3 tickets left.', 60 * 5],
    [u(1), 'Nice work. Remember to log every run, even the bad ones.', 60 * 4],
    [u(4), 'Got it 👍', 60 * 4 - 1], [u(4), 'Who has a spare Rebuff pair for the Water leader?', 60 * 4 - 2],
    [u(2), 'Me, Kahili works well there.', 50]].forEach(([s, b, m]) => post(gym.id, s, b, ago(m)));
  reactions.push({ message_id: 6, user_id: u(4), emoji: '👍', created_at: ago(200) }, { message_id: 6, user_id: u(7), emoji: '👍', created_at: ago(200) },
    { message_id: 9, user_id: u(4), emoji: '🙏', created_at: ago(40) });
  // Groups: the one who made it manages it; what happens is told by system notes, as in the database
  const sysPost = (cid, by, system) => post(cid, by, '', new Date().toISOString(), { system });
  const emitTo = (users, cid) => setTimeout(() => { for (const l of listeners) if (users.includes(l.me)) l.on.event('conversation', { conversation_id: cid }); }, 0);
  const groupOf = (cid, adminOnly) => {
    const c = convs.find(x => x.id === cid);
    if (!c || c.kind !== 'group' || !isMember(cid)) deny(t('Not allowed.'));
    if (adminOnly && c.created_by !== me()) deny(t('Only the group admin can do that.'));
    return c;
  };
  const people = ids => [...new Set(ids || [])].filter(id => profiles().some(p => p.id === id));
  const groupMembers = cid => members.filter(m => m.conversation_id === cid).map(m => m.user_id);
  function makeGroup(by, title, users, at) {
    const c = { id: `g${String(convs.length).padStart(7, '0')}-0000-4000-8000-000000000000`, kind: 'group', direct_key: null, title, created_by: by, created_at: at, last_message_at: null };
    convs.push(c);
    for (const id of [by, ...users]) join(c.id, id, at);
    post(c.id, by, '', at, { system: { type: 'created', by, title, users } });
    return c;
  }
  const raid = makeGroup(u(1), 'Raid squad', [u(2), u(4), u(7)], ago(60 * 30));
  post(raid.id, u(2), 'Water leader at 21:00 tonight?', ago(60 * 29));
  post(raid.id, u(7), 'I am in, bringing Kahili.', ago(60 * 28));

  const d1 = direct(u(1), u(4)), d2 = direct(u(2), u(4)), d3 = direct(u(4), u(6));
  post(d1.id, u(4), 'Hi! Could you add me to the Fire squad this season?', ago(300));
  post(d1.id, u(1), 'Done, you are on the plan.', ago(290));
  post(d2.id, u(2), 'Your EX Role Kahili is ready, nice!', ago(120));
  post(d3.id, u(6), 'Thanks for the help with the tower yesterday', ago(30));
  for (const m of members) if (m.conversation_id === gym.id && ![u(1), u(2), u(3)].includes(m.user_id)) m.last_read_at = ago(60 * 5);
  for (const m of members) if (m.conversation_id === gym.id && [u(1), u(2), u(3)].includes(m.user_id)) m.last_read_at = ago(60 * 22);

  // Gym Battle channels, as the database makes them: for every battle a general channel (stage 0) and one per leader,
  // everyone in them; they follow the battle's leaders and go when it is deleted
  function syncBattles(tell = false) {
    let changed = false;
    for (let i = convs.length - 1; i >= 0; i--) {
      const c = convs[i];
      if (c.kind === 'battle' && !seasons().some(x => x.id === c.season_id)) {
        convs.splice(i, 1); changed = true;
        for (let k = members.length - 1; k >= 0; k--) if (members[k].conversation_id === c.id) members.splice(k, 1);
        for (let k = messages.length - 1; k >= 0; k--) if (messages[k].conversation_id === c.id) messages.splice(k, 1);
      }
    }
    for (const s of seasons()) {
      const n = Math.min((s.leaders || []).length, 20);
      for (let i = 0; i <= n; i++) {
        const title = i === 0 ? null : s.leaders[i - 1]?.name || null;
        let c = convs.find(x => x.kind === 'battle' && x.season_id === s.id && x.stage === i);
        if (!c) {
          c = { id: `b${String(s.id).padStart(3, '0')}${String(i).padStart(4, '0')}-0000-4000-8000-000000000000`, kind: 'battle', season_id: s.id, stage: i, title, created_at: new Date(now - 864e5 * 3).toISOString(), last_message_at: null };
          convs.push(c); changed = true;
          for (const p of profiles()) join(c.id, p.id, c.created_at);
        } else c.title = title;
      }
    }
    if (changed && tell) emitTo(profiles().map(p => p.id), null);
  }
  syncBattles();
  // A little talk in the active battle's channels
  const live = seasons().find(s => s.is_active) || seasons()[0];
  if (live) {
    const ch = st => convs.find(c => c.kind === 'battle' && c.season_id === live.id && c.stage === st)?.id;
    const lead = live.leaders?.[0]?.name || 'the first leader', lead2 = live.leaders?.[1]?.name || 'stage 2';
    if (ch(0)) {
      post(ch(0), u(1), '@everyone Battle plan: clear every stage on Regular first, then push Extra Battles together from day 3.', ago(60 * 40));
      post(ch(0), u(3), 'Should we save tickets for the weekend?', ago(60 * 39));
      post(ch(0), u(1), 'Keep at least 6 for Sunday, the bonus round pays more.', ago(60 * 38));
    }
    if (ch(1)) {
      post(ch(1), u(2), `${lead}: open with a Rebuff pair, the counter hits hard after turn 3.`, ago(60 * 30));
      post(ch(1), u(5), 'Cleared it with that, 120k on the first try.', ago(60 * 3));
    }
    if (ch(2)) post(ch(2), u(7), `Anyone beat ${lead2} without a Facilitator?`, ago(90));
    for (const m of members) if (convs.find(c => c.id === m.conversation_id)?.kind === 'battle') m.last_read_at = ago(60 * 35);
  }

  const mine = () => convs.filter(c => isMember(c.id));
  const mustMember = cid => isMember(cid) || deny(t('Not allowed.'));
  const customOf = cid => {
    const c = convs.find(x => x.id === cid);
    if (!c || !isMember(cid)) deny(t('Not allowed.'));
    if (!['direct', 'group'].includes(c.kind) && !staff()) deny(t('Only mods and the admin can customize this conversation.'));
    return c;
  };
  const setCustom = (cid, key, v) => {
    const c = customOf(cid);
    if ((c[key] || null) === v) return;
    c[key] = v;
    emit('message', sysPost(cid, me(), { type: key, by: me(), title: v }), cid);
    emitTo(groupMembers(cid), cid);
  };
  const sentRecently = () => messages.filter(m => m.sender_id === me() && !m.system && Date.now() - Date.parse(m.created_at) < 1e4).length;

  // The other side of a direct conversation reads what you send, types, and sometimes answers
  const REPLIES = ['Sounds good!', 'On it 👍', 'Thanks!', 'Let me check and get back to you.', 'Nice one'];
  function playOtherSide(cid) {
    const c = convs.find(x => x.id === cid);
    if (c.kind === 'gym' || c.kind === 'battle') return;
    const others = members.filter(m => m.conversation_id === cid && m.user_id !== me()).map(m => m.user_id);
    const other = others[messages.length % Math.max(1, others.length)];   // in a group, someone answers
    if (!other) return;
    setTimeout(() => {
      const mem = members.find(m => m.conversation_id === cid && m.user_id === other);
      mem.last_read_at = new Date().toISOString();
      emit('read', { conversation_id: cid, user_id: other, last_read_at: mem.last_read_at }, cid);
    }, 1200);
    setTimeout(() => { for (const l of listeners) l.on.typing?.(cid, other); }, 2000);
    setTimeout(() => emit('message', post(cid, other, REPLIES[messages.length % REPLIES.length], new Date().toISOString()), cid), 3800);
  }

  // ─── The archive, as in the database: past the live limit the oldest messages (not the newest keep_recent of a
  // conversation) are packed into batches; past the archive budget the oldest batches are dropped ───
  const MB = 1048576;
  const settings = { live_limit_mb: 40, live_target_mb: 30, keep_recent: 200, archive_after_days: 0, archive_limit_mb: 20, hard_limit_mb: 80, updated_at: ago(0), updated_by: null };
  const archive = [];
  let nextBatch = 1, lastRun = null;
  const liveBytes = () => JSON.stringify(messages).length + JSON.stringify(reactions).length;
  const archBytes = () => archive.reduce((n, a) => n + a.bytes, 0);
  function packBatch(olderThan) {
    const seen = {}, rank = new Map();   // 1 = newest of its conversation
    for (const m of [...messages].sort((a, b) => b.id - a.id)) rank.set(m.id, (seen[m.conversation_id] = (seen[m.conversation_id] || 0) + 1));
    const pick = messages.filter(m => rank.get(m.id) > settings.keep_recent && (!olderThan || Date.parse(m.created_at) < olderThan)).sort((a, b) => a.id - b.id).slice(0, 500);
    if (!pick.length) return 0;
    const groups = {};
    for (const m of pick) (groups[m.conversation_id] ||= []).push(m);
    for (const [cid, list] of Object.entries(groups)) {
      const kept = list.filter(m => !m.deleted_at).map(m => ({ ...clone(m), archived: true, reactions: reactions.filter(r => r.message_id === m.id).map(r => [r.user_id, r.emoji]) }));
      if (!kept.length) continue;
      const raw = JSON.stringify(kept).length;
      archive.push({ id: nextBatch++, conversation_id: cid, first_id: list[0].id, last_id: list.at(-1).id, first_at: list[0].created_at, last_at: list.at(-1).created_at,
        n: kept.length, data: kept, raw, bytes: Math.round(raw * 0.35) + 64 });   // about what compression gives on chat text
    }
    const gone = new Set(pick.map(m => m.id));
    for (let i = messages.length - 1; i >= 0; i--) if (gone.has(messages[i].id)) messages.splice(i, 1);
    for (let i = reactions.length - 1; i >= 0; i--) if (gone.has(reactions[i].message_id)) reactions.splice(i, 1);
    return pick.length;
  }
  function maintain() {
    let moved = 0, pruned = 0, dropped = 0, n;
    if (settings.archive_after_days > 0) while ((n = packBatch(Date.now() - settings.archive_after_days * 864e5))) moved += n;
    if (liveBytes() > settings.live_limit_mb * MB) while (liveBytes() > settings.live_target_mb * MB && (n = packBatch(null))) moved += n;
    archive.sort((a, b) => Date.parse(a.last_at) - Date.parse(b.last_at) || a.id - b.id);
    while (archBytes() > settings.archive_limit_mb * MB && archive.length) { const a = archive.shift(); pruned++; dropped += a.n; }
    lastRun = { at: new Date().toISOString(), result: { archived: moved, dropped_batches: pruned, dropped_messages: dropped, live_bytes: liveBytes(), archive_bytes: archBytes() } };
    return clone(lastRun.result);
  }
  const inArchive = (cid, id) => archive.some(a => a.conversation_id === cid && id >= a.first_id && id <= a.last_id);

  return {
    syncBattles,
    async chatOverview() {
      if (profiles().some(p => p.id === me())) for (const c of convs) if (c.kind === 'gym' || c.kind === 'battle') join(c.id, me(), new Date().toISOString());   // an account made during the visit joins too
      return mine().map(c => {
        const my = members.find(m => m.conversation_id === c.id && m.user_id === me());
        const list = messages.filter(m => m.conversation_id === c.id), last = list.at(-1);
        return { id: c.id, kind: c.kind, created_at: c.created_at, last_message_at: c.last_message_at, last_read_at: my.last_read_at,
          other_id: c.kind === 'direct' ? members.find(m => m.conversation_id === c.id && m.user_id !== me())?.user_id || null : null,
          unread: list.filter(m => m.sender_id !== me() && !m.deleted_at && !m.system && Date.parse(m.created_at) > Date.parse(my.last_read_at)).length,
          mentioned: list.filter(m => m.sender_id !== me() && !m.deleted_at && Date.parse(m.created_at) > Date.parse(my.last_read_at) && (m.mention_all || m.mentions?.includes(me()))).length,
          title: c.title || null, created_by: c.created_by || null, theme: c.theme || null, emoji: c.emoji || null, members: groupMembers(c.id).length, season_id: c.season_id ?? null, stage: c.stage ?? null,
          last: last ? { id: last.id, sender_id: last.sender_id, sender_name: last.sender_name, body: last.body.slice(0, 140), picture: !!last.attachment, deleted_at: last.deleted_at, created_at: last.created_at, system: last.system || null } : null,
          archived: archive.filter(a => a.conversation_id === c.id).reduce((n, a) => n + a.n, 0) };
      }).sort((a, b) => Date.parse(b.last_message_at || b.created_at) - Date.parse(a.last_message_at || a.created_at));
    },
    chatMembers: async () => clone(members.filter(m => isMember(m.conversation_id))),
    async chatMessages(cid, beforeId = null, page = 50) {
      mustMember(cid);
      return clone(messages.filter(m => m.conversation_id === cid && (!beforeId || m.id < beforeId)).slice(-page));
    },
    chatReactions: async ids => clone(reactions.filter(r => ids.includes(r.message_id) && isMember(messages.find(m => m.id === r.message_id)?.conversation_id))),
    async chatSend(row) {
      mustMember(row.conversation_id);
      const body = String(row.body || '').trim();
      if (!body && !row.attachment) deny(t('A message needs text or a picture.'));
      if (body.length > MAX_LEN) deny(t('Not allowed.'));
      if (sentRecently() >= 8) deny(t('Slow down: too many messages at once.'));
      if (row.reply_to && messages.find(m => m.id === row.reply_to)?.conversation_id !== row.conversation_id && !inArchive(row.conversation_id, row.reply_to)) deny(t('The message you reply to is not in this conversation.'));
      if (liveBytes() > settings.live_limit_mb * MB) maintain();
      if (liveBytes() + archBytes() > settings.hard_limit_mb * MB) deny(t('The chat is full. Ask the admin to clear old messages.'));
      const m = post(row.conversation_id, me(), body, new Date().toISOString(), { reply_to: row.reply_to || null, attachment: row.attachment || null });
      emit('message', m, m.conversation_id);
      playOtherSide(m.conversation_id);
      return clone(m);
    },
    async chatEdit(id, body) {
      const m = messages.find(x => x.id === id);
      if (!m || !isMember(m.conversation_id)) deny();
      if (m.deleted_at) deny(t('This message was deleted.'));
      if (m.sender_id !== me()) deny(t('Only the sender can edit a message.'));
      if (Date.now() - Date.parse(m.created_at) > EDIT_WINDOW) deny(t('A message can only be edited in the first 15 minutes.'));
      body = String(body).trim();
      if (!body && !m.attachment) deny(t('A message needs text or a picture.'));
      if (body !== m.body) Object.assign(m, { body, edited_at: new Date().toISOString() }, mentionsOf(m.conversation_id, m.sender_id, body));
      emit('message_update', m, m.conversation_id);
      return clone(m);
    },
    async chatDelete(id) {
      const m = messages.find(x => x.id === id);
      if (!m || !isMember(m.conversation_id)) deny();
      if (m.sender_id !== me() && !staff()) deny();
      Object.assign(m, { deleted_at: new Date().toISOString(), deleted_by: me(), body: '', attachment: null, mentions: [], mention_all: false });
      emit('message_update', m, m.conversation_id);
      return clone(m);
    },
    async chatReact(message_id, user_id, emoji) {
      const m = messages.find(x => x.id === message_id);
      if (!m || !isMember(m.conversation_id) || user_id !== me()) deny();
      if (emoji && !REACTIONS.includes(emoji)) deny();
      if (m.deleted_at || m.system) deny(t('This message was deleted.'));
      const i = reactions.findIndex(r => r.message_id === message_id && r.user_id === user_id);
      if (i >= 0) reactions.splice(i, 1);
      if (emoji) reactions.push({ message_id, user_id, emoji, created_at: new Date().toISOString() });
      emit('reaction', { conversation_id: m.conversation_id, message_id, user_id, emoji: emoji || null }, m.conversation_id);
    },
    async chatRead(cid, user_id) {
      const mem = members.find(m => m.conversation_id === cid && m.user_id === user_id && user_id === me());
      if (!mem) return;
      mem.last_read_at = new Date(Math.max(Date.parse(mem.last_read_at), Date.now())).toISOString();
      emit('read', { conversation_id: cid, user_id, last_read_at: mem.last_read_at }, cid);
    },
    // Translation, as the Edge Function answers it: the language is guessed from the letters, the "translation" is marked
    async chatTranslate(ids, to) {
      const out = {};
      for (const id of ids) {
        const m = messages.find(x => x.id === id);
        if (!m || !isMember(m.conversation_id) || m.deleted_at || m.system || !/\p{L}/u.test(m.body || '')) continue;
        const from = /[\u3040-\u30ff\u4e00-\u9fff]/.test(m.body) ? 'ja' : /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(m.body) ? 'vi' : /[¿¡ñ]/i.test(m.body) ? 'es' : 'en';
        out[id] = { from, text: from === to ? null : `[${to}] ${m.body}` };
      }
      await new Promise(r => setTimeout(r, 150));
      return clone(out);
    },
    async chatOpenDirect(other) {
      if (!other || other === me() || !profiles().some(p => p.id === other)) deny(t('Pick a member.'));
      return direct(me(), other).id;
    },
    async chatCreateGroup(title, users) {
      title = String(title || '').trim();
      if (!title || title.length > 60) deny(t('Give the group a name (up to 60 characters).'));
      const list = people(users).filter(id => id !== me());
      if (!list.length) deny(t('Pick at least one member for the group.'));
      if (list.length > 49) deny(t('A group has at most 50 members.'));
      const c = makeGroup(me(), title, list, new Date().toISOString());
      emitTo([me(), ...list], c.id);
      return c.id;
    },
    async chatAddMembers(cid, users) {
      groupOf(cid, true);
      const add = people(users).filter(id => !isMember(cid, id));
      if (!add.length) return 0;
      for (const id of add) join(cid, id, new Date().toISOString());
      emit('message', sysPost(cid, me(), { type: 'added', by: me(), users: add }), cid);
      emitTo(groupMembers(cid), cid);
      return add.length;
    },
    async chatRemoveMember(cid, user) {
      groupOf(cid, true);
      if (user === me()) deny(t('Use “Leave the group” to leave it.'));
      const i = members.findIndex(m => m.conversation_id === cid && m.user_id === user);
      if (i < 0) deny(t('That person is not in the group.'));
      members.splice(i, 1);
      emit('message', sysPost(cid, me(), { type: 'removed', by: me(), users: [user] }), cid);
      emitTo([user, ...groupMembers(cid)], cid);
    },
    async chatLeaveGroup(cid) {
      const c = groupOf(cid, false);
      members.splice(members.findIndex(m => m.conversation_id === cid && m.user_id === me()), 1);
      const left = groupMembers(cid);
      if (!left.length) { convs.splice(convs.indexOf(c), 1); emitTo([me()], cid); return; }
      emit('message', sysPost(cid, me(), { type: 'left', by: me() }), cid);
      if (c.created_by === me()) {
        c.created_by = members.filter(m => m.conversation_id === cid).sort((a, b) => Date.parse(a.joined_at) - Date.parse(b.joined_at))[0].user_id;
        emit('message', sysPost(cid, me(), { type: 'admin', by: me(), users: [c.created_by] }), cid);
      }
      emitTo([me(), ...left], cid);
    },
    async chatRenameGroup(cid, title) {
      const c = groupOf(cid, true);
      title = String(title || '').trim();
      if (!title || title.length > 60) deny(t('Give the group a name (up to 60 characters).'));
      c.title = title;
      emit('message', sysPost(cid, me(), { type: 'renamed', by: me(), title }), cid);
      emitTo(groupMembers(cid), cid);
    },
    // Customizing: in a direct conversation or a group anyone in it, elsewhere mods and the admin; nicknames only in
    // direct conversations and groups
    async chatSetTheme(cid, theme) { setCustom(cid, 'theme', theme || null); },
    async chatSetEmoji(cid, emoji) {
      emoji = String(emoji || '').trim() || null;
      if (emoji && (emoji.length > 16 || /\s/.test(emoji))) deny(t('Not allowed.'));
      setCustom(cid, 'emoji', emoji);
    },
    async chatSetNickname(cid, user, nick) {
      const c = customOf(cid);
      if (!['direct', 'group'].includes(c.kind)) deny(t('Nicknames are for direct conversations and groups.'));
      const row = members.find(m => m.conversation_id === cid && m.user_id === user) || deny(t('That member is not in this conversation.'));
      nick = String(nick || '').trim().slice(0, 40) || null;
      if ((row.nickname || null) === nick) return;
      row.nickname = nick;
      emit('message', sysPost(cid, me(), { type: 'nickname', by: me(), users: [user], title: nick }), cid);
      emitTo(groupMembers(cid), cid);
    },
    async chatSearch(cid, q) {
      mustMember(cid);
      const w = String(q).toLowerCase();
      return clone(messages.filter(m => m.conversation_id === cid && !m.deleted_at && !m.system && m.body.toLowerCase().includes(w)).reverse().slice(0, 40));
    },
    async chatPictures(cid) {
      mustMember(cid);
      return clone(messages.filter(m => m.conversation_id === cid && !m.deleted_at && m.attachment).reverse().slice(0, 60));
    },
    async chatArchived(cid, beforeId = null) {
      mustMember(cid);
      const batch = archive.filter(a => a.conversation_id === cid && (!beforeId || a.last_id < beforeId)).sort((a, b) => b.last_id - a.last_id)[0];
      return batch ? clone(batch.data) : [];
    },
    async chatUsage() {
      staff() || deny();
      return { live_bytes: liveBytes(), archive_bytes: archBytes(), live_messages: messages.length, archive_messages: archive.reduce((n, a) => n + a.n, 0),
        archive_batches: archive.length, archive_raw_bytes: archive.reduce((n, a) => n + a.raw, 0), oldest_archived: archive.map(a => a.first_at).sort()[0] || null,
        disk_bytes: (liveBytes() + archBytes()) * 2, cron: true, last_run_at: lastRun?.at || null, last_result: lastRun?.result || null, settings: clone(settings) };
    },
    async chatSaveSettings(patch) {
      if (profiles().find(p => p.id === me())?.role !== 'admin') deny(t('Only the admin can run the chat archive.'));
      const next = { ...settings, ...patch };
      if (!(next.live_target_mb < next.live_limit_mb) || next.hard_limit_mb < next.live_limit_mb || [next.live_limit_mb, next.live_target_mb, next.archive_limit_mb, next.hard_limit_mb].some(v => !(v > 0))) deny(t('Not allowed.'));
      Object.assign(settings, next, { updated_at: new Date().toISOString(), updated_by: me() });
      return clone(settings);
    },
    async chatArchiveNow() {
      if (profiles().find(p => p.id === me())?.role !== 'admin') deny(t('Only the admin can run the chat archive.'));
      return maintain();
    },
    async chatUpload(cid, who, blob) {
      mustMember(cid);
      const ext = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[blob.type] || 'jpg';
      const path = `${cid}/${who}/${crypto.randomUUID()}.${ext}`;
      media[path] = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
      return path;
    },
    chatMediaUrls: async paths => Object.fromEntries(paths.filter(p => media[p]).map(p => [p, media[p]])),
    chatRemoveMedia: async path => { delete media[path]; },
    async chatConnect(who, on) {
      const l = { me: who, on };
      listeners.add(l);
      setTimeout(() => { on.status?.('SUBSCRIBED'); on.presence([who, uid(2), uid(4), uid(7)]); }, 0);
      return { watch() {}, typing() {}, close() { listeners.delete(l); } };
    },
  };
}
