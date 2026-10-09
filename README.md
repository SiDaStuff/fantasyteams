# ⚡ Fantasy Teams

A multiplayer fantasy football game where friends draft **entire NFL teams** instead of individual players. Every regular-season win by a drafted franchise is a point for its owner; the most combined wins at season's end crowns the champion.

**Stage 4 (current):** predictions & competition — Monte Carlo championship odds, projected standings, live standings during games, an activity feed, commissioner projections settings, season progress, and head-to-head owner comparisons with charts.

> Drafts, season scoring, and projections are complete. Keeper/trade features come later.

## Architecture

```
Browser (React + Vite)
   │  Firebase Auth (browser SDK) — identity only
   │  HTTPS JSON API — every read & write
   ▼
Netlify Functions  (netlify/functions/api.ts)
   │  Verifies Firebase ID token on every request
   │  Firebase Admin SDK — service account
   ▼
Firebase Realtime Database   (rules deny ALL direct access)
```

- The **browser never touches the database**. RTDB rules (`database.rules.json`)
  deny every client read/write — the only path in is through the Netlify Function,
  authenticated with `FIREBASE_SERVICE_ACCOUNT` (a service-account key).
- Each API call is authenticated by verifying the caller's Firebase ID token
  (`admin.auth().verifyIdToken`) **server-side** — nothing client-provided is trusted.
- Membership, join codes, capacity, and commissioner privileges are enforced in
  the function, never by the client.
- Live updates are delivered by **polling** the API (3–5s in the dashboard/lobby,
  ~1s in the live draft room; paused on hidden tabs) plus an immediate refetch
  after every mutation.
- Draft timers are **authoritative server deadlines** stored in RTDB. Expiry is
  handled by an atomic transaction — lazily on any poll/pick, and by a
  **Netlify scheduled function** (`draft-clock.ts`, every minute) so drafts
  advance even when nobody is online.
- NFL data is synced by a **scheduled `nfl-sync` function** (every 10 minutes,
  smart cooldown + lock) from the free, keyless ESPN public API and cached in
  RTDB. Fantasy scoring is **recomputed from game results on demand** — never
  stored points — so corrected finals propagate everywhere automatically.
- Championship odds use a **seeded Monte Carlo simulation** (documented team-
  strength model + home-field advantage, deterministic output). Projections are
  computed once per games-version per league and **cached in RTDB**, so
  identical simulations are never recomputed for every viewer. Activity events
  (drafts, game wins, leadership changes, new weeks) are **persisted** with
  deterministic keys so repeated syncs can never duplicate them.

## Tech stack

| Layer    | Choice                                                        |
| -------- | ------------------------------------------------------------- |
| Frontend | React 19 · Vite 8 · TypeScript 6 · Tailwind CSS v4            |
| Auth     | Firebase Authentication (Google + email/password)             |
| Data     | Firebase Realtime Database (server-only)                      |
| Server   | Netlify Functions (Firebase Admin SDK via service account)    |

## Quick start

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create a Firebase project** (one-time)
   - Create a **Realtime Database** (Rules → "Start in locked mode").
   - Enable **Google** and **Email/Password** sign-in (Authentication → Sign-in method).
   - Register a **web app** and copy its config.
   - Generate a **service account key**
     (Project settings → Service accounts → Generate new private key).

3. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   - `VITE_FIREBASE_*` — the *public* web-app config (Authentication only).
   - `FIREBASE_SERVICE_ACCOUNT` — the service-account JSON (server-only secret;
     never `VITE_`-prefixed, so it is never shipped to the browser).

4. **Run locally**

   ```bash
   npm run dev                     # Vite UI on :5173
   npx netlify functions:serve     # API on :8888 (loads .env, incl. service account)
   ```

   The Vite dev server proxies `/.netlify/functions/*` to :8888, so the app and
   API work together seamlessly. Alternatively run everything in one process:

   ```bash
   npx netlify dev                 # serves the site + API on :8888
   ```

## Deploying to Netlify

1. Push the repo to GitHub and import it in the Netlify dashboard
   (build command `npm run build`, publish directory `dist` — already set in `netlify.toml`).
