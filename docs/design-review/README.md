# Quick Calories: design review brief

This folder gives a design reviewer everything needed to critique the app's current interface and suggest improvements. The app is built and in use on the owner's iPhone. Every screen is in `screenshots/`, and this file explains what the app is for, who uses it, what has been decided, and what can change.

If you have the repository, the full source documents are `docs/PRD.md` (requirements), `docs/DESIGN.md` (technical design and behaviour) and `docs/mockups/index.html` (the original clickable mockup).

## What we want from the review

1. **Prioritised findings.** Problems with hierarchy, readability, layout, consistency, interaction and copy, ordered by how much they hurt everyday use.
2. **Concrete proposals.** For each finding, what to change. Sketches, annotated screenshots or revised component specs all work.
3. **A view on the daily flow.** The core loop is *open Today → confirm planned meals → see what is left for dinner*. How can that take fewer taps and less reading?
4. **A view on the visual system.** Colour, type, spacing and components: is there a clearer, more distinctive direction that still feels at home on iOS?

The constraints section below lists what the review should not try to change.

## The person and the job

- **One user.** A high-volume amateur runner (about 90 km a week plus two gym sessions), 182 cm, about 82 kg, about 11 % body fat. The goal is to hold weight while fuelling training, and sometimes to run a modest deficit.
- **Periodised intake.** Calories and carbohydrates vary by day with training load, from about 3,100 kcal on rest days to about 3,950 kcal on hard days. Protein is constant at about 2 g/kg. Fat stays near a floor.
- **Very standardised eating on weekdays.** The same breakfast base, the same snacks and the same lunch, with deliberate additions on hard days. Weekday dinners and weekends vary (family meals, fika).
- **Why other trackers failed.** Logging takes too much effort. On standardised days, logging should mostly mean *confirming the plan*. The effort goes into setting up the library and plan once.
- **Usage pattern.** Short glances several times a day, often prompted by a notification at a meal time. Occasional longer sessions to edit the plan or add a recipe.

## Core concepts (as the user sees them)

| Concept | Meaning |
|---|---|
| **Food** | A library item with calories and macros per reference amount (per 100 g, per piece, per slice, per serving). |
| **Meal** | A recipe built from foods × quantity, e.g. "Base breakfast". |
| **Schedule** | The weekly plan. One is active, e.g. "Q4 training". Others might be "Holiday" or "Spring cut". Schedules have labels. |
| **Microcycle** | The planning period, normally a Monday–Sunday week. The sport-science term is used deliberately; the UI says "week" where that reads better. |
| **Day plan** | A day's kcal target. Macros are derived from it (see below), and the day has timed slots. |
| **Slot** | A meal time. **Planned** slots hold specific meals and foods, and on the day you only confirm them. **Open** slots (usually dinner) have no plan; they show what is left of the day's budget. |
| **Microcycle goal** | Maintenance (the sum of day targets), optionally with a deficit or surplus spread over chosen days. |
| **Correction** | Eating over or under on one day adjusts the remaining days of the microcycle, within limits. |

## Requirements and decisions to respect

These were agreed with the owner. Proposals can change *how* they look and feel, but should keep the behaviour.

**Targets**
- The user enters **kcal** for a day. Protein and fat come from g/kg settings (defaults: protein 2.0 g/kg with a 1.6 floor; fat 0.8 g/kg, which is also its floor). **Carbs fill the remainder.**
- Macros can be stepped up or down per day. If carbs are set by hand so the macros no longer add up to the kcal target, saving is blocked until the user either **accepts the surplus/deficit** or **rebalances carbs**.
- Body weight for a week is **last week's Apple Health average**, locked for the week. Apple Health is read-only, and the app has no weight logging.

