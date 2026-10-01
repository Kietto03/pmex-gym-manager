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
    createSeason: async row => ok(await sb.from('seasons').insert(row).select().single()),
    updateSeason: async (id, patch) => ok(await sb.from('seasons').update(patch).eq('id', id).select().single()),
    async setActiveSeason(id) {
      ok(await sb.from('seasons').update({ is_active: false }).eq('is_active', true));
      if (id) ok(await sb.from('seasons').update({ is_active: true }).eq('id', id));
    },
    deleteSeason: async id => ok(await sb.from('seasons').delete().eq('id', id)),

    seasonMembers: async sid => ok(await sb.from('season_members').select('*').eq('season_id', sid)),
    setBanned: async (season_id, user_id, banned) => ok(await sb.from('season_members').upsert({ season_id, user_id, banned })),

    runs: sid => all(() => sb.from('runs').select('*').eq('season_id', sid).order('created_at', { ascending: false }).order('id', { ascending: false })),
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

    facilitators: sid => all(() => sb.from('facilitator_plans').select('*').eq('season_id', sid).order('leader').order('user_id')),
    saveFacilitator: async row => ok(await sb.from('facilitator_plans').upsert(row)),
    removeFacilitator: async (season_id, leader, user_id) => ok(await sb.from('facilitator_plans').delete().match({ season_id, leader, user_id })),

    notes: async sid => ok(await sb.from('leader_notes').select('*').eq('season_id', sid)),
    saveNote: async row => ok(await sb.from('leader_notes').upsert(row)),

    activity: async () => ok(await sb.from('activity').select('*').order('at', { ascending: false }).limit(200)),
  };
}
