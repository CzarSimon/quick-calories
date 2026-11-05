# Quick Calories

A personal calorie and macro tracker for a periodised training week. You plan each microcycle day's kcal target and standard meals once, and the app mostly asks you to confirm what you ate.

- Product requirements: [`docs/PRD.md`](docs/PRD.md)
- Technical design: [`docs/DESIGN.md`](docs/DESIGN.md)
- Clickable mockup: [`docs/mockups/index.html`](docs/mockups/index.html)

## Repository

| Path | What |
|---|---|
| `app/` | iOS app: Expo (SDK 58), TypeScript, expo-router |
| `pocketbase/` | PocketBase schema migrations, dev seed and local tooling (see [`pocketbase/README.md`](pocketbase/README.md)) |

## Running locally

### 1. Backend

Start PocketBase and seed your account: follow [`pocketbase/README.md`](pocketbase/README.md).

### 2. App

```bash
cd app
npm install
cp .env.example .env
```

In `.env`, set `EXPO_PUBLIC_PB_URL` to an address your phone can reach, for example `http://<your-mac-ip>:8090`. PocketBase must then listen on `0.0.0.0:8090`.

The app uses native modules, so it runs in a **development build**, not Expo Go. Build one either way:

- On a Mac with Xcode:

  ```bash
  npm run ios
  ```

- In the cloud with EAS. Install the resulting build on your iPhone, then start the dev server:

  ```bash
  npx eas-cli@latest build --profile development --platform ios
  ```

  ```bash
  npm start
  ```

### Checks

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

- **M0:** scaffold, PocketBase schema, dev seed (done)
- **M1:** domain calculations + tests
- **M2:** Library
- **M3:** Schedules editor
- **M4:** Today and slot confirmation
- **M5:** Notifications
- **M6:** HealthKit, microcycles, redistribution, Week
- **M7:** Offline hardening
