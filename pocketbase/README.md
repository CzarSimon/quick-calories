# Quick Calories — PocketBase backend

- `pb_migrations/`: the schema as versioned JS migrations. **This is the only thing to deploy.**
- `scripts/seed.mjs`: dev-only seed for the "Q4 training" schedule. **Never deployed.** It is not a migration.
- `scripts/dev.sh`: downloads a pinned PocketBase binary into `bin/` and serves it locally with `pb_data/` (both gitignored).

The migrations use the PocketBase v0.23+ API and were tested with v0.40.6.

## Local development

```bash
cd pocketbase
npm install
```

Start PocketBase. Migrations apply automatically on start. To let a phone on your network reach it, use `--http 0.0.0.0:8090`.

```bash
./scripts/dev.sh --http 127.0.0.1:8090
```

In another terminal, create a superuser (only needed once):

```bash
./bin/pocketbase superuser upsert admin@example.com 'change-me-123' --dir pb_data
```

Seed your account. `--create-user` creates the user through the superuser if it doesn't exist yet:

```bash
PB_URL=http://127.0.0.1:8090 PB_EMAIL=you@example.com PB_PASSWORD='your-password' PB_ADMIN_EMAIL=admin@example.com PB_ADMIN_PASSWORD='change-me-123' npm run seed -- --create-user
```

The seed is idempotent: if "Q4 training" already exists, it does nothing. Pass `--reset` to delete your settings, the "Q4 training" schedule and the "Q4" label, and seed them again.

What it creates:
- `settings` with the defaults (protein 2.0/1.6 g/kg, fat 0.8/0.8 g/kg, carb floor 4.0 g/kg, max daily change 15 %, fallback weight 82 kg, 7-day microcycle anchored on Monday 2026-11-02, nudges 21:00 / 08:00)
- the active "Q4 training" schedule with label "Q4"
- day targets Mon–Sun: 3,500 / 3,950 / 3,600 / 3,800 / 3,300 / 3,100 / 3,100 kcal
- slots without foods:
  - Mon–Fri: Breakfast 09:00, Pre-lunch snack 11:30, Lunch 13:00 and Evening snack 20:30 (planned, with notifications); Dinner 18:30 (open)
  - Sat–Sun: Breakfast, Lunch and Dinner, all open

The admin UI is at http://127.0.0.1:8090/_/.

## Deploying to the existing instance

1. Check the server version (v0.23 or newer is required):

   ```bash
   ./pocketbase --version
   ```

2. Copy `pb_migrations/*.js` into the server's `pb_migrations` directory (next to its `pb_data`, or wherever `--migrationsDir` points).
3. Restart PocketBase; pending migrations run on start. Alternatively, run them explicitly:

   ```bash
   ./pocketbase migrate up
   ```

4. Create your user in the admin UI. Don't run the seed against production unless you want the starter schedule there.

To roll back the last N migrations: `./pocketbase migrate down N`.
