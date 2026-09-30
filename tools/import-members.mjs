// Creates the gym's accounts from a CSV (Node 18+, no dependencies).
//
//   node tools/import-members.mjs [members.csv] [--dry-run]
//
// CSV columns: username, display_name, facebook, note, role (member | mod | admin), create (yes | review | no)
// Only rows with create=yes are made. Needs SUPABASE_PROJECT_REF and SUPABASE_SERVICE_ROLE_KEY (or
// SUPABASE_ACCESS_TOKEN, used to fetch the service key) in .env in the repo root or the environment.
// Existing usernames are skipped, so it is safe to run again.
// Writes ~/.config/pmex/credentials.csv (mode 600) with each new account's temporary password;
// the CSV and credentials never live in the repo. Members change the password after first sign-in.
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2), dry = args.includes('--dry-run');
const csvPath = args.find(a => !a.startsWith('--')) || join(homedir(), '.config/pmex/members.csv');
const envFile = process.env.ENV_FILE || join(import.meta.dirname, '../.env');
const env = { ...process.env };
if (existsSync(envFile)) for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*["']?(.*?)["']?\s*$/);
  if (m && !(m[1] in env)) env[m[1]] = m[2];
}
const ref = (env.SUPABASE_PROJECT_REF || '').replace(/^https?:\/\//, '').replace(/\.supabase\.co.*$/, '');
const DOMAIN = (readFileSync(join(import.meta.dirname, '../config.js'), 'utf8').match(/usernameDomain:\s*'([^']+)'/) || [])[1] || 'members.pmex-gym.local';

function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.some(x => x.trim()));
  return body.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] || '').trim()])));
}
const members = parseCsv(readFileSync(csvPath, 'utf8'));
const todo = members.filter(m => m.create === 'yes');
const bad = todo.filter(m => !/^[a-z0-9_.-]{3,32}$/.test(m.username) || !['member', 'mod', 'admin'].includes(m.role));
console.log(`${members.length} rows: ${todo.length} to create, ${members.filter(m => m.create === 'review').length} marked review (skipped), ${members.filter(m => m.create === 'no').length} no`);
if (bad.length) { console.error('Fix these rows first (username 3–32 of a-z 0-9 _ . -, role member/mod/admin):', bad.map(m => m.username || m.display_name).join(', ')); process.exit(1); }
const dup = todo.filter((m, i) => todo.findIndex(x => x.username === m.username) !== i);
if (dup.length) { console.error('Duplicate usernames:', dup.map(m => m.username).join(', ')); process.exit(1); }
console.log('  admin:', todo.filter(m => m.role === 'admin').map(m => m.username).join(', ') || '(none!)', '· mods:', todo.filter(m => m.role === 'mod').map(m => m.username).join(', ') || '(none)');
if (dry) { console.log('\nDry run: nothing created.'); process.exit(0); }

if (!ref) { console.error('Set SUPABASE_PROJECT_REF in', envFile); process.exit(1); }
// The service key can be given directly (SUPABASE_SERVICE_ROLE_KEY, or a new-style sb_secret_… key in SUPABASE_SECRET_KEY),
// or fetched with a personal access token (sbp_…)
let service = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
if (!service && env.SUPABASE_ACCESS_TOKEN?.startsWith('sbp_')) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` } });
  service = (await r.json()).find(k => k.name === 'service_role')?.api_key;
}
if (!service) { console.error('Need SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ACCESS_TOKEN) in', envFile); process.exit(1); }
const base = `https://${ref}.supabase.co`, H = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const password = () => Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

const made = [];
for (const m of todo) {
  const pw = password();
  const res = await fetch(`${base}/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify({
    email: `${m.username}@${DOMAIN}`, password: pw, email_confirm: true,
    user_metadata: { username: m.username, display_name: m.display_name }, app_metadata: { gym_role: m.role } }) });
  if (res.status === 422) { console.log(`  = ${m.username} already exists`); continue; }
  if (!res.ok) { console.error(`  ✗ ${m.username}: ${res.status} ${(await res.text()).slice(0, 200)}`); continue; }
  if (m.facebook || m.note) await fetch(`${base}/rest/v1/profiles?username=eq.${encodeURIComponent(m.username)}`, { method: 'PATCH', headers: H, body: JSON.stringify({ facebook: m.facebook, note: m.note }) });
  console.log(`  + ${m.username} (${m.role})`);
  made.push({ username: m.username, display_name: m.display_name, role: m.role, password: pw });
}
if (made.length) {
  const out = join(homedir(), '.config/pmex/credentials.csv'), had = existsSync(out);
  const line = r => [r.username, r.display_name, r.role, r.password].map(x => `"${x.replace(/"/g, '""')}"`).join(',');
  writeFileSync(out, (had ? readFileSync(out, 'utf8') : 'username,display_name,role,temporary_password\n') + made.map(line).join('\n') + '\n');
  chmodSync(out, 0o600);
  console.log(`\nCreated ${made.length}. Temporary passwords: ${out}`);
}