2. Add the environment secrets in **Site settings → Environment variables**:
   - `FIREBASE_SERVICE_ACCOUNT` (service-account JSON — mark as "secret")
   - `FIREBASE_DATABASE_URL` (optional; derived from `project_id` otherwise)
   - `VITE_FIREBASE_*` (web-app config for Auth)
3. Deploy the RTDB rules (they banish direct client access):

   ```bash
   npx firebase login
   npx firebase use <project-id>     # or edit .firebaserc
   npx firebase deploy --only database
   ```

4. Deploy the site (or auto-deploy from the Git branch).

> **Why no Firebase emulators?** All database access runs through the Netlify
> Function with real service-account credentials, so local development uses the
> real RTDB directly (enabled by the rules' locked mode — the browser still can't
> touch it). Use a separate dev project if you want isolation.

## Scripts

| Command                     | Purpose                            |
| --------------------------- | ---------------------------------- |
| `npm run dev`               | Vite dev server                    |
| `npm run build`             | Type-check + production build      |
| `npm run typecheck`         | TypeScript check (`tsc -b`)        |
| `npm run lint`              | ESLint                             |
| `npx netlify functions:serve` | Run the API function locally     |
| `npx netlify dev`           | Site + API together locally        |
| `npx firebase deploy --only database` | Deploy RTDB rules (locked) |

## Project structure

```
fantasyteams/
├── netlify.toml               # Netlify build + SPA redirects + cron (draft-clock, nfl-sync)
├── netlify/functions/         # API + scheduled functions
│   ├── api.ts                 # THE data layer (all RTDB access via service account)
│   ├── draft-clock.ts         # scheduled draft-expiry safety net
│   ├── nfl-sync.ts            # scheduled NFL data sync (+ activity fan-out)
│   └── lib/                   # admin, draft-core/service, scoring-core, simulation-core,
│                              # season-service (insights), nfl-service, activity
├── database.rules.json        # RTDB rules — client access fully denied
├── firebase.json              # RTDB rules deploy config
├── .firebaserc                # default Firebase project
├── vitest.config.ts           # unit tests
├── tests/                     # draft-core, scoring-core, stage4 (simulation/live/activity)
└── src/
    ├── components/            # ui/, layout/, brand/, auth/, league/, draft/, nfl/
    ├── context/               # AuthContext (token+profile), ToastContext
    ├── hooks/useLeagues.ts    # polling hooks (useDraft, useLeagueInsights, useNflWeek, …)
    ├── lib/                   # firebase (auth only), api (HTTP client), utils
    ├── pages/                 # Landing, Login, Register, Dashboard, Lobby, DraftRoom,
    │                          # NflScores, TeamProfile, ComparePlayers, …
    ├── types/                 # shared domain types (mirror API DTOs)
    └── data/nflTeams.ts       # 32-team dataset (espnId/city/nickname/colors/logos)
```

## Realtime Database layout

| Path                              | Purpose                                          | Written by        |
| --------------------------------- | ------------------------------------------------ | ----------------- |
| `/users/{uid}`                    | Auth profile + `/leagues/{leagueId}` index       | API (server)      |
| `/leagueCodes/{code}`             | Unique join code → league id                     | API (transaction) |
| `/leagues/{leagueId}`             | Settings + `/members/{uid}` (atomic capacity)    | API (transaction) |
| `/drafts/{leagueId}`              | Draft state: order, full pick sequence, picks, timer, status | API (transactions) |
| `/nfl/current`                    | Current season + week pointer                    | `nfl-sync`        |
| `/nfl/seasons/{season}/games/{id}`| Cached games (weekly, scores, statuses) — single source of truth | `nfl-sync` |
| `/nfl/seasons/{season}/records/{teamId}` | Recomputed team records W/L/T + points   | `nfl-sync`        |
| `/nfl/seasons/{season}/projections/{leagueId}` | Cached championship simulations    | API (on demand)   |
| `/leagues/{leagueId}/prefs`       | Projection / odds display preferences            | API (commissioner)|
| `/leagues/{leagueId}/activity/{key}` | Persisted league feed events (deduped)        | API + `nfl-sync`  |
| `/system/leagueIds/{leagueId}`    | League index used by the sync to fan out events  | API (create)      |

