#!/usr/bin/env node
// Backend access-rule tests against a throwaway local PocketBase built from backend/pb_migrations.
//
// Usage: npm run test:backend
//
// Starts ./pocketbase (downloaded by scripts/ensure-pocketbase.sh) on a free port with a fresh
// temporary data dir, creates a local superuser and two users, and checks: anonymous denial,
// closed signup, two-user isolation, owner assignment, references to other users' records,
// expired/tampered sessions, logout, the dev seed, a full happy-path record chain, unplanned
// slots (client-chosen id, no plan slot), and that
// all migrations roll back and re-apply.

import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import PocketBase from "pocketbase";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(ROOT, "pocketbase");
const MIGRATIONS = join(ROOT, "backend", "pb_migrations");
const HOOKS = join(ROOT, "backend", "pb_hooks");
const ADMIN = { email: "admin@test.local", password: "admin-pass-1234" };
const PASSWORD = "user-pass-1234";

const COLLECTIONS = [
  "settings",
  "foods",
  "meals",
  "meal_items",
  "labels",
  "schedules",
  "day_plans",
  "plan_slots",
  "plan_slot_items",
  "microcycles",
  "day_logs",
  "log_slots",
  "log_entries",
];

// ---------- tiny test harness ----------
let passed = 0;
const failures = [];
async function check(name, fn) {
  try {
    await fn();
    passed++;
  } catch (err) {
    failures.push(`${name}: ${err?.message ?? err}${err?.response?.data ? " " + JSON.stringify(err.response.data) : ""}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
async function rejects(promise, what) {
  try {
    await promise;
  } catch (err) {
    if (err?.status >= 400 && err?.status < 500) return err.status;
    throw new Error(`${what}: unexpected error ${err?.status ?? ""} ${err?.message ?? err}`);
  }
  throw new Error(`${what}: was allowed`);
}

// ---------- server lifecycle ----------
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function pbCmd(dataDir, args, input) {
  return execFileSync(BIN, [...args, `--dir=${dataDir}`, `--migrationsDir=${MIGRATIONS}`, `--hooksDir=${HOOKS}`], {
    input,
    stdio: ["pipe", "pipe", "pipe"],
  }).toString();
}

async function startServer(dataDir, port) {
  const proc = spawn(BIN, ["serve", "--automigrate=false", `--http=127.0.0.1:${port}`, `--dir=${dataDir}`, `--migrationsDir=${MIGRATIONS}`, `--hooksDir=${HOOKS}`], {
    stdio: "ignore",
  });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return { proc, url };
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill();
  throw new Error("PocketBase did not start");
}

function client(url) {
  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  return pb;
}

async function signIn(url, email) {
  const pb = client(url);
  await pb.collection("users").authWithPassword(email, PASSWORD);
  return pb;
}

// ---------- fixtures ----------
let dateCounter = 0;
let dayIndexCounter = 0;
const nextDate = () => `2027-01-${String(++dateCounter).padStart(2, "0")}`;

/** Creates one record in every collection for the signed-in user; returns {collection: id}. */
async function createChain(pb) {
  const user = pb.authStore.record.id;
  const c = (name, data) => pb.collection(name).create({ user, ...data });
  const ids = {};
  ids.foods = (await c("foods", { name: "Oats", ref_amount: 100, unit: "g", kcal: 370, carbs_g: 60, protein_g: 13, fat_g: 7, source: "manual" })).id;
  ids.meals = (await c("meals", { name: "Base breakfast", source: "manual" })).id;
  ids.meal_items = (await c("meal_items", { meal: ids.meals, food: ids.foods, quantity: 120 })).id;
  ids.labels = (await c("labels", { name: `L${user}` })).id;
  ids.schedules = (await c("schedules", { name: "Test", labels: [ids.labels], adjustment_mode: "even" })).id;
  ids.day_plans = (await c("day_plans", { schedule: ids.schedules, day_index: 0, kcal: 3500, macro_overrides: {} })).id;
  ids.plan_slots = (await c("plan_slots", { day_plan: ids.day_plans, name: "Breakfast", time: "09:00", kind: "planned" })).id;
  ids.plan_slot_items = (await c("plan_slot_items", { slot: ids.plan_slots, meal: ids.meals, quantity: 1 })).id;
  ids.microcycles = (await c("microcycles", { start_date: "2026-11-02", length: 7 })).id;
  ids.day_logs = (await c("day_logs", { date: nextDate(), microcycle: ids.microcycles, schedule: ids.schedules, day_plan: ids.day_plans, day_index: 0 })).id;
  ids.log_slots = (await c("log_slots", { day_log: ids.day_logs, plan_slot: ids.plan_slots, name: "Breakfast", time: "09:00", kind: "planned", status: "pending" })).id;
  ids.log_entries = (await c("log_entries", { log_slot: ids.log_slots, meal: ids.meals, name: "Base breakfast", quantity: 1, kcal: 725, origin: "planned", source: "manual" })).id;
  ids.settings = (
    await c("settings", {
      protein_target_gkg: 2,
      protein_floor_gkg: 1.6,
      fat_target_gkg: 0.8,
      fat_floor_gkg: 0.8,
      carb_floor_gkg: 4,
      max_daily_change_pct: 15,
      microcycle_length_days: 7,
      microcycle_anchor_date: "2026-11-02",
    })
  ).id;
  return ids;
}

/** Every reference to another owned record: [collection, field, multi, payload(ownIds) without that field]. */
const REFERENCES = [
  ["meal_items", "meal", false, (o) => ({ food: o.foods, quantity: 1 })],
  ["meal_items", "food", false, (o) => ({ meal: o.meals, quantity: 1 })],
  ["schedules", "labels", true, () => ({ name: "S", adjustment_mode: "even" })],
  ["day_plans", "schedule", false, () => ({ day_index: ++dayIndexCounter % 28, kcal: 3000 })],
  ["plan_slots", "day_plan", false, () => ({ name: "X", time: "10:00", kind: "planned" })],
  ["plan_slot_items", "slot", false, (o) => ({ food: o.foods, quantity: 1 })],
  ["plan_slot_items", "food", false, (o) => ({ slot: o.plan_slots, quantity: 1 })],
  ["plan_slot_items", "meal", false, (o) => ({ slot: o.plan_slots, quantity: 1 })],
  ["day_logs", "microcycle", false, () => ({ date: nextDate(), day_index: 0 })],
  ["day_logs", "schedule", false, (o) => ({ date: nextDate(), microcycle: o.microcycles, day_index: 0 })],
  ["day_logs", "day_plan", false, (o) => ({ date: nextDate(), microcycle: o.microcycles, day_index: 0 })],
  ["log_slots", "day_log", false, () => ({ name: "X", time: "10:00", kind: "planned", status: "pending" })],
  ["log_slots", "plan_slot", false, (o) => ({ day_log: o.day_logs, name: "X", time: "10:00", kind: "planned", status: "pending" })],
  ["log_entries", "log_slot", false, () => ({ name: "X", origin: "adhoc", source: "manual" })],
  ["log_entries", "food", false, (o) => ({ log_slot: o.log_slots, name: "X", origin: "adhoc", source: "manual" })],
  ["log_entries", "meal", false, (o) => ({ log_slot: o.log_slots, name: "X", origin: "adhoc", source: "manual" })],
];

// ---------- tests ----------
async function run() {
  execFileSync(join(ROOT, "scripts", "ensure-pocketbase.sh"), { stdio: "inherit" });
  const version = execFileSync(BIN, ["--version"]).toString().trim();
  const dataDir = mkdtempSync(join(tmpdir(), "qc-pb-"));
  const port = await freePort();
  let server;

  try {
    pbCmd(dataDir, ["migrate", "up"]);
    pbCmd(dataDir, ["superuser", "upsert", ADMIN.email, ADMIN.password]);
    server = await startServer(dataDir, port);
    const { url } = server;

    const admin = client(url);
    await admin.collection("_superusers").authWithPassword(ADMIN.email, ADMIN.password);
    for (const email of ["a@test.local", "b@test.local", "c@test.local"]) {
      await admin.collection("users").create({ email, password: PASSWORD, passwordConfirm: PASSWORD, verified: true });
    }

    const A = await signIn(url, "a@test.local");
    const B = await signIn(url, "b@test.local");
    const aId = A.authStore.record.id;
    const bId = B.authStore.record.id;

    const a = await createChain(A);
    const b = await createChain(B);

    // 1. Anonymous access and signup
    const anon = client(url);
    for (const name of COLLECTIONS) {
      await check(`anonymous list ${name}`, async () => {
        const res = await anon.collection(name).getList(1, 50);
        assert(res.items.length === 0, `saw ${res.items.length} records`);
      });
      await check(`anonymous view ${name}`, () => rejects(anon.collection(name).getOne(a[name]), "view"));
      await check(`anonymous create ${name}`, () => rejects(anon.collection(name).create({ user: aId }), "create"));
    }
    await check("anonymous signup closed", () =>
      rejects(anon.collection("users").create({ email: "new@test.local", password: PASSWORD, passwordConfirm: PASSWORD }), "signup"),
    );
    await check("signed-in user cannot create users", () =>
      rejects(B.collection("users").create({ email: "new2@test.local", password: PASSWORD, passwordConfirm: PASSWORD }), "create user"),
    );

    // 2. Users collection
    await check("user lists only own account", async () => {
      const res = await B.collection("users").getList(1, 50);
      assert(res.items.length === 1 && res.items[0].id === bId, "saw other accounts");
    });
    await check("user cannot view another account", () => rejects(B.collection("users").getOne(aId), "view user"));
    await check("user cannot update another account", () => rejects(B.collection("users").update(aId, { name: "x" }), "update user"));
    await check("user cannot delete own account from app", () => rejects(B.collection("users").delete(bId), "delete self"));

    // 3. Two-user isolation
    for (const name of COLLECTIONS) {
      await check(`isolation list ${name}`, async () => {
        const items = await B.collection(name).getFullList();
        assert(items.every((r) => r.user === bId), "saw another user's records");
        assert(items.some((r) => r.id === b[name]), "missing own record");
      });
      await check(`isolation view ${name}`, () => rejects(B.collection(name).getOne(a[name]), "view"));
      await check(`isolation update ${name}`, () => rejects(B.collection(name).update(a[name], {}), "update"));
      await check(`isolation delete ${name}`, () => rejects(B.collection(name).delete(a[name]), "delete"));
    }

    // 4. Ownership assignment
    await check("create with another user's id", () =>
      rejects(B.collection("foods").create({ user: aId, name: "x", ref_amount: 1, unit: "g", source: "manual" }), "create as A"),
    );
    for (const name of COLLECTIONS) {
      await check(`reassign owner ${name}`, () => rejects(B.collection(name).update(b[name], { user: aId }), "reassign"));
    }

    // 5. References to another user's records (control: the same payload with B's own record succeeds)
    for (const [name, field, multi, payload] of REFERENCES) {
      const own = multi ? [b[fieldCollection(field)]] : b[fieldCollection(field)];
      const foreign = multi ? [a[fieldCollection(field)]] : a[fieldCollection(field)];
      await check(`reference create ${name}.${field}`, async () => {
        await rejects(B.collection(name).create({ user: bId, ...payload(b), [field]: foreign }), "foreign ref");
        await B.collection(name).create({ user: bId, ...payload(b), [field]: own });
      });
      await check(`reference update ${name}.${field}`, () =>
        rejects(B.collection(name).update(b[name], { [field]: foreign }), "foreign ref update"),
      );
    }
    await check("reference mixed labels (own + foreign)", () =>
      rejects(B.collection("schedules").update(b.schedules, { labels: [b.labels, a.labels] }), "mixed labels"),
    );
    await check("reference append modifier labels+", () =>
      rejects(B.collection("schedules").update(b.schedules, { "labels+": a.labels }), "labels+"),
    );

    // 6. Sessions
    await check("tampered token rejected", async () => {
      const t = client(url);
      const token = B.authStore.token;
      t.authStore.save(token.slice(0, -4) + (token.endsWith("AAAA") ? "BBBB" : "AAAA"), B.authStore.record);
      await rejects(t.collection("users").authRefresh(), "refresh with tampered token");
    });
    await check("expired token rejected", async () => {
      await admin.collections.update("users", { authToken: { duration: 10 } });
      const C = await signIn(url, "c@test.local");
      await new Promise((r) => setTimeout(r, 11000));
      try {
        await rejects(C.collection("users").authRefresh(), "refresh with expired token");
        const res = await C.collection("foods").getList(1, 50).catch((e) => e);
        assert(res.status === 401 || res.items?.length === 0, "expired token still had access");
      } finally {
        await admin.collections.update("users", { authToken: { duration: 604800 } });
      }
    });
    await check("logout drops access", async () => {
      const L = await signIn(url, "a@test.local");
      L.authStore.clear();
      const res = await L.collection("foods").getList(1, 50);
      assert(res.items.length === 0, "still saw records after logout");
    });

    // 7. Dev seed and happy path
    await check("dev seed for user A", async () => {
      const env = { ...process.env, PB_URL: url, PB_EMAIL: "a@test.local", PB_PASSWORD: PASSWORD };
      execFileSync("node", [join(ROOT, "scripts", "seed.mjs")], { env, stdio: "pipe" });
      execFileSync("node", [join(ROOT, "scripts", "seed.mjs")], { env, stdio: "pipe" }); // idempotent
      const schedules = await A.collection("schedules").getFullList({ filter: 'name = "Q4 training"' });
      assert(schedules.length === 1 && schedules[0].is_active, "seeded schedule missing or not active");
      const plans = await A.collection("day_plans").getFullList({ filter: `schedule = "${schedules[0].id}"` });
      assert(plans.length === 7, `expected 7 day plans, got ${plans.length}`);
      const slots = await A.collection("plan_slots").getFullList({ filter: `day_plan.schedule = "${schedules[0].id}"` });
      assert(slots.length === 31, `expected 31 slots, got ${slots.length}`);
    });
    await check("happy path chain for user A", async () => {
      // createChain already ran for A at the start; verify the chain resolves via expands.
      const entry = await A.collection("log_entries").getOne(a.log_entries, { expand: "log_slot.day_log.microcycle,meal" });
      assert(entry.expand?.log_slot?.expand?.day_log?.expand?.microcycle?.id === a.microcycles, "chain did not resolve");
    });

    // 8. Unplanned slots: logged on the phone with an id chosen there, no plan slot, and items
    // with no food or meal behind them.
    await check("unplanned slot with a client-chosen id and no plan slot", async () => {
      const id = "unplanned00001a";
      const slot = await A.collection("log_slots").create({ id, user: aId, day_log: a.day_logs, plan_slot: "", name: "Fika", time: "10:42", kind: "open", status: "confirmed", sort: 1000 });
      assert(slot.id === id && slot.plan_slot === "", "slot not created as sent");
      const item = await A.collection("log_entries").create({ user: aId, log_slot: id, food: "", meal: "", name: "Carbonara, Trattoria", quantity: 1, kcal: 850, carbs_g: 90, protein_g: 35, fat_g: 38, origin: "adhoc", source: "manual", sort: 0 });
      assert(item.food === "" && item.meal === "", "entry gained a reference");
      await rejects(A.collection("log_slots").create({ id, user: aId, day_log: a.day_logs, name: "Again", time: "10:00", kind: "open", status: "confirmed" }), "same id twice");
      await A.collection("log_slots").delete(id);
    });
    await check("unplanned slot in another user's day is refused", () =>
      rejects(B.collection("log_slots").create({ id: "unplanned00002b", user: bId, day_log: a.day_logs, plan_slot: "", name: "Fika", time: "10:42", kind: "open", status: "confirmed", sort: 1000 }), "foreign day log"),
    );
  } finally {
    server?.proc.kill();
    await new Promise((r) => setTimeout(r, 300));
  }

  // 9. Rollback and re-apply
  await check("migrations roll back and re-apply", async () => {
    const out = pbCmd(dataDir, ["migrate", "down", "5"], "y\n");
    assert(/Reverted 1762300000_auth\.js/.test(out), "down did not revert all app migrations");
    const up = pbCmd(dataDir, ["migrate", "up"]);
    assert(/Applied 1762300004_tracking\.js/.test(up), "up did not re-apply");
  });

  rmSync(dataDir, { recursive: true, force: true });

  console.log(`\nBackend tests on ${version}: ${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  FAIL ${f}`);
  process.exit(failures.length ? 1 : 0);
}

function fieldCollection(field) {
  return (
    {
      meal: "meals",
      food: "foods",
      labels: "labels",
      schedule: "schedules",
      day_plan: "day_plans",
      slot: "plan_slots",
      microcycle: "microcycles",
      day_log: "day_logs",
      plan_slot: "plan_slots",
      log_slot: "log_slots",
    }[field] ?? field
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
