# Fantasy Teams

Fantasy Teams is a multiplayer fantasy football game where managers draft
entire NFL teams instead of individual players. League scoring is based on the
performance of each manager's drafted teams.

## Features

- Snake or linear drafts with server-authoritative timers
- Active and benched team rosters
- Team drops, claims, and configurable trading
- Live standings, scores, projections, and league activity
- Commissioner controls, audit history, bans, and league settings
- Realtime updates through Firebase Realtime Database signals
- Firebase Authentication with Google and email/password sign-in

## Requirements

- Node.js 24.12+ (24.x)
- A Firebase project with:
  - Authentication enabled
  - Realtime Database enabled
  - A registered web app
  - A server service account
- Netlify for production hosting and serverless functions

## Local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Firebase

Copy the example environment file:

```bash
cp .env.example .env
```

Fill in the Firebase web app values:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_DATABASE_URL=
```

Add the server-only values:

```env
FIREBASE_SERVICE_ACCOUNT=
FIREBASE_DATABASE_URL=
```

`FIREBASE_SERVICE_ACCOUNT` must contain the service-account JSON. Never use a
`VITE_` prefix for server secrets.

`THE_ODDS_API_KEY` is optional. It enables external betting-market forecasts;
the rest of the application works without it.

### 3. Deploy database rules

Deploy [database.rules.json](./database.rules.json)
to the Firebase project before using realtime updates:

```bash
npx firebase login
npx firebase use <project-id>
npx firebase deploy --only database
```

### 4. Start the app

Run the frontend and Netlify Functions in separate terminals:

```bash
npm run dev
npx netlify functions:serve
```

Or run both together:

```bash
npx netlify dev
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Create a production build |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | Run TypeScript checks |
| `npm run lint` | Run ESLint |
| `npm test` | Run the test suite |
| `npm run sync:nfl` | Run an NFL data sync locally |

## Deployment

The site is configured for Netlify in [netlify.toml](./netlify.toml).

Use:

- Build command: `npm run build`
- Publish directory: `dist`

Configure these Netlify environment variables:

- `VITE_FIREBASE_*` web app settings
- `VITE_FIREBASE_DATABASE_URL`
- `FIREBASE_SERVICE_ACCOUNT`
- `FIREBASE_DATABASE_URL`
- `ALLOWED_ORIGINS`
- Optional: `THE_ODDS_API_KEY`

Set `ALLOWED_ORIGINS` to the production site URL, for example:

```env
ALLOWED_ORIGINS=https://fantasyteams.example.com
```

## Security

- API requests require verified Firebase ID tokens.
- League membership and commissioner permissions are checked server-side.
- Critical draft, roster, claim, and trade mutations use server-side locking.
- Firebase client writes are disabled.
- Realtime listeners expose only change signals; application data remains behind
  the authenticated API.
- Request rate limiting and restricted CORS are enforced by the API.
- League mutations are recorded in the commissioner audit log.

## Project structure

```text
src/                    React application
netlify/functions/api.ts Authenticated API
netlify/functions/lib/  Server services and shared logic
database.rules.json     Firebase Realtime Database rules
tests/                  Vitest tests
```
