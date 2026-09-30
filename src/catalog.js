/* ═══════════════════════════════════════════════════════════════
   Game data the app reads at runtime (nothing is copied into this repo):
   · Sync pairs + icons — PoMasters Sync Pairs Tracker (pomasters.github.io)
   · Gym Battle definitions — PMEX Dex build (data/gyms.json)
   ═══════════════════════════════════════════════════════════════ */

const CFG = window.GYM_CONFIG || {};
export const POMA = (CFG.pomastersUrl || 'https://pomasters.github.io/SyncPairsTracker/').replace(/\/?$/, '/');
// ?dex=<url> points at another Dex build (handy for local development)
export const DEX = (new URLSearchParams(location.search).get('dex') || CFG.dexUrl || 'https://kietto03.github.io/pmex-supez-dex/').replace(/\/?$/, '/');

export const TYPES = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground',
  'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];
export const TYPE_COLORS = {
  Normal: '#9fa19f', Fire: '#e62829', Water: '#2980ef', Electric: '#fac000', Grass: '#3fa129', Ice: '#3dcef3',
  Fighting: '#ff8000', Poison: '#9141cb', Ground: '#915121', Flying: '#81b9ef', Psychic: '#ef4179', Bug: '#91a119',
  Rock: '#afa981', Ghost: '#704170', Dragon: '#5060e1', Dark: '#624d4e', Steel: '#60a1b8', Fairy: '#ef70ef',
};
export const ROLES = ['Strike', 'Tech', 'Support', 'Sprint', 'Field', 'Multi'];

// Icons from the tracker (role / type / EX)
export const typeIcon = t => `${POMA}images/type_${String(t).toLowerCase()}.png`;
export const roleIcon = (r, ex = false) => `${POMA}images/role_${ex ? 'ex_' : ''}${roleKey(r)}.png`;
export const roleKey = r => String(r || '').toLowerCase().replace(/\s*\(.*\)/, '');
export const EX_ICON = `${POMA}images/icon_role_ex.png`;
export const PLACEHOLDER = `${POMA}images/empty.png`;

const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// "Sygna Suit (Alt.)" + "Lysandre" → "Sygna Suit Lysandre (Alt.)"; "Champion" + "Lyra" → "Lyra (Champion)"
function trainerLabel(name, alt) {
  if (!alt) return name;
  const m = alt.match(/^((?:Sygna|Arc) Suit)(?:\s*\((.+)\))?$/);
  if (m) return `${m[1]} ${name}${m[2] ? ` (${m[2]})` : ''}`;
  return `${name} (${alt.replace(/^\((.*)\)$/, '$1')})`;
}

let pairs = [], byId = new Map(), version = '';
export const PAIRS = () => pairs;
export const pairById = id => byId.get(id);
export const catalogVersion = () => version;
export const pairName = p => (p ? `${p.trainer} & ${p.pokemon}` : '?');
// Icons are named …_3.png / _4.png / _5.png / _EX.png: pick the one for the member's star level
export function pairImage(p, ex = false, stars = null) {
  if (!p) return PLACEHOLDER;
  const find = tag => p.images.find(s => s.endsWith(`_${tag}.png`));
  const src = (ex && find('EX')) || find(ex ? 5 : stars || p.rarity) || p.images[0];
  return src ? POMA + src : PLACEHOLDER;
}

export async function loadCatalog() {
  const res = await fetch(`${POMA}js/syncpairs.json`);
  if (!res.ok) throw new Error(`Sync pair list unavailable (${res.status})`);
  const json = await res.json();
  version = json.VERSION || '';
  const raw = json.SYNCPAIRS || [];
  // Stable ids from the names; the rare clash (same pair in another form) adds the internal Pokémon id
  const base = raw.map(p => slug(`${p.trainerAlt} ${p.trainerName} ${p.pokemonName} ${(p.pokemonForm || []).join(' ')}`));
  const clash = new Set(base.filter((id, i) => base.indexOf(id) !== i));
  pairs = raw.map((p, i) => ({
    id: clash.has(base[i]) ? `${base[i]}-${slug(p.internalPokemonName || String(i))}` : base[i],
    trainer: trainerLabel(p.trainerName, p.trainerAlt),
    trainerName: p.trainerName,
    alt: p.trainerAlt || '',
    pokemon: p.pokemonName,
    type: p.pokemonType,
    weakness: p.pokemonWeak,
    role: p.syncPairRole,
    exRole: p.syncPairRoleEX || '',
    rarity: +p.syncPairRarity || 5,          // base stars (3–5); members raise it to 5★ before 6★ EX
    maxBonus: p.syncPairSuperawakening ? 10 : 5,
    exPose: !!p.syncPairEXPose,
    release: p.releaseDate,
    acquisition: p.syncPairAcquisition,
    themes: p.themes || [],
    images: p.images || [],
  }));
  // The tracker occasionally lists the very same pair twice: keep the first
  const seen = new Set();
  pairs = pairs.filter(p => !seen.has(p.id) && seen.add(p.id));
  byId = new Map(pairs.map(p => [p.id, p]));
  return pairs;
}