**Weekly goal and corrections**
- A deficit or surplus is spread **evenly by default**. Individual days can be set to stay at maintenance (e.g. a key session on Tuesday), or amounts can be set per day.
- Over- or under-eating is spread over the remaining days in proportion to their size. Protein never changes, fat and carbs never go below their floors, and no day changes by more than 15 %. Whatever can't be absorbed is shown as "will not be recovered" and is not carried into the next week.
- **Today's target is fixed once the day starts.** The days after today are shown as previews ("As things stand, Thu moves from 3,800 to 3,700 kcal").
- An unconfirmed planned meal counts as **eaten as planned**. A day with an open slot left empty is **not counted**, rather than counted as zero, and the Week screen flags it.

**Daily use**
- Planned meals are confirmed with **one tap**: "Ate as planned" on Today, or from the notification. **Bulk confirm** appears when two or more meals are past due.
- Today shows **eaten**, **projected** (eaten + still planned) and **target**, for kcal and each macro, plus **what is left for the open slot** (dinner).
- Reminders fire at slot times, with an evening nudge for unconfirmed meals and a morning nudge about yesterday.
- Logging works offline. Changes are queued and sent later, and a banner says so.

**Library and plan**
- The library is **personal**: there is no shared food database. Setup effort is acceptable.
- Deleting a food or meal archives it, so plans and history that use it keep working.
- Copying a day's slots to another day is supported.
- **Later, not yet built:** describing a meal in words and having AI estimate it (with the user's own AI account), as an editable draft.

## Constraints on proposals

- **Platform:** iOS only. Expo SDK 58 and React Native 0.88, with `expo-router` **native tabs** (the iOS system tab bar, "liquid glass") and **native stack headers** (translucent, with a back button). The tab bar and headers are system components; proposals should work with them, not replace them.
- **Implementation:** plain React Native `StyleSheet`, with no UI kit. Colours come from tokens in `app/src/constants/theme.ts`, in light and dark. Text uses the system font (SF Pro on iOS), set in `ThemedText` with the variants title 32/700, subtitle 20/600, default 16, small 14, smallBold 14/700, and eyebrow 12/600 uppercase. A custom display font is possible but would need justifying.
- **Data:** proposals can rely on everything described above. New stored fields are possible, but the backend only accepts *additive* changes, such as a new optional field or collection.
- **Accessibility:** support Dynamic Type where feasible, keep contrast legible in both themes, and keep touch targets at 44 pt or more.

## The current visual system

- **Palette:** cool blue-grey neutrals. Each macro has its own colour, used everywhere: **carbs amber** (the "fuel" accent, also used as the primary button colour), **protein teal**, **fat violet**. Red marks "over target". The light background is #E9EDF1 with white cards; the dark background is #0D1318 with #162029 cards.
- **Components** (`app/src/components/ui.tsx` and others):
  - Card, a white rounded box with a hairline border.
  - Button: primary is amber; secondary is white with a border; the danger variant has red text.
  - Field: uppercase label above the input, optional unit suffix, error text below.
  - Segmented control, Chip, and Notice (amber for warnings, grey for information).
  - MacroLine: "C 60 · P 13 · F 7" in macro colours.
  - NutritionSummary: big kcal number with three macro tiles.
  - ProgressBar: solid for eaten, soft for planned, a dark tick for the target.
  - QuantityRow: − / typed value / + with Remove.
  - LibraryPicker: a sheet with search, plus Meals and Foods segments.
- The original mockup used Barlow Condensed for numbers and a dashed amber border for the dinner budget. The dashed card survived; the font did not.

## Screenshots

**Read these first:**
- **Taken from the web build, not the iPhone.** The web build is only used for development testing; screenshots are 390 pt wide at 2×.
- **On the iPhone the tab bar is at the bottom** as the native iOS bar. On web it shows as a pill at the top.
- **Headers on the iPhone are native and translucent,** and fonts are SF Pro.
- **The `-full` / long images show the whole scrolled content** of a screen; the others show the first screen as seen on the phone.
- **The data is realistic sample data:** the Q4 training week, Wednesday 11 Nov at 12:10. Monday and Tuesday were logged under target, so today's target has been raised by 200 kcal.

| File | Screen and state |
|---|---|
| `00-original-mockup-today.png`, `-week`, `-schedules` | The original clickable mockup from the design phase, for comparing intent with what was built. |
| `01-login.png` | Sign in. Accounts are created by the owner on the server; there is no signup. |
| `02-today.png` | **Today, first screen at midday.** Breakfast confirmed, snack due, correction line under the target. |
| `03-today-full.png` | Today, the whole screen: kcal and macro bars, "Left for dinner" card, slot list with statuses and "Ate as planned" buttons, tomorrow preview. |
| `04-log-planned-meal.png` | Opening a planned meal (Lunch) to confirm or adjust it. |
| `05-log-planned-meal-adjusted.png` | Same, with the quantity changed to 1.2×: the button becomes "Save what I ate". |
| `06-log-open-dinner-empty.png` | Opening the open dinner slot: what is left for the meal. |
| `07-picker-meals.png` | The library picker sheet (Meals tab). |
| `08-log-open-dinner-filled.png` | Dinner with a family meal added: what is left today after it. |
| `09-today-previous-day.png` | Yesterday, finished: all confirmed, lunch adjusted. |
| `10-week.png`, `11-week-full.png` | **Week:** balance so far, microcycle goal, each day's plan → corrected target with eaten and expected bars, body weight used and its history. |
| `12-library-foods.png`, `13-library-meals.png` | Library lists with search and counts. |
| `14-food-new-kcal-hint.png` | New food, with the hint that the macros add up to a different kcal. |
| `15-meal-edit.png` | Meal builder: foods × quantity with a live total. |
| `16-schedules-list.png` | Schedules with labels; the active one first. |
| `17-schedule-editor-deficit.png` | **Schedule editor** for "Spring cut": −3,500 deficit, Tuesday at maintenance, per-day preview, floor warning, actions. |
| `18-day-editor.png` | **Day editor:** kcal target, derived macros with steppers, slots with what the planned meals leave. |
| `19-day-editor-imbalance.png` | Day editor after stepping carbs up: the surplus notice, and saving blocked until accepted or rebalanced. |
| `20-slot-editor.png` | Slot editor: name, time, planned/open, reminder toggle, items. |
| `21-settings.png` | Settings: macro targets and floors, correction limit, fallback weight, reminder times, account. (The Notifications and Apple Health cards only show on iOS.) |
| `22-today-offline.png` | Today while offline, after confirming a meal: the offline banner and the change counted. |
| `23-library-no-match.png` | Library search with no results. |
| `24-dark-today.png`, `25-dark-week.png`, `26-dark-day-editor.png` | Dark mode. |

**Not captured** (iOS only):
- the notification with its "Ate as planned" and "Adjust" buttons
- the Apple Health permission sheet
- the native tab bar and headers

## Known issues and open questions

These are the build team's own observations, to start the review:

1. **Today is long.** The summary card, dinner card and five slots need about two screens. The most frequent action, confirming the next meal, sits below the fold.
2. **Too many full-width buttons.** "Ate as planned" appears on every pending slot. Several full-width amber and white buttons compete for attention.
3. **Dense numbers.** The macro bars carry "105 eaten · 332 planned · 638 g", and macros appear in three formats (MacroLine, tiles, bar labels).
4. **Explanatory sentences everywhere.** Copy like "Solid: eaten. Light: still planned. Line: target." and "It is set when that day starts." explains the UI instead of the UI explaining itself.
5. **The Week screen** shows two rows of numbers per day. "Plan → corrected" works, but the balance and the per-day effect could be more visual.
6. **The schedule editor is very long** (`17`), mixing schedule settings, the deficit spread, the day list and destructive actions on one scroll.
7. **Form screens.** The first field needed extra room under the translucent header; the spacing is a fixed value.
8. **Status chips** (CONFIRMED, UNCONFIRMED, PLANNED, OPEN) are small uppercase text. Is colour plus a word the right way to show state?
9. **Previous day / Today navigation** is a pair of buttons at the top of Today. Would a date control or swipe be better?
10. **The visual identity is plain.** It is close to a default iOS form app. The mockup had more character, such as condensed numerals for the big figures.
