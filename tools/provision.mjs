// Sets up a Supabase project for production (Node 18+, no dependencies).
//
//   node tools/provision.mjs [--dry-run]
//
// Reads SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF from ~/Code/Datamine/.env (or the
// environment; override the file with ENV_FILE). Then:
//   1. turns off public sign-ups and email confirmation (accounts are only made by the admin)
//   2. creates the tables, row-level security and triggers (supabase/migrations/*.sql) — skipped if present
//   3. deploys the admin-users Edge Function with the Supabase CLI
//   4. writes the project URL and anon key (public by design) into config.js
// The service-role key is only ever printed as a length; it stays in the env file.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const dry = process.argv.includes('--dry-run');
const root = join(import.meta.dirname, '..');
const envFile = process.env.ENV_FILE || join(homedir(), 'Code/Datamine/.env');
const env = { ...process.env };
if (existsSync(envFile)) for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*["']?(.*?)["']?\s*$/);
  if (m && !(m[1] in env)) env[m[1]] = m[2];
}
const token = env.SUPABASE_ACCESS_TOKEN, ref = env.SUPABASE_PROJECT_REF;
if (!token || !ref) { console.error('Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF in', envFile); process.exit(1); }

const api = async (method, path, body) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
};
const sql = query => api('POST', '/database/query', { query });

console.log(`Project ${ref}${dry ? '  (dry run: nothing is changed)' : ''}`);
const keys = await api('GET', '/api-keys?reveal=true');
const anon = keys.find(k => k.name === 'anon')?.api_key, service = keys.find(k => k.name === 'service_role')?.api_key;
console.log(`✓ project reachable; anon key ${anon ? 'found' : 'MISSING'}, service key ${service ? `found (${service.length} chars)` : 'MISSING'}`);
if (!anon) process.exit(1);

console.log('1. Auth: no public sign-ups, no email confirmation');
if (!dry) await api('PATCH', '/config/auth', { disable_signup: true, mailer_autoconfirm: true });

console.log('2. Database');
const has = await sql("select to_regclass('public.profiles') is not null as ok");
if (has[0]?.ok) console.log('   tables already exist — skipped (never re-run the migration on live data)');
else {
  const file = readdirSync(join(root, 'supabase/migrations')).sort().at(-1);
  console.log('   applying', file);
  if (!dry) await sql(readFileSync(join(root, 'supabase/migrations', file), 'utf8'));
}

console.log('3. Edge Function admin-users');
if (!dry) execFileSync('npx', ['-y', 'supabase', 'functions', 'deploy', 'admin-users', '--project-ref', ref], {
  cwd: root, stdio: 'inherit', env: { ...env, SUPABASE_ACCESS_TOKEN: token } });

console.log('4. config.js');
const url = `https://${ref}.supabase.co`;
if (!dry) {
  let cfg = readFileSync(join(root, 'config.js'), 'utf8');
  cfg = cfg.replace(/supabaseUrl:\s*'[^']*'/, `supabaseUrl: '${url}'`).replace(/supabaseAnonKey:\s*'[^']*'/, `supabaseAnonKey: '${anon}'`);
  writeFileSync(join(root, 'config.js'), cfg);
}
console.log(`   ${url}`);
console.log(dry ? '\nDry run finished.' : '\nDone. Next: node tools/import-members.mjs');
