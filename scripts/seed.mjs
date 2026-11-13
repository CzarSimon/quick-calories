#!/usr/bin/env node
// Dev-only seed: settings + the "Q4 training" schedule skeleton (day targets and slots, no foods).
// This is NOT a migration and is never part of a deployment.
//
// Usage:
//   PB_URL=http://127.0.0.1:8090 PB_EMAIL=me@example.com PB_PASSWORD=secret npm run seed -- [--create-user] [--reset]
//
//   --create-user  create the user if missing (needs PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD of a superuser)
//   --reset        delete this user's settings, seeded schedule and "Q4" label first, then seed again

import PocketBase from "pocketbase";

const SCHEDULE_NAME = "Q4 training";
const LABEL_NAME = "Q4";

const SETTINGS = {
  protein_target_gkg: 2.0,
  protein_floor_gkg: 1.6,
  fat_target_gkg: 0.8,
  fat_floor_gkg: 0.8,
  carb_floor_gkg: 4.0,
  max_daily_change_pct: 15,
  fallback_weight_kg: 82,
  microcycle_length_days: 7,
  microcycle_anchor_date: "2026-11-02", // a Monday
  nudge_evening_time: "21:00",
  nudge_morning_time: "08:00",
};

// Mon..Sun daily kcal targets (maintenance-level fuel) from the Q4 plan.
const DAY_KCAL = [3500, 3950, 3600, 3800, 3300, 3100, 3100];

const WEEKDAY_SLOTS = [
  { name: "Breakfast", time: "09:00", kind: "planned", notify: true },
  { name: "Pre-lunch snack", time: "11:30", kind: "planned", notify: true },
  { name: "Lunch", time: "13:00", kind: "planned", notify: true },
  { name: "Dinner", time: "18:30", kind: "open", notify: false },
  { name: "Evening snack", time: "20:30", kind: "planned", notify: true },
];
const WEEKEND_SLOTS = [
  { name: "Breakfast", time: "09:00", kind: "open", notify: false },
  { name: "Lunch", time: "13:00", kind: "open", notify: false },
  { name: "Dinner", time: "18:30", kind: "open", notify: false },
];

function env(name, required = true) {
  const v = process.env[name];
  if (required && !v) {
    console.error(`Missing environment variable ${name}`);
    process.exit(1);
  }
  return v;
}

const args = new Set(process.argv.slice(2));
const url = env("PB_URL", false) || "http://127.0.0.1:8090";
const email = env("PB_EMAIL");
const password = env("PB_PASSWORD");
if (/^<?your-password>?$/.test(password)) {
  console.error("PB_PASSWORD is still the placeholder from the docs. Use your real password, in single quotes.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The hosted server rate-limits requests (HTTP 429). Retry with backoff instead of failing midway.
function client() {
  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  const send = pb.send.bind(pb);
  pb.send = async (path, options) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await send(path, options);
      } catch (err) {
        if (err?.status !== 429 || attempt >= 8) throw err;
        const wait = Math.min(2000 * 2 ** attempt, 30000);
        process.stdout.write(`Rate limited by the server, waiting ${wait / 1000}s…\n`);
        await sleep(wait);
      }
    }
  };
  return pb;
}

async function ensureUser() {
  const admin = client();
  await admin.collection("_superusers").authWithPassword(env("PB_ADMIN_EMAIL"), env("PB_ADMIN_PASSWORD"));
  const existing = await admin.collection("users").getList(1, 1, { filter: admin.filter("email = {:email}", { email }) });
  if (existing.items.length) return;
  await admin.collection("users").create({ email, password, passwordConfirm: password, verified: true });
  console.log(`Created user ${email}`);
}

async function main() {
  if (args.has("--create-user")) await ensureUser();

  const pb = client();
  let auth;
  try {
    auth = await pb.collection("users").authWithPassword(email, password);
  } catch (err) {
    if (err?.status === 400) {
      console.error(
        `Sign-in failed for ${email} at ${url}.\n` +
          "Check that PB_PASSWORD is your real password (single-quoted) and that the account exists in the\n" +
          '"users" collection of the dashboard. A Superusers account cannot sign in to the app.',
      );
      process.exit(1);
    }
    throw err;
  }
  const user = auth.record.id;
  const byName = (name) => pb.filter("name = {:name}", { name });

  if (args.has("--reset")) {
    for (const s of await pb.collection("schedules").getFullList({ filter: byName(SCHEDULE_NAME) })) {
      await pb.collection("schedules").delete(s.id); // day_plans, slots and items cascade
    }
    for (const l of await pb.collection("labels").getFullList({ filter: byName(LABEL_NAME) })) {
      await pb.collection("labels").delete(l.id);
    }
    for (const s of await pb.collection("settings").getFullList()) {
      await pb.collection("settings").delete(s.id);
    }
    console.log("Reset seeded records");
  }

  const existing = await pb.collection("schedules").getFullList({ filter: byName(SCHEDULE_NAME) });
  if (existing.length) {
    const scheduleId = existing[0].id;
    const plans = await pb.collection("day_plans").getFullList({ filter: pb.filter("schedule = {:id}", { id: scheduleId }) });
    const slots = await pb.collection("plan_slots").getFullList({ filter: pb.filter("day_plan.schedule = {:id}", { id: scheduleId }) });
    const expectedSlots = DAY_KCAL.reduce((n, _, i) => n + (i < 5 ? WEEKDAY_SLOTS : WEEKEND_SLOTS).length, 0);
    if (plans.length !== DAY_KCAL.length || slots.length !== expectedSlots) {
      console.error(
        `"${SCHEDULE_NAME}" exists but is incomplete (${plans.length} day plans, ${slots.length} slots), ` +
          "probably from an interrupted run. Run again with --reset to re-seed it.",
      );
      process.exit(1);
    }
    console.log(`"${SCHEDULE_NAME}" already exists for ${email}; nothing to do (use --reset to re-seed).`);
    return;
  }

  const settings = await pb.collection("settings").getFullList();
  if (!settings.length) await pb.collection("settings").create({ user, ...SETTINGS });

  const label =
    (await pb.collection("labels").getFullList({ filter: byName(LABEL_NAME) }))[0] ??
    (await pb.collection("labels").create({ user, name: LABEL_NAME, color: "#D9800F" }));

  // Only one active schedule per user.
  for (const s of await pb.collection("schedules").getFullList({ filter: "is_active = true" })) {
    await pb.collection("schedules").update(s.id, { is_active: false });
  }

  const schedule = await pb.collection("schedules").create({
    user,
    name: SCHEDULE_NAME,
    labels: [label.id],
    is_active: true,
    adjustment_kcal: 0,
    adjustment_mode: "even",
  });

  let slotCount = 0;
  for (const [day_index, kcal] of DAY_KCAL.entries()) {
    const plan = await pb.collection("day_plans").create({
      user,
      schedule: schedule.id,
      day_index,
      kcal,
      macro_overrides: {},
      accepted_imbalance_kcal: 0,
      adjustment_included: true,
      adjustment_custom_kcal: 0,
    });
    const slots = day_index < 5 ? WEEKDAY_SLOTS : WEEKEND_SLOTS;
    for (const [sort, slot] of slots.entries()) {
      await pb.collection("plan_slots").create({ user, day_plan: plan.id, sort, ...slot });
      slotCount++;
    }
  }

  console.log(`Seeded "${SCHEDULE_NAME}" for ${email}: ${DAY_KCAL.length} day plans, ${slotCount} slots.`);
}

main().catch((err) => {
  console.error(err?.response ?? err);
  process.exit(1);
});