The full pick sequence is generated **once server-side** and persisted under
`/drafts/{leagueId}/pickSequence`, so every client sees identical order. All
critical draft transitions (start, pick, autopick, pause, resume, complete) run
as atomic RTDB transactions on the draft node, and the pick deadline is an
authoritative server timestamp. NFL results are a **shared, global cache** —
multiple leagues read the same games, so a single sync serves every league.

## NFL data provider

- **Source:** ESPN's public site API — default host
  `site.web.api.espn.com/apis/site/v2/sports/football/nfl`, with the classic
  `site.api.espn.com` endpoint kept as an automatic fallback mirror.
- **Cost/limits:** free and keyless (unofficial but widely mirrored and reliable).
  The sync is polite by design: an atomic lock prevents overlap, a cooldown
  (~5 min) limits requests, `scoresHash` skips unchanged games, and paused
  weeks are cheap no-ops.
- **Resilience:** provider outages (e.g. the endpoint returning 404 from some
  hoster regions) are non-fatal — the sync records `lastError`, backs off
  ~30 minutes, keeps serving cached data, and clears the error on the next
  success. If neither mirror is reachable from your region, set `NFL_API_BASE`
  to a reachable mirror as a server-only env var.
- Verified live (2026 season, week 5 at build time): teams, schedule, and
  scoreboard endpoints return weeks, dates, live/final statuses, and scores.

## API surface

All endpoints expect `Authorization: Bearer <Firebase ID token>` (except the
health check):

| Method & path                     | Purpose                                          |
| --------------------------------- | ------------------------------------------------ |
| `GET /`                           | Health check (no auth)                           |
| `GET /me`, `PATCH /me`            | Profile (auto-created on first use) / update     |
| `POST /leagues`                   | Create league (commissioner)                     |
| `GET /leagues/mine`               | My leagues                                       |
| `GET /leagues/by-code/:code`      | Sanitized preview for the join flow              |
| `POST /leagues/join`              | Join by code (atomic capacity + duplicates)      |
| `GET /leagues/:id`                | League + members (members only)                  |
| `PATCH /leagues/:id`              | Commissioner settings update                     |
| `PATCH /leagues/:id/ready`        | Toggle own ready flag                            |
| `GET /leagues/:id/draft`          | Full draft-room payload (lobby + draft page)     |
| `POST /leagues/:id/draft/start`   | Start the draft (commissioner; rounds in body)   |
| `POST /leagues/:id/draft/pick`    | Submit a pick `{ nflTeamId }` (atomic, turn-checked) |
| `POST /leagues/:id/draft/pause`   | Pause the draft (commissioner)                   |
| `POST /leagues/:id/draft/resume`  | Resume the draft (commissioner)                  |
| `POST /leagues/:id/draft/order/randomize` | Shuffle draft order (commissioner, pre-draft) |
| `POST /leagues/:id/draft/order`   | Manual order `{ order: uid[] }` (commissioner, pre-draft) |
| `PATCH /leagues/:id/draft`        | Pre-draft settings: `rounds` / `draftFormat` / `draftPickTimerSeconds` |
| `GET /nfl/meta`                   | Current season + week pointer                  |
| `GET /nfl/games?season=&week=`    | Cached games for a week (scores + statuses)    |
| `GET /nfl/team/:teamId?season=&league=` | Team record, results, upcoming, fantasy owner |
| `GET /leagues/:id/standings`      | League standings + weekly wins (recomputed)    |
| `GET /leagues/:id/insights`       | Season hub: standings, live, projections, activity, progress, prefs |
| `PATCH /leagues/:id/prefs`        | Commissioner projection/display preferences    |
| `POST /leagues/:id/sync`          | Commissioner-triggered NFL sync (rate limited) |

## Prediction model (transparency)

