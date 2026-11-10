# Quick Calories — Technical Design (v1)

Status: approved design, 2026-11-03. Requirements: [`PRD.md`](PRD.md). Clickable UI mockup: [`mockups/index.html`](mockups/index.html) (also published at https://claude.ai/artifact/RXu3LKjhDQyLGVqRRqFJUR).

Design decisions taken in this round:
- Offline: cached reads + queued writes; PocketBase is the source of truth.
- Switching schedule mid-microcycle applies from today.
- Redistribution recomputes when a day closes; during the day a preview shows its effect.
- Terminology: sport-science periodisation terms (`microcycle`; `mesocycle` / `macrocycle` reserved for the future).

## 1. Architecture
- **App:** Expo (latest SDK), TypeScript, expo-router (tabs), iOS dev build via EAS.
- **Native modules:**
  - `@kingstinct/react-native-healthkit`: read body mass only.
  - `expo-notifications`: local notifications with actionable categories.
- **Data:**
  - PocketBase JS SDK.
  - TanStack Query, with its cache persisted to MMKV.
  - A persisted mutation queue: confirmations work offline and replay in order when the app is back online.
- **Domain core:** `src/domain/` is pure TypeScript with no React or PocketBase imports. It covers macro derivation, adjustment spread, redistribution, microcycle/date math and day totals, and is unit-tested with Jest. Everything that matters numerically lives here.
- **Backend:** the hosted `quick-calories` PocketBase project (0.40.4, `https://quick-calories.pb.simonlilja.eu`), operated through pocketbase-paas. Schema as versioned JS migrations in `backend/pb_migrations/` (hooks would go in `backend/pb_hooks/`), released as a packed artifact by the operator. After the first release only additive changes pass the upgrade gate. Signup is closed (accounts are created by the operator). Every collection has the rule `user = @request.auth.id`, and every reference to another owned record must point at one of the caller's own records. No server hooks in v1.
- **Repo layout:** `app/` (Expo), `backend/` (migrations and hooks: the only thing released) and `scripts/` (local PocketBase, backend tests, and a dev-only seed for the Q4 schedule that is never released).

## 2. PocketBase collections
Every collection, child collections included, has its own required `user` relation. Rules: list/view/delete `user = @request.auth.id`; create also requires `@request.body.user = @request.auth.id`; update forbids changing `user`. (Simpler and cheaper than rules that walk up to the parent record.) Dates are `YYYY-MM-DD` text and times `HH:MM` text, validated by pattern.

**Settings**
- `settings` (one per user):
  - macro defaults: `protein_target_gkg` 2.0, `protein_floor_gkg` 1.6, `fat_target_gkg` 0.8, `fat_floor_gkg` 0.8, `carb_floor_gkg` 4.0
  - redistribution and weight: `max_daily_change_pct` 15, `fallback_weight_kg`
  - microcycle and nudges: `microcycle_length_days` 7, `microcycle_anchor_date` (a Monday), `nudge_evening_time`, `nudge_morning_time`

**Library**
- `foods`: name, ref_amount, unit (g/ml/piece/slice/serving), kcal, carbs_g, protein_g, fat_g, source (`manual`/`ai`), archived.
- `meals`: name, notes, source, archived.
- `meal_items`: meal, food, quantity. A collection rather than a json field, because PocketBase relation fields can't hold a quantity.
- `labels`: name, color.

**Schedules**
- `schedules`: name, labels[], is_active (one per user, enforced in the app), adjustment_kcal (+/−), adjustment_mode (`even`/`custom`).
- `day_plans`: schedule, day_index (0…N−1), kcal, `macro_overrides` json `{protein_gkg?, fat_gkg?, carbs_g?}` (a missing key = derived; PocketBase number fields can't be null), accepted_imbalance_kcal, adjustment_included (bool), adjustment_custom_kcal (only read when the schedule's mode is `custom`).
- `plan_slots`: day_plan, name, time ("HH:MM" local), kind (`planned`/`open`), notify, sort.
- `plan_slot_items`: slot, food or meal, quantity.

**Tracking**
- `microcycles`: start_date, length, bw_kg, bw_source (`healthkit`/`previous`/`manual`), cumulative_balance_kcal, unrecovered_kcal, closed.
- `day_logs`:
  - identity: date ("YYYY-MM-DD" local), microcycle, day_index, schedule, day_plan
  - targets: `base_targets` json (plan + adjustment, kcal/p/f/c) and `targets` json (after redistribution)
  - state: closed
- `log_slots`: day_log, plan_slot, name, time, kind, status (`pending`/`confirmed`/`adjusted`/`skipped`).
- `log_entries`: log_slot, food or meal ref, name, quantity, kcal/c/p/f **snapshot**, origin (`planned`/`adhoc`), source (`manual`/`ai`).

**Terminology / future periodisation:** the code and schema use the sport-science terms throughout (`microcycle`, never "cycle" or "week"). `mesocycles` (name, start/end, goal, notes) and `macrocycles` are **only named in the design** as future parents. An optional `microcycles.mesocycle` relation will be added together with the `mesocycles` collection; no tables or UI are built in v1. The domain module puts periodisation types in `src/domain/periodisation.ts` so meso/macro can be added later without renaming.

## 3. Lifecycle
- **Microcycle start:** happens on app open or a background refresh when today ≥ the next microcycle start. Steps:
  1. Compute body weight from HealthKit as the average over the previous microcycle (fallback chain per PRD §4).
  2. Create the `microcycles` row.
  3. Create every `day_log` with its `base_targets`, so the Week view shows the whole microcycle. Each day's `log_slots` and `log_entries` are created from the active schedule when its `day_log` is created.
- **Day close:** idempotent; runs on app open or background refresh for every unclosed day before today.
  1. Mark the day closed.
  2. Recompute `cumulative_balance` from all closed days in the microcycle.
  3. Recompute `targets` for all future days **from scratch** (base + redistribute(balance)). It is deterministic, so re-running it is always safe.
  4. Pending slots in a closed day stay pending (they count as projected only). They show in the history as "unresolved".
- **Schedule switch:**
  - Today and future `day_logs` are rebuilt from the new schedule. For today, confirmed or adjusted slots are kept and pending ones are replaced.
  - The microcycle goal = past days' targets + the new schedule's remaining days ± that schedule's adjustment, prorated over its remaining included days.
  - Notifications are rescheduled.

## 4. Algorithms (in `src/domain`, all unit-tested)
- **deriveMacros(kcal, bw, settings, overrides):**
  - P = override ?? protein_target × bw
  - F = override ?? fat_target × bw
  - C = override ?? (kcal − 4P − 9F) / 4
  - It returns the imbalance: (4P + 4C + 9F) − kcal, so positive = surplus and negative = deficit. While carbs are derived they absorb protein/fat changes, so the imbalance is 0 (gram rounding ignored). It becomes non-zero when carbs are set by hand, or when protein + fat alone exceed the kcal target. A non-zero imbalance can only be saved if it equals `accepted_imbalance_kcal`.
  - Overrides are stored in g/kg so they scale with body weight. Carbs use an absolute override.
  - The returned targets carry the planned intake: the entered kcal plus any accepted imbalance. An accepted surplus or deficit is therefore part of the day's target and of the microcycle goal, and eating to plan leaves the balance at 0.
- **spreadAdjustment(total, days, mode):** `even` splits the total into whole-kcal shares over the included days; leftover kcal go to the last included days. `custom` uses per-day amounts and reports the difference when they don't sum to the total.
- **buildBaseTargets(plans, schedule, bw, settings):** derives each day's macros, then applies its share of the adjustment. A deficit comes out of fat above its floor, then out of carbs down to the carb floor; protein is untouched. A surplus goes to carbs. The part of a deficit that the floors don't allow is reported as unapplied, and the editor must show it. For a mid-microcycle schedule switch, take the remaining days of the new schedule's base targets; per-day shares stay as they are.
- **redistribute(balance, futureBaseDays, bw, settings):**
  - The balance is Σ(eaten − **base** target) over closed days (`cumulativeBalance`), never against redistributed targets, and the remaining days are always recomputed from their base targets. Otherwise the same kcal would be corrected twice.
  - The amount to correct is −balance.
  - It is spread in proportion to each day's base kcal, then water-filled under two limits: each day's cap (± max_daily_change_pct of base kcal) and its floor capacity (fat down to floor, then carbs down to floor).
  - When adding energy, all of it goes to carbs.
  - The remainder that can't be placed is stored as `unrecovered`.
  - Changes are multiples of 10 kcal and grams are whole; the rounding residue goes to the last days that still have room. A balance under 10 kcal moves nothing.
- **projectDay(slots, targets):** consumed = entries in confirmed/adjusted slots, plus anything logged ad hoc; projected = consumed + planned entries in pending slots; skipped slots count for nothing. Remaining = targets − projected (per macro), and it is the open-slot budget while an open slot has nothing logged.
- **previewRedistribution(today):** runs `redistribute` with today's projected value treated as final, used for "at this rate, tomorrow → 3,420".
- **Body weight:** `averageWeight` is the mean of daily means over the previous microcycle (several weigh-ins on one day count once), rounded to 0.1 kg. `resolveBodyWeight` falls back to the last weight used, then the manual value.
- **Date math:** `microcycleFor(date, anchor, length)` and helpers work on `YYYY-MM-DD` strings and never touch time zones.
- **microcycleDayLabel(microcycle):** weekday names if length = 7 and the anchor is a Monday, otherwise "Day n".

## 5. Notifications
- Schedule local notifications for planned slots with `notify` for the next 3 days. This stays under iOS's 64-pending limit.
- Re-schedule on app open, after any schedule or plan edit, and after day close.
- Notification category `SLOT`:
  - "Ate as planned" runs in the background without opening the app. It enqueues a confirm mutation, and the queue syncs when the network is available.
  - "Adjust" opens the app at the slot sheet.
- Nudges:
  - evening, if pending slots remain today (deep-links to a bulk confirm)
  - morning, for yesterday's pending slots
- **Time zones:** dates and slot times are local wall-clock values, using the device's time zone.

## 6. Screens (tabs: Today · Week · Library · Schedules; Settings from the header)
- **Today:**
  - kcal ring showing consumed / projected / target
  - C / P / F bars, each with a consumed segment, a projected segment and a target marker
  - an "Open budget" card for dinner
  - a slot timeline with status chips; tapping a slot opens the slot sheet
  - a preview line: "Tomorrow: 3,600 → 3,420"
- **Slot sheet:** "Ate as planned", per-item quantity steppers, remove item, add item (library search or quick-create food), skip.
- **Week:**
  - day bars of target vs actual, with base and redistributed targets
  - microcycle goal vs running balance, unrecovered balance
  - body weight used this microcycle and the trend of microcycle averages
- **Library:** Foods / Meals segments, search; food form; meal builder (add foods × qty with live totals). Deleting a food or meal archives it, so meals, plans and logs that use it keep working. Sorting by recent or frequent use comes with logging (M4).
- **Schedules:**
  - list with labels and an active badge
  - schedule editor: name, labels (pick or create), the microcycle goal (maintenance, deficit or surplus; spread evenly or set per day; per-day include toggle), a per-day preview of the resulting targets, and a notice when floors block part of a deficit. Activate, duplicate (copies every day, slot and item) and delete (not while active).
  - day editor: kcal target with derived macros; − / + steppers for each macro with "Reset"; the imbalance notice with "Rebalance carbs" and "Accept surplus/deficit" (saving is blocked until one is chosen); the day's slots with what the planned ones add up to and what is left for open slots; "Copy slots from another day" (replaces this day's slots).
  - slot editor: name, time, planned or open, reminder on/off, and for planned slots the meals (× servings) and foods (× quantity) with a live total.
  - A new schedule starts with every day at one kcal value. Until microcycles exist (M6), macros use the fallback weight from Settings.