// Rows for public.pair_catalog
export const catalogRows = () => pairs.map(p => ({
  id: p.id, trainer: p.trainer, pokemon: p.pokemon, type: p.type || '', role: p.role || '',
  ex_role: p.exRole, rarity: p.rarity, max_bonus: p.maxBonus,
}));

// ─── Battle tags (from the Dex): what weather / terrain / zone a pair sets, which Type Rebuffs it lowers ───
export async function loadTags() {
  let tags = {};
  try { const res = await fetch(`${DEX}data/pair-tags.json`); if (res.ok) tags = await res.json(); } catch { /* optional */ }
  for (const p of pairs) {
    const tg = tags[`${p.trainer}|${p.pokemon}`.toLowerCase()];
    p.wtz = tg?.wtz || [];
    p.rebuff = tg?.rebuff || [];
  }
}
// The weather / terrain / zone that powers up a type
const TYPE_FIELD = { Fire: 'Sunny', Water: 'Rain', Rock: 'Sandstorm', Ground: 'Sandstorm', Steel: 'Sandstorm', Ice: 'Hail',
  Electric: 'Electric Terrain', Grass: 'Grassy Terrain', Psychic: 'Psychic Terrain', Fairy: 'Misty Terrain' };
// 3 = sets the EX version for this type, 2 = sets it, 1 = sets some other weather / terrain / zone
export function wtzScore(p, type) {
  const own = [`${type} Zone`, TYPE_FIELD[type]].filter(Boolean);
  if ((p.wtz || []).some(w => own.some(o => w === `EX ${o}`))) return 3;
  if ((p.wtz || []).some(w => own.includes(w))) return 2;
  return p.wtz?.length ? 1 : 0;
}
export const rebuffs = (p, type) => (p.rebuff || []).some(r => r === type || r === 'Weakness');

// ─── Gym Battles (from the Dex) ───
let gyms = [];
export const GYMS = () => gyms;
export async function loadGyms() {
  try {
    const res = await fetch(`${DEX}data/gyms.json`);
    gyms = res.ok ? (await res.json()).gyms || [] : [];
  } catch { gyms = []; }
  return gyms;
}

const utc = s => (s ? new Date(s + (s.endsWith('Z') ? '' : 'Z')).toISOString() : null);   // datamine times are UTC

// A season row prefilled from a datamine gym. `gym_data` keeps the stages (rules, boss focus)
// so the season still shows them after the datamine has moved on.
export function seasonFromGym(g) {
  const battle = g.phases.find(p => p.name === 'Battle') || {};
  return {
    name: g.name,
    gym_key: g.name,
    battle_start: utc(battle.start),
    battle_end: utc(battle.end),
    leaders: (g.stages[0]?.leaders || []).map(l => ({
      name: l.name, type: l.type, weakness: [...new Set((l.units || []).map(u => u.weakness).filter(Boolean))],
    })),
    circuits: g.circuits.map(c => ({ name: c.name, pts: c.pts, kind: c.kind, ball: c.ball })),
    gym_data: {
      leaderSprites: Object.fromEntries(Object.entries(g.leaderSprites || {}).map(([k, v]) => [k, v ? DEX + v : null])),
      stages: g.stages.map(st => ({ name: st.name, leaders: st.leaders.map(l => ({
        name: l.name, theme: l.theme, rules: l.rules, focus: l.units?.[0]?.focus || [], passives: l.units?.[0]?.passives || [],
      })) })),
    },
  };
}

// The rule a Gym Leader plays under in round n ("… and onward" rotates Rules 1/2/3)
export function leaderRule(season, leader, n) {
  const stages = season?.gym_data?.stages;
  if (!stages?.length) return '';
  const st = stages[Math.min(n, stages.length) - 1] || stages[0];
  const l = st.leaders.find(x => x.name === leader);
  if (!l) return '';
  if (l.rules?.length) return l.rules[(Math.max(n, stages.length) - stages.length) % l.rules.length];
  return l.theme || 'No rules';
}
export function leaderFocus(season, leader, n) {
  const stages = season?.gym_data?.stages;
  const st = stages?.[Math.min(n, stages.length) - 1];
  return st?.leaders.find(x => x.name === leader)?.focus || [];
}

// Gym Leader picture: their own trainer sprite from the Dex (the PMEX outfit when there is one),
// never a sync pair icon. Seasons keep the sprite URLs they were created with.
export function leaderImage(season, name) {
  const saved = season?.gym_data?.leaderSprites?.[name];
  if (saved) return saved;
  const gym = [...gyms].reverse().find(g => g.leaderSprites?.[name]);
  return gym ? DEX + gym.leaderSprites[name] : `${DEX}assets/trainers/${slug(name).replace(/-/g, '')}.png`;
}
