/* ═══════════════════════════════════════════════════════════════
   Data access. One interface, two backends:
   · Supabase (config.js filled in)  — the real gym database
   · Demo (no config, or ?demo)      — in-memory sample data, nothing saved
   Every method returns plain rows and throws Error(message) on failure.
   ═══════════════════════════════════════════════════════════════ */
import { t } from './i18n.js';

const CFG = window.GYM_CONFIG || {};
export const isDemo = !CFG.supabaseUrl || !CFG.supabaseAnonKey || new URLSearchParams(location.search).has('demo');
const DOMAIN = CFG.usernameDomain || 'members.pmex-gym.local';

export async function createApi() {
  if (isDemo) {
    const { createDemoApi } = await import('./demo.js');
    return createDemoApi();
  }
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  return supabaseApi(createClient(CFG.supabaseUrl, CFG.supabaseAnonKey));
}

function supabaseApi(sb) {
  const ok = ({ data, error }) => {
    if (error) throw new Error(error.message || String(error));
    return data;
  };
  // Supabase returns at most 1000 rows per request and cuts the rest off silently — and an edited row
  // moves to the end of an unordered table, so it was the row you just changed that went missing.
  // Every list that can grow past that is read page by page, in a fixed order.
  const PAGE = 1000;
  const all = async build => {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const page = ok(await build().range(from, from + PAGE - 1));
      rows.push(...page);
      if (page.length < PAGE) return rows;
    }
  };

  return {
    mode: 'supabase',

    // ─── Session ───
    async session() {
      const { data } = await sb.auth.getSession();
      return data.session ? data.session.user.id : null;
    },
    async signIn(username, password) {
      const { error } = await sb.auth.signInWithPassword({ email: `${username.trim().toLowerCase()}@${DOMAIN}`, password });
      if (error) throw new Error(/invalid/i.test(error.message) ? t('Wrong username or password.') : error.message);
    },
    async signOut() { await sb.auth.signOut(); },
    async changePassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw new Error(error.message);
    },

    // ─── Accounts (admin, via the Edge Function) ───
    async adminUsers(body) {
      const { data, error } = await sb.functions.invoke('admin-users', { body });
      if (error) {
        let msg = error.message;
        try { msg = (await error.context.json()).error || msg; } catch { /* keep generic */ }
        throw new Error(msg);
      }
      return data;
    },

    // ─── Tables ───
    profiles: async () => ok(await sb.from('profiles').select('*').order('display_name')),
    updateProfile: async (id, patch) => ok(await sb.from('profiles').update(patch).eq('id', id).select().single()),

    // Profile photo: a square image in the public avatars bucket, one folder per member
    async uploadAvatar(id, blob) {
      const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${id}/avatar-${Date.now()}.${ext}`;
      const up = await sb.storage.from('avatars').upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
      if (up.error) throw new Error(up.error.message);
      const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      ok(await sb.from('profiles').update({ avatar_url: url }).eq('id', id).select().single());
      const { data: files } = await sb.storage.from('avatars').list(id);
      const old = (files || []).map(f => `${id}/${f.name}`).filter(p => p !== path);
      if (old.length) await sb.storage.from('avatars').remove(old);   // best effort: keep only the newest
      return url;
    },
    async removeAvatar(id) {
      ok(await sb.from('profiles').update({ avatar_url: '' }).eq('id', id).select().single());
      const { data: files } = await sb.storage.from('avatars').list(id);
      if (files?.length) await sb.storage.from('avatars').remove(files.map(f => `${id}/${f.name}`));
    },

    catalogCount: async () => (await sb.from('pair_catalog').select('id', { count: 'exact', head: true })).count || 0,
    async syncCatalog(rows) {
      for (let i = 0; i < rows.length; i += 200) ok(await sb.from('pair_catalog').upsert(rows.slice(i, i + 200)));
    },

    memberPairs: () => all(() => sb.from('member_pairs').select('*').order('user_id').order('pair_id')),
    upsertMemberPair: async row => ok(await sb.from('member_pairs').upsert(row).select().single()),
    async upsertMemberPairs(rows) {   // many at once (backup import); each row is checked by the same database rules
      for (let i = 0; i < rows.length; i += 150) ok(await sb.from('member_pairs').upsert(rows.slice(i, i + 150)));
    },
    async deleteMemberPairs(user_id, pair_ids) {
      for (let i = 0; i < pair_ids.length; i += 100) ok(await sb.from('member_pairs').delete().eq('user_id', user_id).in('pair_id', pair_ids.slice(i, i + 100)));
    },
    deleteMemberPair: async (user_id, pair_id) => ok(await sb.from('member_pairs').delete().match({ user_id, pair_id })),

    tower: () => all(() => sb.from('tower_progress').select('*').order('user_id').order('type')),
    upsertTower: async row => ok(await sb.from('tower_progress').upsert(row).select().single()),

    seasons: async () => ok(await sb.from('seasons').select('*').order('battle_start', { ascending: false })),
    // Seasons come from the game: the database makes them from the datamine (sync_seasons, hourly and on demand);
    // staff change only the target score and the written rules
    syncSeasons: async () => ok(await sb.rpc('sync_seasons')),
    updateSeason: async (id, patch) => ok(await sb.from('seasons').update(patch).eq('id', id).select().single()),

    seasonMembers: async sid => ok(await sb.from('season_members').select('*').eq('season_id', sid)),
    setSeasonRole: async (season_id, user_id, patch) => ok(await sb.from('season_members').upsert({ season_id, user_id, ...patch })),
    setSeasonRoles: async rows => ok(await sb.from('season_members').upsert(rows)),
    setBanned: async (season_id, user_id, banned) => ok(await sb.from('season_members').upsert({ season_id, user_id, banned })),

    runs: sid => all(() => sb.from('runs').select('*').eq('season_id', sid).order('occurred_at', { ascending: false }).order('id', { ascending: false })),
    createRun: async row => ok(await sb.from('runs').insert(row).select().single()),
    updateRun: async (id, patch) => ok(await sb.from('runs').update(patch).eq('id', id).select().single()),
    deleteRun: async id => ok(await sb.from('runs').delete().eq('id', id)),

    assignments: sid => all(() => sb.from('assignments').select('*').eq('season_id', sid).order('leader').order('user_id')),
    saveAssignment: async row => ok(await sb.from('assignments').upsert(row)),   // merges: only the given columns change
    removeAssignment: async (season_id, leader, user_id) => ok(await sb.from('assignments').delete().match({ season_id, leader, user_id })),

    sheet: () => all(() => sb.from('roster_sheet').select('*').order('user_id').order('type').order('slot')),
    saveSheetCell: async row => ok(await sb.from('roster_sheet').upsert(row)),
    saveSheetCells: async rows => ok(await sb.from('roster_sheet').upsert(rows)),
    clearSheetCell: async (user_id, type, slot) => ok(await sb.from('roster_sheet').delete().match({ user_id, type, slot })),

    results: sid => all(() => sb.from('season_results').select('*').eq('season_id', sid).order('points', { ascending: false, nullsFirst: false })),

    resources: () => all(() => sb.from('resource_links').select('*').order('category').order('title')),
    saveResource: async ({ id, ...patch }) => ok(id ? await sb.from('resource_links').update(patch).eq('id', id) : await sb.from('resource_links').insert(patch)),
    deleteResource: async id => ok(await sb.from('resource_links').delete().eq('id', id)),

    strategies: async () => {
      const [strategies, revisions] = await Promise.all([all(() => sb.from('strategies').select('*').order('id')), all(() => sb.from('strategy_revisions').select('*').order('strategy_id').order('rev_no'))]);
      return { strategies, revisions };
    },
    createStrategy: async (mode, created_by, rev) => {
      const st = ok(await sb.from('strategies').insert({ mode, created_by }).select().single());
      ok(await sb.from('strategy_revisions').insert({ ...rev, strategy_id: st.id }));
      return st;
    },
    addRevision: async (strategy_id, rev) => ok(await sb.from('strategy_revisions').insert({ ...rev, strategy_id }).select().single()),
    saveRevision: async (id, patch) => ok(await sb.from('strategy_revisions').update(patch).eq('id', id).select().single()),
    deleteRevision: async id => ok(await sb.from('strategy_revisions').delete().eq('id', id)),
    archiveStrategy: async (id, archived) => ok(await sb.from('strategies').update({ archived }).eq('id', id)),

    runReviews: () => all(() => sb.from('run_reviews').select('*').order('run_id')),
    saveRunReview: async row => ok(await sb.from('run_reviews').upsert(row)),
    deleteRunReview: async run_id => ok(await sb.from('run_reviews').delete().eq('run_id', run_id)),
    gems: async () => {
      const [settings, events, rewards] = await Promise.all([sb.from('gem_settings').select('*').maybeSingle(), all(() => sb.from('gem_events').select('*').order('start_date')), all(() => sb.from('gem_rewards').select('*').order('start_date'))]);
      return { settings: ok(settings) || { reset_timezone: 'UTC', reset_hour: 0 }, events, rewards };
    },
    saveGemReward: async ({ id, ...patch }) => ok(id ? await sb.from('gem_rewards').update(patch).eq('id', id) : await sb.from('gem_rewards').insert(patch)),
    deleteGemReward: async id => ok(await sb.from('gem_rewards').delete().eq('id', id)),
    saveGemEvent: async ({ id, ...patch }) => ok(id ? await sb.from('gem_events').update(patch).eq('id', id) : await sb.from('gem_events').insert(patch)),
    deleteGemEvent: async id => ok(await sb.from('gem_events').delete().eq('id', id)),
    saveGemSettings: async patch => ok(await sb.from('gem_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1)),

    gridBuilds: () => all(() => sb.from('grid_builds').select('*').order('updated_at', { ascending: false })),
    saveGridBuild: async ({ id, ...patch }) => ok(id ? await sb.from('grid_builds').update(patch).eq('id', id).select().single() : await sb.from('grid_builds').insert(patch).select().single()),
    sharedGrid: async token => ok(await sb.rpc('shared_grid', { p_token: token })),   // a grid shared with anyone who has the link: reachable signed out
    deleteGridBuild: async id => ok(await sb.from('grid_builds').delete().eq('id', id)),

    facilitators: sid => all(() => sb.from('facilitator_plans').select('*').eq('season_id', sid).order('leader').order('user_id')),
    saveFacilitator: async row => ok(await sb.from('facilitator_plans').upsert(row)),
    removeFacilitator: async (season_id, leader, user_id) => ok(await sb.from('facilitator_plans').delete().match({ season_id, leader, user_id })),

    notes: async sid => ok(await sb.from('leader_notes').select('*').eq('season_id', sid)),
    saveNote: async row => ok(await sb.from('leader_notes').upsert(row)),

    activity: async () => ok(await sb.from('activity').select('*').order('at', { ascending: false }).limit(200)),

    // ─── Chat (see supabase/migrations/20261123000000_chat.sql) ───
    chatOverview: async () => ok(await sb.rpc('chat_overview')),
    chatMembers: () => all(() => sb.from('chat_members').select('*').order('conversation_id').order('user_id')),
    // The newest PAGE messages, or the PAGE before `beforeId`; oldest first
    async chatMessages(cid, beforeId = null, page = 50) {
      let q = sb.from('chat_messages').select('*').eq('conversation_id', cid).order('id', { ascending: false }).limit(page);
      if (beforeId) q = q.lt('id', beforeId);
      return ok(await q).reverse();
    },
    chatReactions: async ids => (ids.length ? ok(await sb.from('chat_reactions').select('*').in('message_id', ids)) : []),
    chatSend: async row => ok(await sb.from('chat_messages').insert(row).select().single()),
    chatEdit: async (id, body) => ok(await sb.from('chat_messages').update({ body }).eq('id', id).select().single()),
    chatDelete: async id => ok(await sb.from('chat_messages').update({ deleted_at: new Date().toISOString() }).eq('id', id).select().single()),
    chatReact: async (message_id, user_id, emoji) => ok(emoji
      ? await sb.from('chat_reactions').upsert({ message_id, user_id, emoji })
      : await sb.from('chat_reactions').delete().match({ message_id, user_id })),
    chatRead: async (cid, user_id) => ok(await sb.from('chat_members').update({ last_read_at: new Date().toISOString() }).match({ conversation_id: cid, user_id })),
    // Messages in the reader's language (Edge Function chat-translate): { [id]: { from, text } }, text null = already in it
    async chatTranslate(ids, to) {
      const { data, error } = await sb.functions.invoke('chat-translate', { body: { ids, to } });
      if (error) {
        let msg = error.message;
        try { msg = (await error.context.json()).error || msg; } catch { /* keep generic */ }
        throw new Error(msg);
      }
      return data?.results || {};
    },
    chatOpenDirect: async other => ok(await sb.rpc('chat_open_direct', { p_other: other })),
    // Groups (supabase/migrations/20261125000000_chat_groups.sql): the one who made it manages it
    chatCreateGroup: async (title, members) => ok(await sb.rpc('chat_create_group', { p_title: title, p_members: members })),
    chatAddMembers: async (cid, users) => ok(await sb.rpc('chat_add_members', { p_cid: cid, p_users: users })),
    chatRemoveMember: async (cid, user) => ok(await sb.rpc('chat_remove_member', { p_cid: cid, p_user: user })),
    chatLeaveGroup: async cid => ok(await sb.rpc('chat_leave_group', { p_cid: cid })),
    chatRenameGroup: async (cid, title) => ok(await sb.rpc('chat_rename_group', { p_cid: cid, p_title: title })),
    // Customizing a conversation (supabase/migrations/20261128000000_chat_custom.sql): theme, quick emoji, nicknames
    chatSetTheme: async (cid, theme) => ok(await sb.rpc('chat_set_theme', { p_cid: cid, p_theme: theme || null })),
    chatSetEmoji: async (cid, emoji) => ok(await sb.rpc('chat_set_emoji', { p_cid: cid, p_emoji: emoji || null })),
    chatSetNickname: async (cid, user, nick) => ok(await sb.rpc('chat_set_nickname', { p_cid: cid, p_user: user, p_nick: nick || null })),
    // Messages of a conversation whose text has these words (the newest 40), and its pictures (the newest 60)
    async chatSearch(cid, q) {
      const like = `%${String(q).replace(/[\\%_]/g, c => `\\${c}`)}%`;
      return ok(await sb.from('chat_messages').select('id, sender_id, sender_name, body, created_at').eq('conversation_id', cid).is('deleted_at', null).is('system', null)
        .ilike('body', like).order('id', { ascending: false }).limit(40));
    },
    chatPictures: async cid => ok(await sb.from('chat_messages').select('id, sender_id, attachment, created_at').eq('conversation_id', cid).is('deleted_at', null)
      .not('attachment', 'is', null).order('id', { ascending: false }).limit(60)),
    // Old messages packed into compressed batches (supabase/migrations/20261124000000_chat_archive.sql)
    chatArchived: async (cid, beforeId = null) => ok(await sb.rpc('chat_archive_page', { p_cid: cid, p_before: beforeId })) || [],
    chatUsage: async () => ok(await sb.rpc('chat_usage_info')),
    chatSaveSettings: async patch => ok(await sb.from('chat_settings').update(patch).eq('id', 1).select().single()),
    chatArchiveNow: async () => ok(await sb.rpc('chat_archive_run')),
    // Pictures: private bucket, <conversation>/<sender>/<file>; shown through links that expire after an hour
    async chatUpload(cid, me, blob) {
      const ext = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[blob.type] || 'jpg';
      const path = `${cid}/${me}/${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from('chat-media').upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
      if (up.error) throw new Error(up.error.message);
      return path;
    },
    async chatMediaUrls(paths) {
      if (!paths.length) return {};
      const { data, error } = await sb.storage.from('chat-media').createSignedUrls(paths, 3600);
      if (error) throw new Error(error.message);
      return Object.fromEntries((data || []).filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]));
    },
    chatRemoveMedia: async path => { await sb.storage.from('chat-media').remove([path]); },   // best effort
    // Live updates: my inbox (the database pushes every change in my conversations to it), who is online,
    // and "typing…" in the conversation that is open. Returns controls; nothing here throws.
    async chatConnect(me, on) {
      await sb.realtime.setAuth();
      const inbox = sb.channel(`user:${me}`, { config: { private: true } });
      for (const ev of ['message', 'message_update', 'reaction', 'read', 'conversation']) inbox.on('broadcast', { event: ev }, ({ payload }) => on.event(ev, payload));
      inbox.subscribe(status => on.status?.(status));
      const presence = sb.channel('chat:presence', { config: { private: true, presence: { key: me } } });
      presence.on('presence', { event: 'sync' }, () => on.presence(Object.keys(presence.presenceState())))
        .subscribe(async status => { if (status === 'SUBSCRIBED') await presence.track({ since: Date.now() }); });
      let room = null, roomCid = null;
      return {
        watch(cid) {
          if (cid === roomCid) return;
          if (room) sb.removeChannel(room);
          roomCid = cid || null;
          room = cid ? sb.channel(`chat:${cid}`, { config: { private: true, broadcast: { self: false } } }) : null;
          room?.on('broadcast', { event: 'typing' }, ({ payload }) => on.typing(cid, payload.user)).subscribe();
        },
        typing(cid) { if (room && cid === roomCid) room.send({ type: 'broadcast', event: 'typing', payload: { user: me } }); },
        close() { for (const ch of [inbox, presence, room]) if (ch) sb.removeChannel(ch); room = roomCid = null; },
      };
    },
  };
}
