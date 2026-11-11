# Quick Calories — Product Requirements (v1)

Status: agreed in product discussion, 2026-11-03. Source: [`IDEA.md`](../IDEA.md).

**Fixed decisions:** React Native + Expo (dev build, iOS only), PocketBase backend (existing instance), manual meal entry in v1, AI meal estimation in a later phase.

In this document "week" means one **microcycle** (default 7 days, Mon–Sun).

## 1. Users & goals
- Single primary user (high-volume runner, ~82 kg), but data is per-user in PocketBase (auth required) so others could use it.
- Goal: hit daily fuel (esp. carbs) and protein while keeping the **week** in energy balance (or a chosen deficit/surplus), with minimal logging effort on standardised days.

## 2. Core concepts
| Concept | Description |
|---|---|
| **Food** | Library item: name, reference amount + unit (g, ml, piece, serving), kcal, carbs, protein, fat. Source field (`manual` now, `ai` later). |
| **Meal (recipe)** | Library item composed of Foods × quantity (e.g. "Base breakfast"). Totals derived. Editable; logs snapshot values so later edits don't rewrite history. |
| **Schedule** | Named plan with labels; create / edit / duplicate / delete. Exactly **one active schedule**, switched manually (e.g. "Q4 training" → "Holiday"). Has optional weekly adjustment (−X / +Y kcal vs maintenance). |
| **Microcycle** | The planning cycle (default 7 days = Mon–Sun week). Length and start/anchor date are configurable under the hood (settings/data model only, no UI in v1). If length = 7 anchored on Monday, days show weekday names; otherwise "Day 1 … Day N". Everything called "week" below means "microcycle". |
| **Day plan** | One per microcycle day in a schedule: kcal target, macro targets (see §3), share of the planned adjustment (§5), and **slots**. |
| **Slot** | Name + time (Breakfast 09:00, Pre-lunch snack 11:30, Lunch 13:00, Evening snack 20:00, Dinner 18:00…). Either **planned** (list of Foods/Meals × qty, e.g. Base breakfast + 1 banana) or **open** (no plan; gets the remaining budget — typically dinner). Notification on/off per slot. |
| **Day log** | Created from the active schedule's day plan for a date. Slot entries: `pending` → `confirmed` / `adjusted` / `skipped`; extra ad-hoc entries can be added to any slot. |
| **Labels** | User-created tags on schedules (and optionally meals). |

## 3. Targets (per day plan)
Kcal is primary; macros derive from it, using **body weight (BW)** = average of the previous microcycle (§4):
1. User enters **total kcal**.
2. **Protein**: target and floor configurable in settings; defaults target 2.0 g/kg BW, floor 1.6 g/kg.
3. **Fat**: target and floor configurable in settings; defaults target = floor = **0.8 g/kg** (essential fat).
4. **Carbs** fill the remaining kcal (4/4/9 kcal/g).
- User can raise/lower individual macros. If edits make macros sum ≠ kcal target, saving requires **explicitly accepting** the resulting surplus/deficit (or letting carbs rebalance).
- Example check (82 kg, 3,500 kcal): P 164 g, F 66 g, C ≈ 563 g — consistent with the current Monday plan. (Note: current table uses ~150 g protein, i.e. ~1.8 g/kg; default 2.0 is adjustable.)
- Seed data: user's current Q4 week (Mon 3,500 / Tue ~3,950 / Wed 3,600 / Thu 3,800 / Fri 3,300 / Sat–Sun 3,100).

## 4. Body weight (Apple Health, read-only)
- No weight logging in the app. Read body mass from HealthKit.
- Weight used for a microcycle = **average of the previous microcycle** (Mon–Sun by default); locked at cycle start, never changes mid-cycle.
- Fallbacks: if the previous microcycle has no data → last available microcycle average → manual value in settings.
- Display the weekly average trend (read-only) next to weekly balance.

