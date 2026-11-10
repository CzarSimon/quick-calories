# Quick Calories

A personal calorie and macro tracker for a periodised training week. You plan each microcycle day's kcal target and standard meals once, and the app mostly asks you to confirm what you ate.

- Product requirements: [`docs/PRD.md`](docs/PRD.md)
- Technical design: [`docs/DESIGN.md`](docs/DESIGN.md)
- Clickable mockup: [`docs/mockups/index.html`](docs/mockups/index.html)
- Backend hosting and operations: [`backend/README.md`](backend/README.md)
- First release and phone install: [`docs/RELEASE.md`](docs/RELEASE.md)

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

## Milestones

- **M0:** scaffold, backend schema, dev seed (done)
- **M1:** domain calculations + tests
- **M2:** Library
- **M3:** Schedules editor
- **M4:** Today and slot confirmation
- **M5:** Notifications
- **M6:** HealthKit, microcycles, redistribution, Week
- **M7:** Offline hardening
