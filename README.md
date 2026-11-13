# Quick Calories

A personal calorie and macro tracker for a periodised training week. You plan each microcycle day's kcal target and standard meals once, and the app mostly asks you to confirm what you ate.

- Product requirements: [`docs/PRD.md`](docs/PRD.md)
- Technical design: [`docs/DESIGN.md`](docs/DESIGN.md)
- Clickable mockup: [`docs/mockups/index.html`](docs/mockups/index.html)
- Backend hosting and operations: [`backend/README.md`](backend/README.md)
- Releasing the backend and installing on an iPhone: [`docs/RELEASE.md`](docs/RELEASE.md)
- Device checklist (notifications, Apple Health, offline): [`docs/NOTIFICATIONS.md`](docs/NOTIFICATIONS.md)
- Design review brief and screenshots: [`docs/design-review/`](docs/design-review/)

## Repository

| Path | What |
|---|---|
| `app/` | iOS app: Expo (SDK 58), TypeScript, expo-router |
| `backend/` | PocketBase migrations (`pb_migrations/`) and hooks (`pb_hooks/`). This is the only thing packed into a release. |
| `scripts/` | Local PocketBase 0.40.4, backend access tests, dev-only seed (never released) |

The backend is the hosted `quick-calories` PocketBase project at `https://quick-calories.pb.simonlilja.eu`.

## Local development

Install the root tooling once:

```bash
npm install
```

Run the backend tests. They start a throwaway PocketBase built from the migrations:

```bash
npm run test:backend
```

Start a local backend. It downloads PocketBase 0.40.4 to `./pocketbase` and keeps its data in `.local/pb_data`:

```bash
npm run backend:dev
```

Create a local superuser (once):

```bash
./pocketbase superuser upsert admin@example.com 'change-me-123' --dir=.local/pb_data
```

Seed a local account with the Q4 training schedule:

```bash
PB_URL=http://127.0.0.1:8090 PB_EMAIL=you@example.com PB_PASSWORD='<your-password>' PB_ADMIN_EMAIL=admin@example.com PB_ADMIN_PASSWORD='change-me-123' npm run seed -- --create-user
```

### App

```bash
cd app
npm install
```

The app talks to production by default. To use a local backend in the simulator, copy `app/.env.example` to `app/.env` and set `EXPO_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090`.

The app uses native modules, so it runs in a development build, not Expo Go. See [`docs/RELEASE.md`](docs/RELEASE.md) for building and installing it on your iPhone.

The `web` platform in `app/app.json` exists only for development and UI checks in a browser (`npx expo start --web`); the product is the iOS app.

Checks (from `app/`):

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm test
```

## Status

**v0.1 prototype.** Every screen in the design is built: Today, Week, Library, Schedules and Settings, with meal reminders, Apple Health body weight, corrections across the week and offline logging.

- **Backend:** the schema is deployed to production (record in [`docs/releases/`](docs/releases/)). From now on only additive schema changes pass the hosting platform's upgrade gate.
- **Tests** (run on every pull request by GitHub Actions, `.github/workflows/ci.yml`): 133 unit tests for the calculations and data logic (`cd app && npm test`) and 151 backend access-rule checks (`npm run test:backend`).
- **Still to verify on an iPhone:** the device checklist in [`docs/NOTIFICATIONS.md`](docs/NOTIFICATIONS.md), which covers notifications, Apple Health and offline use.

**Next**
- A design review: the brief and screenshots are in [`docs/design-review/`](docs/design-review/).
- Describe-a-meal entry with AI, using the user's own AI account. This is out of scope for v1 (see the PRD).

How the prototype was built, milestone by milestone, is in [`docs/DESIGN.md`](docs/DESIGN.md) §7.