## 5. Weekly (microcycle) goal & auto-redistribution
- **Maintenance** = sum of active schedule's daily kcal targets (the day targets are maintenance-level fuel). **Weekly goal** = maintenance ± adjustment.
- **Adjustment distribution**: by default spread **evenly** across all days of the cycle (e.g. −3,500/week → −500/day). Editable per day: mark days as maintenance (0 share, e.g. Tuesday key session) and the adjustment lands only on the remaining selected days (e.g. Mon/Wed/Fri), evenly by default with optional manual amounts per day that must sum to the total. The adjustment is applied to carbs/fat via the same macro logic as §3 (protein unchanged, floors respected).
- Running balance = Σ(consumed) − Σ(planned targets, before redistribution) for completed days.
- **Auto-redistribution** applies to days after today (today's own target is fixed once the day starts):
  - Protein never changes.
  - An overshoot is removed first from fat above its floor, then from carbs down to a **carb floor** (default 4 g/kg, configurable).
  - Spread over remaining days proportionally to their targets, capped at **max −15 % kcal per day** (configurable).
  - Undershoot is added back as carbs, same proportional spread, same cap.
  - What can't be absorbed shows as **unrecovered balance** for the week; it does **not** carry into the next week (visible in history).
- Redistributed targets are shown alongside original plan targets ("Wed 3,600 → 3,420").

## 6. Daily tracking flow
- Local notifications at slot times for planned slots, ideally **actionable**: "Ate as planned" / "Adjust" directly from the notification.
- Confirm screen per slot: confirm as planned, change quantities, remove items, add items from library, skip.
- Unconfirmed slots **stay pending**: they count toward *projected* but not *consumed*. Evening/next-morning nudge to resolve pending items, with bulk-confirm.
- Open slots (dinner): show **remaining budget** = target − (consumed + still-planned) for kcal and each macro; logging = pick Food/Meal(s) from library or create a new one inline (then saved to library).

## 7. Views
- **Today**: kcal + C/P/F bars showing consumed, projected (consumed + pending/planned), and target; budget for open slots; list of slots with status.
- **Week**: per-day target (original + redistributed) vs actual, running balance vs weekly goal, unrecovered balance, BW used this week.
- **Library**: foods and meals; search; create/edit; recently/frequently used.
- **Schedules**: list with labels and active marker; edit day plans and slots; duplicate; delete; switch active.
- **Settings**: protein target/floor, fat target/floor, carb floor (all g/kg, with defaults), redistribution cap, fallback weight, notification preferences, PocketBase account.

## 8. Non-functional
- iOS only, Expo dev build (HealthKit + actionable notifications need native modules).
- PocketBase auth + per-user data rules. Works offline for viewing and for confirming, skipping and logging meals, with sync when online (details in DESIGN.md §9). Editing the library, schedules and settings needs a connection.
- History preserved: logs store snapshot nutrition values.

## 9. Out of scope for v1 (planned later)
- AI meal entry: describe a meal → estimated kcal/macros as an editable draft → save to library. Bring-your-own AI login (e.g. Sign in with ChatGPT). v1 data model keeps a `source` field and draft state to accommodate it.
- Android, barcode scanning, shared/global food DB, weight logging, Strava/training-load-driven targets.

## 10. Decisions log
| Topic | Decision |
|---|---|
| Library structure | Foods + composed meals (recipes); planned slots hold foods and/or meals × quantity. |
| Weekly goal | Maintenance = sum of day targets; goal = maintenance ± adjustment; auto-redistribution of over/undershoot onto remaining days. |
| Adjustment spread | Even across all days by default; per-day override (maintenance days, manual amounts). |
| Redistribution rule | Protein fixed; cut fat above floor, then carbs down to carb floor; proportional spread, max −15 %/day; no carry-over between cycles. |
| Holidays | One active schedule, switched manually. |
| Targets | Kcal first; protein (2.0 / 1.6 g/kg defaults) and fat (0.8 g/kg target = floor) from settings; carbs fill the rest; manual macro edits that break the kcal target require explicit acceptance. |
| Body weight | Read from Apple Health; previous microcycle's average, locked for the current cycle; no in-app weight logging. |
| Unconfirmed slots | Stay pending; counted as projected, not consumed; nudge + bulk confirm. |
| Platform | iOS only for now. |
| Microcycle | Configurable length/anchor in data model and settings; no UI in v1; non-7-day cycles use "Day 1 … Day N". |

## 11. Design
The open design points (data model, sync, redistribution algorithm, notifications, schedule switching, time zones) are resolved in [`DESIGN.md`](DESIGN.md).