Championship odds and projected standings are **estimates**, never official.
- Team strength = `(wins + ½·ties + shrinkage·½) / (games + shrinkage)` from the
  confirmed season records.
- P(home win) = logistic((strength_home − strength_away + 0.06) · 10), clamped to
  [0.05, 0.95], with an explicit 2% tie probability.
- Every remaining regular-season game is simulated **once per run** (a single
  outcome applies to both franchises), so no owner can ever receive two fantasy
  wins from one matchup; tied first-place finishers split the title equally.
- Results are seeded by league + games-version, so they are reproducible and
  cached per league until game data changes.

## Security model

- `database.rules.json` denies **all** direct client access — no client can
  rewrite draft state, picks, NFL results, or another player's records.
- Every API request verifies the Firebase ID token with the Admin SDK. Fantasy
  scoring is computed server-side from cached game results — users cannot edit
  outcomes.
- Join codes are generated and reserved server-side (cryptographically random),
  look-ups use a `leagueCodes` index.
- Capacity, duplicate membership, duplicate picks, out-of-turn picks, and
  commissioner privilege are all enforced in server transactions — the client
  can only ask.
- Draft timers use **server timestamps**: on expiry an atomic autopick advances
  the draft (random available team). The scheduled `draft-clock` function
  (cron in `netlify.toml`) plus lazy expiry on every poll keeps the draft moving
  with nobody online.

## Deployment

```bash
npx firebase login && npx firebase use <project-id>
npx firebase deploy --only database     # RTDB rules (still locked for clients)
```
Netlify deploy: push the repo and set env vars `FIREBASE_SERVICE_ACCOUNT`,
`FIREBASE_DATABASE_URL` (optional), `VITE_FIREBASE_*`. `netlify.toml` registers
both scheduled functions (`draft-clock` every minute, `nfl-sync` every 10
minutes) — no extra config needed.

### When the provider blocks cloud egress (e.g. Netlify's region)

ESPN's public endpoints occasionally 404 from cloud/datacenter IP ranges (they
currently do from Netlify's region — `scoreboard` fails). Scoring is **entirely
server-side**: the scheduled `nfl-sync` retries automatically (30‑min backoff)
and, if every per-week scoreboard call fails, **falls back to walking each
team's schedule endpoint** and reconstructing the same season game set — a
different data path that may not be blocked. Records, standings, activity and
projections all derive from whatever the server successfully stored.

If both paths are blocked from a hosting region:
- `npm run sync:nfl` runs the exact same sync locally with `.env`'s service account
  (idempotent, rate-limited) and is meant for deep backfills.
- `NFL_API_BASE` (server-side env var) can point the sync at a reachable mirror.

Nothing in the app lets a user push scoring data — providers are only ever
fetched by the server.

### Troubleshooting

- **Request logging:** every API call logs one JSON line — `method`, `path`,
  `uid`, `status`, `code`, `message`, `durationMs`. In Netlify → Functions →
  logs, search for `"level":"warn"` (4xx) or `"fn":"join"` to see why a join or
  other request was rejected. Join rejections additionally log the league's
  `status`, `memberCount`, `maxParticipants`, `alreadyMember`, and `season`, so
  the exact failure reason is visible without guesswork.
- **`DEP0169 url.parse()` deprecation warnings** in function logs are benign:
  they come from `firebase-admin`'s internal libraries, not Fantasy Teams code.
  If the noise is distracting, set `NODE_OPTIONS=--no-deprecation` as a Netlify
  environment variable (note: this silences all deprecation warnings for the
  function runtime).
- **`nfl-sync` "Provider responded 404"** means the public NFL endpoint is
  unreachable from your hosting region. The sync now falls back to a second
  mirror automatically, backs off for ~30 minutes, and keeps serving cached
  data — no action needed. If both mirrors are blocked, set `NFL_API_BASE` to a
  reachable mirror (server-side env var only).

## Stage roadmap

- **Stage 5** — trading between owners, keepers/waivers, playoff brackets, and
  live win-toast updates during games beyond the current polling cadence.

## Disclaimer

Not affiliated with or endorsed by the NFL. Team names/colors are used for
reference in a private fan game.