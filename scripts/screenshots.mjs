#!/usr/bin/env node
// Screenshots of the app's screens from the web build, with realistic sample data.
//
// Usage: node scripts/screenshots.mjs [--out=DIR] [--only=name,name] [--skip-build] [--scale=1|2] [--check]
//
// --check drives the main logging flows instead (undo, unplanned food offline, remove, quick entry
// saved to the library) and checks the results on screen and on the server. No screenshots.
//
// Starts a throwaway local PocketBase (./pocketbase, from scripts/ensure-pocketbase.sh) with this
// repo's migrations, seeds the "Q4 training" schedule plus a small library, builds the web app
// against it, then drives the app in Chromium with a fixed clock: Monday and Tuesday are logged a
// little under target, and the shots are taken on Wednesday 11 Nov 2026. Each scene is one PNG in
// --out (default .local/screenshots), at 390 pt wide.
//
// Needs Playwright with Chromium (`npm i -g playwright` or available on NODE_PATH). Development
// only: nothing here touches the hosted backend.

import { execFileSync, spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import PocketBase from "pocketbase";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(ROOT, "pocketbase");
const MIGRATIONS = join(ROOT, "backend", "pb_migrations");
const HOOKS = join(ROOT, "backend", "pb_hooks");
// Fixed, because the web build inlines the backend address.
const PB_PORT = 8099;
const PB_URL = `http://127.0.0.1:${PB_PORT}`;
const ADMIN = { email: "admin@screens.local", password: "admin-pass-1234" };
const USER = { email: "runner@screens.local", password: "user-pass-1234" };

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const OUT = args.out ? String(args.out) : join(ROOT, ".local", "screenshots");
const WEB = join(ROOT, ".local", "web");
const ONLY = args.only ? new Set(String(args.only).split(",")) : null;
const SCALE = Number(args.scale ?? 2);

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Playwright is not installed. Run `npm i -g playwright` (or put it on NODE_PATH) and try again.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- backend ----------
function pbCmd(dataDir, cmd) {
  execFileSync(BIN, [...cmd, `--dir=${dataDir}`, `--migrationsDir=${MIGRATIONS}`, `--hooksDir=${HOOKS}`], { stdio: "pipe" });
}

async function startBackend(dataDir) {
  pbCmd(dataDir, ["migrate", "up"]);
  pbCmd(dataDir, ["superuser", "upsert", ADMIN.email, ADMIN.password]);
  const proc = spawn(BIN, ["serve", "--automigrate=false", `--http=127.0.0.1:${PB_PORT}`, `--dir=${dataDir}`, `--migrationsDir=${MIGRATIONS}`, `--hooksDir=${HOOKS}`], {
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${PB_URL}/api/health`)).ok) return proc;
    } catch {
      // not up yet
    }
    await sleep(100);
  }
  proc.kill();
  throw new Error(`PocketBase did not start on port ${PB_PORT}. Is something else using it?`);
}

function seedSchedule() {
  execFileSync("node", [join(ROOT, "scripts", "seed.mjs"), "--create-user"], {
    stdio: "pipe",
    env: { ...process.env, PB_URL, PB_EMAIL: USER.email, PB_PASSWORD: USER.password, PB_ADMIN_EMAIL: ADMIN.email, PB_ADMIN_PASSWORD: ADMIN.password },
  });
}

const FOODS = [
  { name: "Oats", unit: "g", ref_amount: 100, kcal: 372, carbs_g: 60, protein_g: 13, fat_g: 7 },
  { name: "Skyr natural", unit: "g", ref_amount: 100, kcal: 63, carbs_g: 4, protein_g: 11, fat_g: 0.2 },
  { name: "Banana", unit: "piece", ref_amount: 1, kcal: 107, carbs_g: 27, protein_g: 1.3, fat_g: 0.4 },
  { name: "Apple", unit: "piece", ref_amount: 1, kcal: 80, carbs_g: 21, protein_g: 0.4, fat_g: 0.2 },
  { name: "Rice, cooked", unit: "g", ref_amount: 100, kcal: 130, carbs_g: 28, protein_g: 2.7, fat_g: 0.3 },
  { name: "Chicken breast", unit: "g", ref_amount: 100, kcal: 110, carbs_g: 0, protein_g: 23, fat_g: 1.5 },
  { name: "Olive oil", unit: "ml", ref_amount: 10, kcal: 88, carbs_g: 0, protein_g: 0, fat_g: 10 },
  { name: "Granola", unit: "g", ref_amount: 100, kcal: 450, carbs_g: 64, protein_g: 10, fat_g: 16 },
  { name: "Salmon", unit: "g", ref_amount: 100, kcal: 208, carbs_g: 0, protein_g: 20, fat_g: 13 },
  { name: "Potatoes, boiled", unit: "g", ref_amount: 100, kcal: 87, carbs_g: 20, protein_g: 1.9, fat_g: 0.1 },
  { name: "Rye bread", unit: "slice", ref_amount: 1, kcal: 83, carbs_g: 15, protein_g: 2.7, fat_g: 1.1 },
];
const MEALS = [
  { name: "Base breakfast", items: [["Oats", 100], ["Skyr natural", 300], ["Banana", 1]] },
  { name: "Lunch box", items: [["Rice, cooked", 300], ["Chicken breast", 150], ["Olive oil", 10]] },
  { name: "Evening skyr bowl", items: [["Skyr natural", 300], ["Granola", 60]] },
  { name: "Salmon & potatoes", items: [["Salmon", 150], ["Potatoes, boiled", 300], ["Olive oil", 10]] },
];
// What the weekday plan slots hold. Dinner stays open.
const SLOT_ITEMS = {
  Breakfast: [{ meal: "Base breakfast", quantity: 1 }],
  "Pre-lunch snack": [{ food: "Banana", quantity: 1 }, { food: "Apple", quantity: 1 }],
  Lunch: [{ meal: "Lunch box", quantity: 1 }],
  "Evening snack": [{ meal: "Evening skyr bowl", quantity: 1 }],
};

async function seedLibrary() {
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);
  const { record } = await pb.collection("users").authWithPassword(USER.email, USER.password);
  const user = record.id;
  const foods = {};
  for (const food of FOODS) foods[food.name] = (await pb.collection("foods").create({ user, source: "manual", archived: false, ...food })).id;
  const meals = {};
  for (const meal of MEALS) {
    const created = await pb.collection("meals").create({ user, name: meal.name, notes: "", source: "manual", archived: false });
    meals[meal.name] = created.id;
    for (const [food, quantity] of meal.items) await pb.collection("meal_items").create({ user, meal: created.id, food: foods[food], quantity });
  }
  const slots = await pb.collection("plan_slots").getFullList();
  for (const slot of slots) {
    for (const item of SLOT_ITEMS[slot.name] ?? []) {
      if (slot.kind !== "planned") continue;
      await pb.collection("plan_slot_items").create({
        user,
        slot: slot.id,
        food: item.food ? foods[item.food] : "",
        meal: item.meal ? meals[item.meal] : "",
        quantity: item.quantity,
      });
    }
  }
}

// ---------- web app ----------
function buildWeb() {
  if (args["skip-build"] && existsSync(join(WEB, "index.html"))) return;
  console.log("Building the web app…");
  execFileSync("npx", ["expo", "export", "-p", "web", "--output-dir", WEB], {
    cwd: join(ROOT, "app"),
    stdio: "pipe",
    env: { ...process.env, EXPO_PUBLIC_POCKETBASE_URL: PB_URL },
  });
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".ttf": "font/ttf", ".ico": "image/x-icon" };

function serveWeb() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
      let file = join(WEB, path);
      if (!file.startsWith(WEB) || !existsSync(file) || statSync(file).isDirectory()) file = join(WEB, "index.html"); // single-page app
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

// ---------- driving the app ----------
const at = (day, time) => new Date(`2026-11-${day}T${time}:00`);

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await sleep(400);
}

async function goto(page, base, path, when) {
  await page.clock.setFixedTime(when);
  await page.goto(`${base}${path}`);
  await settle(page);
}

const byTestId = (page, id) => page.locator(`[data-testid="${id}"]`).first();

async function signIn(page, base) {
  await page.goto(`${base}/login`);
  await page.getByPlaceholder("Email").fill(USER.email);
  await page.getByPlaceholder("Password").fill(USER.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await settle(page);
}

/** Open a slot's log screen from Today, add a meal or food from the picker, and save. */
async function logFromPicker(page, slotName, itemName) {
  await byTestId(page, `slot-${slotName}`).click();
  await settle(page);
  await byTestId(page, "log-add-item").click();
  await settle(page);
  // Other tabs stay mounted on web, so only consider what is on screen.
  await page.getByText(itemName, { exact: true }).locator("visible=true").first().click();
  await settle(page);
  await byTestId(page, "log-save").click();
  await settle(page);
}

/** Monday and Tuesday: every planned meal confirmed and a family dinner, a little under target. */
async function logEarlierDays(page, base) {
  for (const day of ["09", "10"]) {
    await goto(page, base, "/", at(day, "21:15"));
    await byTestId(page, "confirm-all").click();
    await settle(page);
    await logFromPicker(page, "Dinner", "Salmon & potatoes");
  }
}

// Each scene leaves the app where it found it, or is marked `changes`.
const DARK = new Set(["login", "day-editor", "today", "week", "log-open-dinner", "library-meals", "log-food-new", "today-day-details"]);
const WED = (time = "12:10") => at("11", time);
const SCENES = [
  {
    name: "today",
    run: async (page, base) => {
      await goto(page, base, "/", WED());
    },
  },
  { name: "today-full", full: true, run: async (page, base) => goto(page, base, "/", WED()) },
  {
    name: "today-day-details",
    full: true,
    run: async (page, base) => {
      await goto(page, base, "/", WED());
      await byTestId(page, "day-details").click().catch(() => undefined);
      await sleep(200);
    },
  },
  { name: "log-planned-meal", run: async (page, base) => (await goto(page, base, "/", WED()), byTestId(page, "slot-Lunch").click().then(() => settle(page))) },
  { name: "log-open-dinner", run: async (page, base) => (await goto(page, base, "/", WED()), byTestId(page, "slot-Dinner").click().then(() => settle(page))) },
  {
    name: "picker",
    run: async (page, base) => {
      await goto(page, base, "/", WED());
      await byTestId(page, "slot-Dinner").click();
      await settle(page);
      await byTestId(page, "log-add-item").click();
      await settle(page);
    },
  },
  { name: "today-previous-day", full: true, run: async (page, base) => (await goto(page, base, "/", WED()), byTestId(page, "day-prev").click().then(() => settle(page))) },
  { name: "week", full: true, run: async (page, base) => goto(page, base, "/week", WED()) },
  { name: "library-meals", run: async (page, base) => goto(page, base, "/library", WED()) },
  {
    name: "library-foods",
    run: async (page, base) => {
      await goto(page, base, "/library", WED());
      await page.getByRole("tab", { name: "Foods" }).or(page.getByRole("button", { name: "Foods" })).first().click();
      await sleep(200);
    },
  },
  {
    name: "library-no-match",
    run: async (page, base) => {
      await goto(page, base, "/library", WED());
      await page.getByPlaceholder("Search meals").fill("Pancakes");
      await sleep(200);
    },
  },
  {
    name: "meal-edit",
    full: true,
    run: async (page, base) => {
      await goto(page, base, "/library", WED());
      await page.getByText("Lunch box", { exact: true }).locator("visible=true").first().click();
      await settle(page);
    },
  },
  { name: "food-new", run: async (page, base) => goto(page, base, "/food/new", WED()) },
  { name: "schedules", run: async (page, base) => goto(page, base, "/schedules", WED()) },
  {
    name: "schedule-editor",
    full: true,
    run: async (page, base) => {
      await goto(page, base, "/schedules", WED());
      await page.getByText("Q4 training").locator("visible=true").first().click();
      await settle(page);
    },
  },
  {
    name: "day-editor",
    full: true,
    run: async (page, base) => {
      await goto(page, base, "/schedules", WED());
      await page.getByText("Q4 training").locator("visible=true").first().click();
      await settle(page);
      await page.getByText("Wed", { exact: true }).locator("visible=true").first().click();
      await settle(page);
    },
  },
  { name: "settings", full: true, run: async (page, base) => goto(page, base, "/settings", WED()) },
  { name: "login", signedOut: true, run: async (page, base) => goto(page, base, "/login", WED()) },
  // The scenes below change data on the server, so they come last.
  {
    name: "log-food-new",
    run: async (page, base) => {
      await goto(page, base, "/", WED());
      await byTestId(page, "log-food").click();
      await settle(page);
    },
  },
  {
    name: "quick-entry",
    changes: true,
    run: async (page, base) => {
      await goto(page, base, "/", WED());
      await byTestId(page, "log-food").click();
      await settle(page);
      await byTestId(page, "log-add-item").click();
      await settle(page);
      await byTestId(page, "picker-quick-entry").click();
      await sleep(300);
      await byTestId(page, "quick-name").fill("Cinnamon bun, café");
      await byTestId(page, "quick-kcal").fill("390");
      await byTestId(page, "quick-carbs").fill("48");
      await byTestId(page, "quick-protein").fill("6");
      await byTestId(page, "quick-fat").fill("16");
      await sleep(200);
    },
  },
  {
    name: "today-unplanned",
    full: true,
    changes: true,
    run: async (page, base) => {
      await goto(page, base, "/", WED());
      await byTestId(page, "log-food").click();
      await settle(page);
      await byTestId(page, "log-add-item").click();
      await settle(page);
      await byTestId(page, "picker-quick-entry").click();
      await sleep(300);
      await byTestId(page, "quick-name").fill("Cinnamon bun, café");
      await byTestId(page, "quick-kcal").fill("390");
      await byTestId(page, "quick-carbs").fill("48");
      await byTestId(page, "quick-protein").fill("6");
      await byTestId(page, "quick-fat").fill("16");
      await byTestId(page, "quick-add").click();
      await sleep(300);
      await byTestId(page, "log-name").fill("Fika");
      await byTestId(page, "log-time").fill("10:42");
      await byTestId(page, "log-save").click();
      await settle(page);
    },
  },
  {
    name: "log-unplanned",
    run: async (page, base) => {
      await goto(page, base, "/", WED());
      await byTestId(page, "slot-Fika").click();
      await settle(page);
    },
  },
  {
    name: "today-over",
    full: true,
    changes: true,
    run: async (page, base) => {
      await goto(page, base, "/", WED("19:30"));
      await byTestId(page, "slot-Dinner").click();
      await settle(page);
      await byTestId(page, "log-add-item").click();
      await settle(page);
      await byTestId(page, "picker-quick-entry").click();
      await sleep(300);
      await byTestId(page, "quick-name").fill("Pizza night");
      await byTestId(page, "quick-kcal").fill("2600");
      await byTestId(page, "quick-add").click();
      await sleep(300);
      await byTestId(page, "log-save").click();
      await settle(page);
      await byTestId(page, "day-details").click();
      await sleep(200);
    },
  },
];

// ---------- flow checks (--check) ----------
function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function userClient() {
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);
  await pb.collection("users").authWithPassword(USER.email, USER.password);
  return pb;
}

const rowText = async (page, name) => (await byTestId(page, `slot-${name}`).count()) ? byTestId(page, `slot-${name}`).innerText() : null;

async function logQuick(page, { name, kcal, slotName, time }) {
  await byTestId(page, "log-add-item").click();
  await settle(page);
  await byTestId(page, "picker-quick-entry").click();
  await sleep(300);
  await byTestId(page, "quick-name").fill(name);
  await byTestId(page, "quick-kcal").fill(String(kcal));
  await byTestId(page, "quick-add").click();
  await sleep(300);
  if (slotName) await byTestId(page, "log-name").fill(slotName);
  if (time) await byTestId(page, "log-time").fill(time);
  await byTestId(page, "log-save").click();
  await settle(page);
}

const CHECKS = [
  [
    "confirming from the card and undoing it",
    async (page, base) => {
      await goto(page, base, "/", WED());
      await byTestId(page, "confirm-next").click();
      await settle(page);
      assert((await rowText(page, "Pre-lunch snack")).includes("Confirmed"), "snack not confirmed");
      await byTestId(page, "toast-action").click();
      await settle(page);
      assert((await rowText(page, "Pre-lunch snack")).includes("Unconfirmed"), "undo did not reopen the snack");
    },
  ],
  [
    "logging unplanned food and undoing it",
    async (page, base) => {
      await goto(page, base, "/", WED());
      await byTestId(page, "log-food").click();
      await settle(page);
      await logQuick(page, { name: "Espresso", kcal: 5, slotName: "Coffee", time: "11:00" });
      assert(await rowText(page, "Coffee"), "unplanned row missing");
      await byTestId(page, "toast-action").click();
      await settle(page);
      assert(!(await rowText(page, "Coffee")), "undo did not remove the row");
      const pb = await userClient();
      assert((await pb.collection("log_slots").getFullList({ filter: 'name = "Coffee"' })).length === 0, "slot left on the server");
    },
  ],
  [
    "logging unplanned food offline, then syncing once",
    async (page, base, context) => {
      await goto(page, base, "/", WED());
      // The web build loads each screen's code on first use (the phone has it all), so open the
      // log screen once while online.
      await byTestId(page, "log-food").click();
      await settle(page);
      await page.goBack();
      await settle(page);
      await context.setOffline(true);
      await byTestId(page, "log-food").click();
      await settle(page);
      await logQuick(page, { name: "Cinnamon bun", kcal: 390, slotName: "Fika", time: "10:42" });
      assert(await rowText(page, "Fika"), "unplanned row missing while offline");
      await context.setOffline(false);
      await page.reload();
      await settle(page);
      await sleep(1500);
      await settle(page);
      assert(await rowText(page, "Fika"), "unplanned row missing after reconnecting");
      const pb = await userClient();
      const slots = await pb.collection("log_slots").getFullList({ filter: 'name = "Fika"' });
      assert(slots.length === 1, `expected one Fika on the server, found ${slots.length}`);
      const entries = await pb.collection("log_entries").getFullList({ filter: pb.filter("log_slot = {:id}", { id: slots[0].id }) });
      assert(entries.length === 1 && entries[0].kcal === 390 && entries[0].food === "", "entry not stored as typed");
    },
  ],
  [
    "editing and removing an unplanned slot",
    async (page, base) => {
      await goto(page, base, "/", WED());
      await byTestId(page, "slot-Fika").click();
      await settle(page);
      await byTestId(page, "log-time").fill("15:05");
      await byTestId(page, "log-save").click();
      await settle(page);
      assert((await rowText(page, "Fika")).includes("15:05"), "new time not shown");
      await byTestId(page, "slot-Fika").click();
      await settle(page);
      await byTestId(page, "log-remove").click();
      await byTestId(page, "log-remove-confirm").click();
      await settle(page);
      assert(!(await rowText(page, "Fika")), "row still shown after removing");
      const pb = await userClient();
      assert((await pb.collection("log_slots").getFullList({ filter: 'name = "Fika"' })).length === 0, "slot left on the server");
    },
  ],
  [
    "quick entry saved to the library",
    async (page, base) => {
      await goto(page, base, "/", WED("19:30"));
      await byTestId(page, "slot-Dinner").click();
      await settle(page);
      await byTestId(page, "log-add-item").click();
      await settle(page);
      await byTestId(page, "picker-quick-entry").click();
      await sleep(300);
      await byTestId(page, "quick-name").fill("Carbonara, Trattoria");
      await byTestId(page, "quick-carbs").fill("90");
      await byTestId(page, "quick-protein").fill("35");
      await byTestId(page, "quick-fat").fill("38");
      await byTestId(page, "quick-save-library").click();
      await byTestId(page, "quick-add").click();
      await settle(page);
      await byTestId(page, "log-save").click();
      await settle(page);
      assert((await rowText(page, "Dinner")).includes("Carbonara"), "dinner not logged");
      const pb = await userClient();
      const foods = await pb.collection("foods").getFullList({ filter: 'name = "Carbonara, Trattoria"' });
      assert(foods.length === 1 && foods[0].unit === "serving" && foods[0].kcal === 842, "library food not saved as one serving of 842 kcal");
      const entries = await pb.collection("log_entries").getFullList({ filter: 'name = "Carbonara, Trattoria"' });
      assert(entries.length === 1 && entries[0].food === foods[0].id, "entry does not point at the new food");
    },
  ],
];

async function runChecks(browser, base, state) {
  let failed = 0;
  for (const [name, run] of CHECKS) {
    const context = await browser.newContext({ viewport: { width: 390, height: 1400 }, storageState: state });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    try {
      await run(page, base, context);
      if (errors.length) throw new Error(`page errors: ${errors.join("; ")}`);
      console.log(`ok    ${name}`);
    } catch (err) {
      failed++;
      console.log(`FAIL  ${name}: ${err.message}`);
      await page.screenshot({ path: join(OUT, `failed-${name.replace(/\W+/g, "-")}.png`) }).catch(() => undefined);
    }
    await context.close();
  }
  if (failed) process.exitCode = 1;
}

async function main() {
  if (!existsSync(BIN)) execFileSync(join(ROOT, "scripts", "ensure-pocketbase.sh"), { stdio: "inherit" });
  mkdirSync(OUT, { recursive: true });
  buildWeb();
  const dataDir = mkdtempSync(join(tmpdir(), "qc-screens-"));
  const backend = await startBackend(dataDir);
  const { server, url: base } = await serveWeb();
  const browser = await chromium.launch();
  try {
    seedSchedule();
    await seedLibrary();

    const setup = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await setup.newPage();
    await page.clock.setFixedTime(at("09", "21:15"));
    await signIn(page, base);
    await logEarlierDays(page, base);
    await goto(page, base, "/", WED());
    // Breakfast on Wednesday was eaten as planned.
    await byTestId(page, "slot-Breakfast").click();
    await settle(page);
    await byTestId(page, "log-save").click();
    await settle(page);
    const state = await setup.storageState();
    await setup.close();

    if (args.check) {
      await runChecks(browser, base, state);
      return;
    }

    // Both appearances of a scene are taken before the next scene runs, because some scenes
    // change data that later screens show.
    for (const scene of SCENES) {
      if (ONLY && !ONLY.has(scene.name)) continue;
      for (const scheme of ["light", "dark"]) {
        if (scheme === "dark" && (scene.changes || !DARK.has(scene.name))) continue;
        const context = await browser.newContext({
          viewport: { width: 390, height: scene.full ? 2000 : 844 },
          deviceScaleFactor: SCALE,
          colorScheme: scheme,
          storageState: scene.signedOut ? undefined : state,
        });
        const shot = await context.newPage();
        const errors = [];
        shot.on("pageerror", (err) => errors.push(String(err)));
        await scene.run(shot, base);
        const name = `${scene.name}${scheme === "dark" ? "-dark" : ""}.png`;
        await shot.screenshot({ path: join(OUT, name) });
        console.log(`${name}${errors.length ? `  (page errors: ${errors.join("; ")})` : ""}`);
        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
    backend.kill();
    rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err?.response ?? err);
  process.exit(1);
});
