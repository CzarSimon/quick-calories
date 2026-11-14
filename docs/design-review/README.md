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
- Today shows **eaten**, **projected** (eaten + still planned) and **target**, for kcal and each macro, and **what is still available** after the planned meals, which is what is left for the open slot (dinner).
- Something eaten outside the plan is logged as its own **unplanned** row at the time it was eaten. A one-off dish can be logged by typing its macros, without creating a library item.
- Reminders fire at slot times, with an evening nudge for unconfirmed meals and a morning nudge about yesterday.
- Logging works offline. Changes are queued and sent later, and a banner says so.

**Library and plan**
- The library is **personal**: there is no shared food database. Setup effort is acceptable.
- Deleting a food or meal archives it, so plans and history that use it keep working.
- Copying a day's slots to another day is supported.
- **Later, not yet built:** describing a meal in words and having AI estimate it (with the user's own AI account), as an editable draft.

## Constraints on proposals

- **Platform:** iOS only. Expo SDK 58 and React Native 0.88, with `expo-router` **native tabs** (the iOS system tab bar, "liquid glass") and **native stack headers** (translucent, with a back button). The tab bar and headers are system components; proposals should work with them, not replace them.
- **Implementation:** plain React Native `StyleSheet`, with no UI kit. Colours come from tokens in `app/src/constants/theme.ts`, in light and dark. Text is set in `ThemedText`: the system serif (New York) for display 44 and title 32, SF Pro for subtitle 20, default 16, small 14, caption 13 and eyebrow 12 uppercase. No font files are bundled.
- **Data:** proposals can rely on everything described above. New stored fields are possible, but the backend only accepts *additive* changes, such as a new optional field or collection.
- **Accessibility:** support Dynamic Type where feasible, keep contrast legible in both themes, and keep touch targets at 44 pt or more.

## The current visual system

The app uses the **Fieldnotes** direction with the **Quick Q** mark, chosen in the previous review round (`docs/design-directions/`) and implemented as described in `docs/plans/fieldnotes-and-unplanned.md`.

- **Palette:** warm paper and evergreen. Light background `#F8F6EF`, dark `#17241D`. One accent colour carries every action (buttons, links, focus, switches, the tab tint): `#2C5540` in light, `#BED4A6` in dark. Macro colours (carbs ochre, protein green, fat mauve) appear only in the detailed macro bars. Red is kept for errors and destructive actions; going over a target is said in words.
- **Type:** the iOS system serif (New York) for screen titles and the one hero number per screen; SF Pro for everything else, with tabular figures for numbers. Sizes: display 44, title 32, subtitle 20, body 16, small 14, caption 13 (the smallest), eyebrow 12 uppercase.
- **Components** (`app/src/components/ui.tsx` and others): flat `ListRow`s with hairlines instead of a card per row; `Card` only for the current action and for forms; buttons in four variants (primary filled, tonal secondary, text, danger); `SectionHeader`, `Disclosure`, `MacroColumns`, a floating `Toast` with Undo, `ProgressBar` (eaten, still planned, target marker) and the day's `SegmentedBar`.
- **Tokens:** `app/src/constants/theme.ts` (colours in light and dark, spacing, radii, the 20 pt screen margin).

## Screenshots

**Read these first:**
- **Taken from the web build, not the iPhone,** with `npm run screenshots` (`scripts/screenshots.mjs`): a throwaway local PocketBase, the Q4 schedule and a small sample library, and a fixed clock. Screenshots are 390 pt wide at 2×.
- **On the iPhone the tab bar is at the bottom** as the native iOS bar, and the toast floats just above it. On web the tab bar is a pill at the top.
- **Headers on the iPhone are native and translucent,** and the serif is New York (Georgia on web).
- **The `-full` images show the whole scrolled content** of a screen; the others show the first screen as seen on the phone.
- **The data:** Wednesday 11 Nov at 12:10 in the Q4 training week. Monday and Tuesday were logged under target, so today's target has been raised. Breakfast is confirmed and the pre-lunch snack is due.

| File | Screen and state |
|---|---|
| `00-original-mockup-today.png`, `-week`, `-schedules` | The original clickable mockup from the design phase. |
| `01-login.png` | Sign in. Accounts are created by the owner on the server; there is no signup. |
| `02-today.png` | **Today, first screen at midday:** the snack ready to log, what is available after the planned meals. |
| `03-today-full.png` | Today, the whole screen: the day's slots and the preview of tomorrow. |
| `04-today-day-details.png` | Day details open: macro bars, the target correction and the projection. |
| `05-log-planned-meal.png` | Opening a planned meal (Lunch) to confirm or adjust it. |
| `06-log-open-dinner.png` | Opening the open dinner slot: what is available for it. |
| `07-picker.png` | The library picker: Meals, Foods, "Enter macros directly" and "Create a new food". |
| `08-log-food-new.png` | "+ Log food": a new unplanned slot with a name and time. |
| `09-quick-entry.png` | Entering a café bun by its calories and macros, with the optional save to the library. |
| `10-today-unplanned.png` | After logging it: a "Fika" row at 10:42 marked Unplanned, less available, and the toast with Undo. |
| `11-log-unplanned.png` | Opening the unplanned slot: name, time, items, Save and Remove. |
| `12-today-over.png` | Evening, after a large dinner: "877 kcal over target" in words, Day details open, two meals to confirm. |
| `13-today-offline.png` | Offline after confirming the snack: the banner says the change is saved on the phone. |
| `14-today-previous-day.png` | Yesterday, finished. |
| `15-week.png` | **Week:** balance so far, microcycle goal, each day's plan → corrected target with eaten and expected bars, body weight. Restyled only; its redesign is still to come. |
| `16-library-meals.png`, `17-library-foods.png` | Library on Meals and Foods. |
| `18-library-no-match.png` | A search with no match, offering to create the food. |
| `19-meal-edit.png` | Meal builder: foods × quantity with a live total. |
| `20-food-new.png`, `21-food-new-hint.png` | New food, empty and with the hint that the macros add up to a different kcal. |
| `22-schedules.png` | Schedules with the active one marked. |
| `23-schedule-editor.png` | Schedule editor. Restyled only; its redesign is still to come. |
| `24-day-editor.png` | Day editor: kcal target, macro steppers, slots. |
| `25-slot-editor.png` | Slot editor: name, time, planned or open, reminder, items. |
| `26-settings.png` | Settings. (The Notifications and Apple Health cards only show on iOS.) |
| `27`–`34` `-dark-` | Dark mode: Today, Day details, Week, dinner, a new unplanned slot, Library, day editor, sign in. |

**Not captured** (iOS only):
- the notification with its "Ate as planned" and "Adjust" buttons
- the Apple Health permission sheet
- the native tab bar and headers, the app icon and the splash screen

## Known issues and open questions

The list from the first review round is resolved by the redesign: the next action is on the first screen, there is one button per action, numbers have one format, the explanatory sentences are gone, the identity is no longer a default form app, and state is a word on every row. What remains:

1. **Week** still shows two rows of numbers per day. It has the new colours, but the balance and each day's effect could be more visual. Due its own design round.
2. **The schedule editor is still long,** mixing settings, the deficit spread, the day list and destructive actions on one scroll. Due its own design round.
3. **Device checks the web build can't make:** native tab bar and headers with the new tint, New York rendering, Dynamic Type at the largest sizes, VoiceOver labels, the picker and quick-entry sheets with the keyboard open, and the app icon at small sizes.
4. **Library sorting** by recent or frequent use is not built; lists are sorted by name.
5. **Day navigation** is a pair of arrows under the title. Swiping between days was considered and not built.
