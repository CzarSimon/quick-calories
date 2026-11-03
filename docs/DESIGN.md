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
- **Backend:** schema as versioned JS migrations in `pocketbase/pb_migrations/`, applied to the existing instance. Every collection has the rule `user = @request.auth.id`. No server hooks in v1.
- **Repo layout:** `app/` (Expo) and `pocketbase/` (migrations, seed script for the Q4 schedule).

## 2. PocketBase collections
Every collection has a `user` field; child collections inherit their owner through the parent.

**Settings**
- `settings` (one per user):
  - macro defaults: `protein_target_gkg` 2.0, `protein_floor_gkg` 1.6, `fat_target_gkg` 0.8, `fat_floor_gkg` 0.8, `carb_floor_gkg` 4.0
  - redistribution and weight: `max_daily_change_pct` 15, `fallback_weight_kg`
  - microcycle and nudges: `microcycle_length_days` 7, `microcycle_anchor_date` (a Monday), `nudge_evening_time`, `nudge_morning_time`

**Library**
- `foods`: name, ref_amount, unit (g/ml/piece/serving), kcal, carbs_g, protein_g, fat_g, source (`manual`/`ai`), archived.
- `meals`: name, notes, source, archived.
- `meal_items`: meal, food, quantity. A collection rather than a json field, because PocketBase relation fields can't hold a quantity.
- `labels`: name, color.

**Schedules**
- `schedules`: name, labels[], is_active (one per user, enforced in the app), adjustment_kcal (+/−), adjustment_mode (`even`/`custom`).
- `day_plans`: schedule, day_index (0…N−1), kcal, protein_gkg/fat_gkg/carbs_g overrides (null = derived), accepted_imbalance_kcal, adjustment_included (bool), adjustment_custom_kcal (null unless custom).
- `plan_slots`: day_plan, name, time ("HH:MM" local), kind (`planned`/`open`), notify, sort.
- `plan_slot_items`: slot, food or meal, quantity.

**Tracking**
- `microcycles`: start_date, length, mesocycle (optional relation, unused in v1), bw_kg, bw_source (`healthkit`/`previous`/`manual`), cumulative_balance_kcal, unrecovered_kcal, closed.
- `day_logs`:
  - identity: date ("YYYY-MM-DD" local), microcycle, day_index, schedule, day_plan
  - targets: `base_targets` json (plan + adjustment, kcal/p/f/c) and `targets` json (after redistribution)
  - state: closed
- `log_slots`: day_log, plan_slot, name, time, kind, status (`pending`/`confirmed`/`adjusted`/`skipped`).
- `log_entries`: log_slot, food or meal ref, name, quantity, kcal/c/p/f **snapshot**, origin (`planned`/`adhoc`), source (`manual`/`ai`).

**Terminology / future periodisation:** the code and schema use the sport-science terms throughout (`microcycle`, never "cycle" or "week"). `mesocycles` (name, start/end, goal, notes) and `macrocycles` are **only named in the design** as future parents. `microcycles.mesocycle` is an optional relation, and no tables or UI are built in v1. The domain module puts periodisation types in `src/domain/periodisation.ts` so meso/macro can be added later without renaming.

## 3. Lifecycle
- **Microcycle start:** happens on app open or a background refresh when today ≥ the next microcycle start. Steps:
  1. Compute body weight from HealthKit as the mean of all samples in the previous microcycle (fallback chain per PRD §4).
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
  - It returns the imbalance: kcal − (4P + 4C + 9F). While carbs are derived they absorb protein/fat changes, so the imbalance is 0 (gram rounding ignored). It becomes non-zero when carbs are set by hand, or when protein + fat alone exceed the kcal target. A non-zero imbalance can only be saved if it equals `accepted_imbalance_kcal`.
  - Overrides are stored in g/kg so they scale with body weight. Carbs use an absolute override.
- **spreadAdjustment(total, days):** `even` splits the total over included days. `custom` uses per-day amounts that must sum to the total (validated). A deficit comes out of fat above its floor, then out of carbs down to the carb floor; protein is untouched. The same function runs for surplus.
- **redistribute(balance, futureDays, settings):**
  - The amount to correct is −balance.
  - It is spread in proportion to each day's base kcal, then water-filled under two limits: each day's cap (± max_daily_change_pct of base kcal) and its floor capacity (fat down to floor, then carbs down to floor).
  - When adding energy, all of it goes to carbs.
  - The remainder that can't be placed is stored as `unrecovered`.
  - kcal is rounded to 10 and grams to 1; the rounding residue goes to the last day.
- **projectDay(log):** consumed = confirmed/adjusted entries; projected = consumed + pending planned entries; open-slot budget = targets − projected (per macro).
- **previewRedistribution(today):** runs `redistribute` with today's projected value treated as final, used for "at this rate, tomorrow → 3,420".
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
- **Library:** Foods / Meals segments, search, recents; food form; meal builder (add foods × qty with live totals).
- **Schedules:**
  - list with labels and an active badge; duplicate, delete, activate
  - editor:
    - day picker
    - kcal input with derived macros; overrides via steppers; an imbalance banner with an "Accept" action
    - adjustment editor: total, even/custom, a per-day include toggle and amounts
    - slot list (time, kind, items)
- **Settings:** the macro defaults and floors, max daily change %, fallback weight, nudge times, account, HealthKit permission. Microcycle length is not exposed in the UI.

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
- Even across the 6 included days: −583 / −583 / −584 … (residue on the last day); Tuesday 0.
- Each day's cut comes from fat above floor (none by default), then carbs.