- **Settings:** protein and fat targets and floors, carb floor, largest daily change %, fallback weight, reminder times, account and sign-out. HealthKit permission arrives with M6. Microcycle length is not exposed in the UI.

## 7. Build milestones
- **M0:** scaffold Expo app + PocketBase migrations + seed script
- **M1:** domain core + tests
- **M2:** Library
- **M3:** Schedules editor
- **M4:** Day logs, Today screen and slot sheet
- **M5:** Notifications
- **M6:** HealthKit, microcycles, day close, redistribution, Week screen
- **M7:** Offline queue hardening

## 8. Worked examples (reference values for tests)
Body weight 82 kg, default settings (protein 2.0 g/kg, fat 0.8 g/kg, carb floor 4.0 g/kg, max daily change 15 %).

**Macro derivation, Monday 3,500 kcal**
- P = 2.0 × 82 = 164 g (656 kcal)
- F = 0.8 × 82 = 65.6 → 66 g (590 kcal)
- C = (3,500 − 656 − 590) / 4 = 563 g

**Redistribution, Saturday closes +800 kcal over target**
- Only Sunday remains: base 3,100 kcal, carbs ≈ 463 g.
- Cap: 15 % × 3,100 = 465 kcal. Floor capacity: fat is already at its floor; carbs can drop to 328 g, i.e. (463 − 328) × 4 = 540 kcal.
- Cut = min(465, 540) = 465, rounded down to 10 to respect the cap → 460 kcal, all from carbs (−115 g).
- Sunday 3,100 → 2,640 kcal (carbs 463 → 348 g). Unrecovered: +340 kcal.

**Adjustment spread, −3,500 kcal microcycle, Tuesday marked maintenance**
- Even across the 6 included days: Mon −583, Wed −583, Thu −583, Fri −583, Sat −584, Sun −584; Tuesday 0.
- Each day's cut comes from fat above floor (none by default), then carbs.
- With the default 4 g/kg carb floor, Sat and Sun (3,100 kcal, 463 g carbs) can only lose (463 − 328) × 4 = 540 kcal, so 44 kcal on each is unapplied: the cut reaches −3,412, not −3,500.

These examples are covered by the tests in `app/src/domain/__tests__/`.
