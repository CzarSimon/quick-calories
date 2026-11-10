# First release and phone install

This covers two things:
1. Deploying the app schema to the hosted `quick-calories` PocketBase project.
2. Installing a development build on your iPhone.

The deploy commands come from [`backend/README.md`](../backend/README.md). That file and the pocketbase-paas docs it links to are the source of truth; reinspect production before deploying.

> **After this release the schema is frozen except for additive changes.** The upgrade gate rejects changes to existing fields, access rules and the auth configuration. New optional fields and new collections are fine.

## 1. Check the release source

From a clean checkout of the commit you want to release:

```bash
npm install
```

```bash
npm run test:backend
```

Expected result: `Backend tests on pocketbase version 0.40.4: 151 passed, 0 failed`.

The release contains only `backend/`: five migrations and no hooks. Git doesn't track the empty `backend/pb_hooks/`, so if the packer expects the directory, create it before packing:

```bash
mkdir -p backend/pb_hooks
```

The seed in `scripts/` is never part of the release.

## 2. Pack, dry-run, deploy (operator)

Follow "Prepare and deploy the initial app release" in `backend/README.md`. In short, with `PBPAAS_REPO`, `PBPAAS_SSH_KEY` and `PBPAAS_KNOWN_HOSTS` set:

```bash
mkdir -p .local/releases
```

```bash
release_commit=$(git rev-parse HEAD)
artifact="$PWD/.local/releases/quick-calories-$release_commit.json"
node "$PBPAAS_REPO/dist/cli/main.js" release pack quick-calories --source "$PWD/backend" --commit "$release_commit" --version 0.40.4 --output "$artifact"
```

Then follow `backend/README.md` for the rest:
1. `project inspect`, `auth-status` and `doctor`
2. `scp` the artifact
3. `deploy --dry-run`
4. `deploy`

Deploy into the empty database. Don't create users or records before the initial deployment.

## 3. After deployment

1. Create your account in the production dashboard. Signup is closed, so the app can't create accounts. Open the dashboard via `sudo pbpaas project dashboard quick-calories` over SSH, go to Collections → **users** → New record, and fill in your email and password. Don't use the Superusers collection: a superuser account can't sign in to the app.
2. Optional: give your account the starter Q4 training schedule. This uses your own login (no superuser) and runs from any machine with Node:

   ```bash
   PB_URL=https://quick-calories.pb.simonlilja.eu PB_EMAIL=you@example.com PB_PASSWORD='<your-password>' npm run seed
   ```

3. Smoke checks:
   - `https://quick-calories.pb.simonlilja.eu/api/health` returns 200.
   - Signing in through the app works.
   - Signing out returns you to the login screen.
4. Record the source commit, release ID, validation results and backup IDs, as `backend/README.md` asks.

## 4. Install on your iPhone (EAS development build)

The `development`, `preview` and `production` profiles in `app/eas.json` point the app at the production backend.

From `app/`:

```bash
npx eas-cli@latest login
```

```bash
npx eas-cli@latest init
```

`init` links the project to your Expo account and writes `extra.eas.projectId` into `app.json`. Commit that change.

If your iPhone isn't registered with your Apple developer account yet:

```bash
npx eas-cli@latest device:create
```

```bash
npx eas-cli@latest build --profile development --platform ios
```

1. Install the build from the link or QR code EAS gives you.
2. Start the dev server on your Mac with `npm start`.
3. Open the Quick Calories dev build on the phone; it finds the dev server on the same Wi-Fi.
4. Sign in with the account from step 3.1.

The JavaScript is served by Metro from your Mac, so the backend address comes from `app/.env` there. Without `app/.env`, the app uses production.

The bundle id `com.czarsimon.quickcalories` is a placeholder. Change `ios.bundleIdentifier` in `app/app.json` before the first build if you want a different one.
