# PMEX Gym Manager

A small web app for running a **Pokémon Masters EX** gym: member accounts, the sync pairs each member owns, Pasio Tower progress, and a shared log and plan for every **Gym Battle** season.

**Live demo:** <https://kietto03.github.io/pmex-gym-manager/?demo> (sample data kept in your browser, nothing is saved)

- **English by default**, Vietnamese included. **Settings** lets each person pick a style — *Switch* (rounded, Joy-Con colours), *DS* (pixel titles, hard edges), *Game Boy* (four greens) or *Studio* (paper and ink) — plus light/dark/auto and an accent colour. Pixel icons, no emoji, and a companion trainer mascot (Red, Gloria, Cynthia or Dawn, modern or pixel — or off) that glances around, blinks, reacts when poked, dozes when idle and tells you what's worth doing (tickets left, open round, your battles, empty roster cells).
- **Import from SyncPairsTracker**: on a member's Sync pairs tab, paste a backup made with the tracker's *Export* button. Levels, stars, 6★ EX and EX Role come along (hearts and grid progress are ignored). *Add & update* keeps what is already there; *Replace roster* also removes pairs that are not in the backup. The format is read in `src/tracker.js`.
- **Static site + Supabase**: no server to run. Free tier is plenty for a gym (~20 members, 1 admin, 2 mods).
- **Game data is read live**, nothing is copied into this repo:
  - Sync pairs and icons: [PoMasters Sync Pairs Tracker](https://pomasters.github.io/SyncPairsTracker/)
  - Gym Battle leaders, circuits and rules: [PMEX Dex](https://kietto03.github.io/pmex-supez-dex/) (`data/gyms.json`)
  - Which pairs set weather / terrain / zones or lower Type Rebuffs: PMEX Dex (`data/pair-tags.json`)

## What it does

| Page | |
|---|---|
| **Overview** | Running season: score per round, which Gym Leaders are cleared, member scores, tickets left, recent runs |
| **Log run** | Pick leader, round, tickets and score, add the team (1–3 sync pairs). Rules are checked as you type |
| **Plan** | Three tabs: **Gym Leaders** (per Gym Leader: weakness, the rule of every circuit, notes, the squad (who fights them and with which 1–3 pairs **from their own roster**) and who fits best ); **Strategy** (the season's rules and requirements, written by staff, read by everyone; a new season starts from the latest rules); **Facilitator** (who sets up each fight — lowers the opponent's Type Rebuff or stats, applies status — and with which of their own pairs)|
| **Battle info** | Everything the datamine says about the Gym Battle: per circuit and Gym Leader the rules, every opponent unit (HP, ATK, DEF, SP.ATK, SP.DEF, SPE, weakness, focus, conditions, passives), the schedule, ticket time limits and buffs, and score / ranking rewards |
| **Plan → Roles** | One battle role (DDs, HHs, Facilitator, Finisher, Helper) and one main type per member and season, set by staff; filters by role, main type, stage type and Gym Leader show the season total next to the points of the matching stages |
| **Strategies** | Library of team strategies for GvG, D.C 3v1 and D.C 3v3: boss, weakness, conditions, team (with the pairs you are missing marked), grid notes, rotation and a video link (YouTube is embedded). Anyone drafts and submits; a mod or the admin publishes or asks for changes. Editing a published strategy opens a new revision and the published one stays until the new one is approved. Staff can copy a team into a member's plan (only pairs they own). A panel lists the best 3v3 scores by type from the community D.C. ranking sheet (`data/dc-ranking.json`, refreshed by `tools/sync-ranking.mjs` with every 6-hourly rebuild) |
| **Trainer Lodge** | Static lookup of the topics each Sync Pair likes (5 / 7 / 10 points): by trainer, or by topic to see who likes it. Data in `data/lodge.json`, copied from Serebii on the date shown (`node tools/build-lodge.mjs` refreshes it) |
| **Sync Grid** | Moves and passives of any sync pair (with their conditions) and a grid builder on the real hex grid from the datamine: tap a tile to read it and switch it on; a tile needs an active neighbour and its move level; an optional energy limit; totals of energy and sync orbs. Builds are private until shared with the gym, and flag a pair whose game data changed. Rules in `src/grid.js` (`node test/grid.test.mjs`); `data/pair-map.json` links the catalog to the Dex pair files (`node tools/build-pair-map.mjs` after the Dex is rebuilt) |
| **Free Gems** | Projection of the Free Gems still to earn until the end of the month (or next month): day-by-day breakdown with a running total, one-off rewards claimable on any day of a range listed apart (never placed on a made-up day), rewards with an unknown amount listed and not counted. The numbers come from the community Gems sheet, copied into `data/gems-sheet.json` by `tools/sync-gems.mjs` (the site is rebuilt every 6 hours and refreshes it; run the tool by hand to update the repo copy). Staff can instead enter events and rewards themselves; days are server days (reset zone and hour are settings). Paid Gems are not tracked. Rules in `src/gems.js` (`node test/gems.test.mjs`) |
| **Roster** | A spreadsheet per type: one row per member, columns Special · Physical · EX WTZ (sets the (EX) weather, terrain or zone) · Rebuff (lowers the opponents' Type Rebuff) · Sub-DPS Physical · Sub-DPS Special · Extend WTZ · Support · Other 1–3 · tower floor. Click a cell to pick the pair from that member's roster (suggestions come from the Dex move and passive text), mark it ✕, or auto-fill empty cells. Members edit their own row, staff edit any row |
| **Members** | Profile pictures: each member can upload a photo (cropped square in the browser, stored in the public `avatars` bucket, staff can do it for anyone) or use one of their sync pairs.  Everyone's sync pairs (owned, stars for 3★/4★ pairs, 6★ EX, EX Role, move level up to 5/5 or 10/5 with Superawakening) with search, type/role/status filters and stable sorting, Pasio Tower floors per type (18 towers × 40 floors) and battle plan. Mods and the admin can update any member's roster and tower |
| **Admin** | Seasons, lock members, accounts, sync the pair catalog, activity log |

### Roles

| | Member | Mod | Admin |
|---|:-:|:-:|:-:|
| See everything in the gym | ✅ | ✅ | ✅ |
| Edit **own** profile, pairs, tower | ✅ | ✅ | ✅ |
| Edit **other members'** profile, pairs, tower | | ✅ | ✅ |
| Log own runs (the open round only) | ✅ | ✅ | ✅ |
| Log / edit runs for others, backfill older rounds | | ✅ | ✅ |
| Assign members to Gym Leaders and pick their team from their roster | | ✅ | ✅ |
| Seasons, locking, leader notes, activity log | | ✅ | ✅ |
| Create / delete accounts, reset passwords, change roles | | | ✅ |

Permissions are enforced **in the database** (row-level security and triggers), not only in the page.

### Gym Battle rules checked on every run

Same logic in `src/rules.js` (instant feedback) and the `check_run()` trigger (the source of truth):

- **Tickets**: 9 when Battle opens, +3 every 24 h, 30 max per member, 600 max for the gym (editable per season).
- Regular circuits always cost **3 tickets**; Extra Battles can be ×1, ×2 or ×3.
- **Score cap**: a leader's total in one round can't exceed that circuit's points.
- **Round chain**: the open round is the first one where not every leader is at the cap. Members log the open round only; mods and the admin can backfill any round.
- The last circuit ("… and onward") repeats forever and rotates Rules 1/2/3.
- Locked members can't log new runs and don't count toward the combined score.
- Sync pair progress follows the game: a 3★/4★ pair is raised to 5★ before 6★ EX; EX Role is independent of 6★ EX.
- A planned team only holds pairs the member owns; removing a pair from a roster removes it from their planned teams. Logging a run against an assigned leader pre-fills that team.

## Setup (once)

1. **Create a project** at <https://supabase.com> (Free). Note the *Project URL* and the *anon public key* (Project Settings → API).
2. **Turn off public sign-ups** (required, or anyone with the anon key could make an account):
   Authentication → Sign In / Providers → turn off **Allow new users to sign up**. Keep the Email provider on and turn off *Confirm email*.
3. **Create the tables**: SQL Editor → paste all of `supabase/migrations/20260929000000_gym_manager.sql` → Run.
   (Or with the CLI: `npx supabase link --project-ref <ref>` then `npx supabase db push`.)
4. **Deploy the account function** (needs the [Supabase CLI](https://supabase.com/docs/guides/cli)):
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase functions deploy admin-users
   # optional: only allow your site to call it
   npx supabase secrets set ALLOWED_ORIGIN=https://<you>.github.io
   ```
5. **Create the first admin**: Authentication → Users → *Add user* → *Create new user* with the email
   `admin@members.pmex-gym.local` (replace `admin` with the username you want), a password, and *Auto Confirm User* on. Then in the SQL Editor:
   ```sql
   update public.profiles set role = 'admin', display_name = 'Your in-game name' where username = 'admin';
   ```
6. **Connect the site**: fill `supabaseUrl` and `supabaseAnonKey` in `config.js` (the anon key is meant to be public), commit and push. GitHub Pages deploys the repo root (`.github/workflows/deploy.yml`; set Settings → Pages → Source to *GitHub Actions*).
7. Sign in as the admin → **Admin**:
   - *Pair catalog* → sync (loads every sync pair from the tracker; do it again after game updates).
   - *Seasons* → create a season (pick a Gym Battle from the datamine to fill in leaders, circuits and Battle times).
   - *Accounts* → create an account for each member.

## Keeping outside data fresh

Game updates and community sheets change all the time, so every outside source is refreshed automatically: a workflow runs every 6 hours (`npm run sync` does the same by hand), publishes the site when something really changed, and **Admin → Data updates** shows each source's state. The Dex repo does the same for the datamine every day, with a check that refuses a build that lost data. See [docs/data-sync.md](docs/data-sync.md).

## Going to production with scripts

Instead of steps 2–6 above by hand: create the Supabase project, then put `SUPABASE_ACCESS_TOKEN` (a personal access token, `sbp_…`) and `SUPABASE_PROJECT_REF` in `.env` (see `.env.example`; never committed) and run

```bash
node tools/provision.mjs --dry-run   # look first
node tools/provision.mjs             # no public sign-ups, tables + security, admin-users function, config.js
node tools/import-members.mjs --dry-run ~/.config/pmex/members.csv
node tools/import-members.mjs        # creates the accounts, writes temporary passwords to ~/.config/pmex/credentials.csv
node tools/sync-catalog.mjs           # loads all sync pairs into the database (or Admin → Pair catalog → Sync)
```

The member CSV (`username,display_name,facebook,role,create`) and the credentials file stay outside the repo — they hold real names. Accounts already there are skipped, so the import can be re-run.

## Day to day

- **New member**: Admin → Accounts → username + nickname → *Create account* → send them the link / username / password text it shows. They sign in, change the password under *Account*, then add their pairs and tower floors (or a mod does it for them).
- **Member leaves**: Admin → Accounts → *Delete* (type the username to confirm). Their pairs, tower and assignments are removed; **their runs stay in the log** under their name.
- **Forgot password**: the admin clicks *Reset password* and sends the new one.
- **Each Gym Battle**: create the season from the datamine and make it the running season. Members log runs; scores, tickets and progress update on their own. Lock anyone who drops out mid-season.

**Usernames**: Supabase Auth needs an email, so accounts use `<username>@members.pmex-gym.local` (never mailed). To change the domain, change `usernameDomain` in `config.js` and the function secret `USERNAME_EMAIL_DOMAIN` together.

## Development

```bash
npm run serve            # http://localhost:8767/?demo
npm run test:db          # 63 permission & rule tests on a throwaway Postgres (needs Docker)
# UI test: serve, then open http://localhost:8767/test/e2e.html
```

`?demo` forces the demo on a configured site; `?dex=<url>` reads Gym Battles from another Dex build (it must send CORS headers).

```
index.html, styles.css    page shell and styles
config.js                 Supabase URL + anon key (empty = demo), data sources
src/main.js               router, header and the older pages (overview, log, plan, roster, members, admin…)
src/core.js               shared helpers, app state `S`, the api handle, who-may-do-what; pages reach the router through `hooks`
src/pages/                newer pages, one module each: info, resources, strategies, lodge, gridpage, gemspage
src/api.js                data layer: Supabase or the in-memory demo, same functions
src/demo.js               demo backend + sample gym
src/rules.js              Gym Battle rules (no DOM)
src/catalog.js            sync pairs (tracker) and Gym Battles (Dex)
src/appearance.js         styles, colour modes, accents (Settings)
src/icons.js              12×12 pixel icon set
src/mascot.js             companion mascot (vanilla port of page-mascot)
assets/mascots/           the trainers' sprite sheets (drawn with the page-mascot skill)
src/sheet.js              roster sheet columns + suggestions
src/i18n.js, src/lang/    translations (English text is the key; add a file per language)
supabase/migrations/      tables, row-level security, rule triggers, activity log
supabase/functions/       admin-users: create / delete accounts, reset passwords, roles
supabase/tests/           database tests
test/e2e.html             clicks through the demo in an iframe
```

**Adding a language**: copy `src/lang/vi.js`, translate the values, then import it in `src/i18n.js` and add it to `DICTS` and `LANGS`.

## Credits

Sync pair data and icons from the [PoMasters Sync Pairs Tracker](https://pomasters.github.io/SyncPairsTracker/). Gym Battle data and Gym Leader pixel sprites (Pokémon Showdown trainer sprites) from the [PMEX Dex](https://github.com/Kietto03/pmex-supez-dex) datamine build. Mascot component and sprite-sheet format from [page-mascot](https://github.com/nilbuild/page-mascot) (MIT, Kamran Ahmed); the four trainer mascots are chibi fan-art adaptations of user-supplied character references, generated with the built-in image tool and aligned using that skill. Source sheets and prompts are kept in `characters/`; `test/mascot-preview.html` previews all four. The Pixel set is separately drawn 16-bit artwork; `tools/mascot-pixel.py` aligns it using nearest-neighbour resampling and a shared palette. Fan project, not affiliated with DeNA or The Pokémon Company; game assets belong to their owners.
