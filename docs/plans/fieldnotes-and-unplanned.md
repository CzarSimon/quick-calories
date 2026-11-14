# Implementation plan: Fieldnotes design and unplanned food

Status: draft for the owner's review, 2026-11-14. Nothing here is built yet.

This plan covers two pieces of work that touch the same screens and are therefore built together:

1. **Adopting the Fieldnotes design** from `docs/design-directions/` (prototype: `index.html`, notes: `README.md`).
2. **Unplanned food**: logging something outside a planned slot, and logging a one-off dish by typing its macros without creating a library item first.

It is written so that an implementer who has not read the earlier discussion can follow it. Sections 1–3 say what is decided. Sections 4–11 are the work, in order. Section 12 is how each phase is checked. Section 13 lists what is left open.

## 1. Scope

**In scope**
- New colours, type, components, tab tint, splash colour and app icon across the whole app.
- A rebuilt Today screen.
- A restyled log screen, picker, Library, food form and meal builder, with their behaviour unchanged.
- The unplanned-food feature (data layer and screens).
- A colour-and-type restyle of Week, Schedules, the schedule, day and slot editors, Settings and Login.

**Out of scope**
- A structural redesign of Week and of the schedule editor. They get the new tokens now and a separate design round later.
- Any backend release. No migration, hook or schema change is needed (verified in section 5).
- Sorting the library by how often items are used. The prototype's "Your staples" heading implies it; it is not built and the heading is dropped.
- The Split direction and the two unused identity studies.

## 2. Decisions already made

| Topic | Decision |
|---|---|
| Direction and identity | Fieldnotes with the Quick Q mark. |
| Week and schedule editor | Restyle now, redesign later. |
| Unplanned food on Today | One timed row per item, in time order, marked "Unplanned". Not a single bucket. |
| One-off dishes | "Enter macros directly" in the picker. Saving to the library is optional and off by default. |
| Navigation | Native tabs and native stack headers stay. The prototype's custom Back button, serif page titles on pushed screens and the Q mark in tab headers are not built. |
| New food form | Keeps its current field order and behaviour. Only colours and surfaces change. |

## 3. Design specification

The prototype is the visual reference. Where this section differs from it, this section wins; each difference fixes a problem found in review.

### 3.1 Colour tokens (`app/src/constants/theme.ts`)

The current `carb` token is both the carbohydrate colour and the action colour. They are split: a new `accent` family carries actions, and `carb` goes back to meaning carbohydrate only.

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | `#F8F6EF` | `#17241D` | Screen background |
| `backgroundElement` | `#FFFDF8` | `#213126` | Inputs, sheets |
| `backgroundSelected` | `#E8EDDF` | `#2F4332` | Next-meal card, notices, selected segment, tonal buttons |
| `line` | `#D8DCD0` | `#3B4C3D` | Separators, input borders |
| `track` (new) | `#E6E8DD` | `#2A3A2E` | Empty part of a progress bar |
| `text` | `#243E31` | `#F1F0E4` | Primary text |
| `textSecondary` | `#5C665B` | `#B2BEAC` | Secondary text |
| `accent` (new) | `#2C5540` | `#BED4A6` | Primary button, links, tab tint, focus border, switches |
| `onAccent` | `#FFFDF4` | `#1C2A20` | Text on `accent` |
| `planned` (new) | `#7F9A74` | `#7E9B76` | "Still planned" bar segment |
| `carb` / `carbSoft` | `#9B661F` / `#E6D7B8` | `#DFB269` / `#6C5738` | Carbs, Day details only |
| `protein` / `proteinSoft` | `#2C5540` / `#C9D8C0` | `#BED4A6` / `#526947` | Protein, Day details only |
| `fat` / `fatSoft` | `#866B91` / `#DCD0E1` | `#BCA1CA` / `#64526B` | Fat, Day details only |
| `over` | `#A8402F` | `#F0907F` | Errors and destructive actions only |
| `warningSoft` (new) | `#F1E3C6` | `#4A3F28` | Warning notices and the offline banner |

Notes:
- `textSecondary` is darker than the prototype's `#687267`. The prototype value is 4.2:1 on the green card, below the 4.5:1 needed for small text; `#5C665B` gives 5.0:1 there and 5.5:1 on the background.
- `planned` is darker than the prototype's `#A4B69A`, which is only 1.55:1 against its track. The new value is 2.5:1. Bars never rely on tone alone: every bar has a text line with the numbers.
- "Over target" is shown with the word "over" in normal text colour, not in red. Red is kept for errors and destructive actions (prototype README, "Avoid moral scoring").
- Values marked new are starting points. Check them on the phone in both themes before the foundation phase is closed.

### 3.2 Type (`app/src/components/themed-text.tsx`)

The prototype uses 10–12 px for much of its secondary text. The app's floor stays at 13 pt.

| Variant | Size / line / weight | Font | Use |
|---|---|---|---|
| `display` (new) | 44 / 48 / 500 | Serif | The one hero number on a screen ("1,623") |
| `title` | 32 / 36 / 500 | Serif | Tab screen titles ("Today") |
| `subtitle` | 20 / 26 / 600 | Sans | Section and card headings |
| `default` | 16 / 22 / 400 | Sans | Body |
| `defaultBold` (new) | 16 / 22 / 600 | Sans | Row titles |
| `small` | 14 / 20 / 400 | Sans | Secondary lines |
| `smallBold` | 14 / 20 / 600 | Sans | Labels, button text |
| `caption` (new) | 13 / 18 / 400 | Sans | Times, row state, bar legends |
| `eyebrow` | 12 / 16 / 600, +1 tracking, uppercase | Sans | Short labels above a block |

- **Serif** is the iOS system serif (New York), set with `fontFamily: 'ui-serif'` on iOS and `Georgia, serif` on web. No font file is bundled. Confirm `ui-serif` resolves on React Native 0.88 in the first foundation commit; if it does not, bundle one serif weight with `expo-font` and note it in `docs/DESIGN.md`.
- **Numeral rule:** serif is used for the single `display` number per screen and for tab titles. Every other number is sans with tabular figures. This replaces the prototype's mix of serif and bold-sans totals.
- All variants scale with Dynamic Type. `display` and `title` get `maxFontSizeMultiplier={1.3}` so they do not push the main action off screen.

### 3.3 Components (`app/src/components/`)

| Component | Change |
|---|---|
| `Button` | `primary` uses `accent`, radius 18, min height 48. `secondary` becomes tonal (`backgroundSelected`, no border). New `text` variant: accent-coloured label, no background, min 44×44 touch area; replaces the prototype's underlined links. `danger` keeps red text. |
| `Card` | Kept for bounded surfaces only (next-meal card, nutrition card on forms). Border removed; fill `backgroundSelected` or `backgroundElement`. |
| `ListRow` (new) | Flat row with a bottom hairline: optional leading time, title, subtitle, trailing text and chevron. Whole row is one pressable, min height 56. Used on Today, Library, picker, Week, Schedules. |
| `SectionHeader` (new) | Heading on the left, optional `text` button or count on the right. |
| `Disclosure` (new) | Row with a chevron that expands content below it; `accessibilityState.expanded`; min height 44. |
| `Toast` (new) | Floats above the tab bar, does not move content. Message plus optional action; disappears after 5 s; announced to VoiceOver. One at a time. |
| `ProgressBar` | Uses `track`; height 6 (kcal) and 8 (macros). The target marker extends 3 pt above and below the bar. Over-target fill no longer turns red. |
| `SegmentedBar` (new, small) | The kcal bar on Today: eaten, planned and remaining laid side by side, no target marker. |
| `Field`, `Segmented`, `Chip`, `Notice` | Token changes only. Focus border uses `accent`. `Notice` warning uses `warningSoft`. |
| `NutritionSummary` | Tiles replaced by one total and a three-column macro row, no coloured labels. |
| `MacroLine` | Neutral text ("C 60 · P 13 · F 7"), no macro colours. |
| `QuantityRow` | Token changes; "Remove" becomes a `text` button with a 44 pt target. |
| `OfflineBanner` | Uses `warningSoft` offline and `backgroundSelected` while sending. Copy unchanged. |

### 3.4 Today

Order from the top:

1. **Header.** Eyebrow "Wednesday 11 Nov · Q4 training" (date and active schedule name; "Day 3 of 7" moves to Week). Title "Today". Settings as a `text` button on the right.
2. **Day navigation.** A compact row under the header: `‹` on the left, `›` and "Today" on the right when looking at an earlier day. Same behaviour as the current Previous day / Next day buttons, as 44 pt icon buttons.
3. **Offline banner**, when there is something to say.
4. **Next-meal card** (see 3.5).
5. **Available today.** `SectionHeader` with "+ Log food" on the right. Then:
   - the `display` number and "kcal", with the caption "After your planned meals". When negative: the absolute value, "kcal over target", caption "Eaten and planned meals exceed your target."
   - three columns: Carbs, Protein, Fat, each "306 g left" or "77 g over";
   - the kcal `SegmentedBar` and one legend line: "726 eaten · 1,451 planned · 3,800 target";
   - `Disclosure` "Day details", closed by default, containing: the three macro bars with "105 g eaten · 227 g planned" and "638 g target"; a two-line ledger "Plan 3,600 kcal" / "+200 kcal from earlier days" when the target was corrected; and "Projected 2,177 kcal".
6. **Your day.** `SectionHeader` with "2 of 5 logged". One `ListRow` per slot in time order, unplanned ones included (see 3.6).
7. **Tomorrow.** One caption line, unchanged in meaning and shortened: "Thu moves from 3,800 to 4,010 kcal as things stand." or "On course. Thu stays at 3,800 kcal."

"Available today" replaces both the old summary card and the "Left for dinner" card. The number is `projection.remaining`, which already exists; it is shown whether or not an open slot remains.

### 3.5 Next-meal card

The card is driven by one pure function (section 7.1) with four states:

| State | When | Card shows |
|---|---|---|
| One due | Exactly one planned slot is pending and its time has passed | Eyebrow "Ready to log", time, slot name, "Banana + apple · 294 kcal". Primary "Ate as planned", `text` button "Adjust". |
| Several due | Two or more are pending and past their time | Eyebrow "2 meals to confirm", the names and total kcal. Primary "Confirm both as planned" ("Confirm all 3 as planned"). The rows below are used to adjust one. |
| Up next | Nothing is due; a planned slot is still to come | Eyebrow "Up next", same content. "Ate as planned" as a **tonal** button, "Adjust" as text. |
| Done | No planned slot is pending | Eyebrow "All planned meals logged". If an open slot is empty: tonal button "Log dinner". Otherwise no button. |

On an earlier day every pending planned slot counts as due, as today.

**Guard against a double confirm.** After a confirm the card changes to the next meal with a button in the same place. Two things prevent a second tap confirming it: the "Up next" button is tonal and not primary, and the card ignores presses for 600 ms after its content changes.

**Undo.** A confirm shows the toast "Pre-lunch snack logged · 294 kcal" with "Undo", which sets the slot back to pending (the existing reopen). A bulk confirm undoes all of its slots.

### 3.6 Slot rows and states

Each row: time, slot name, a subtitle with what it holds and its kcal ("Banana + apple · 294 kcal"), and on the right a state word and a chevron. The whole row opens the log screen. Rows carry no button.

| State | Shown as | When |
|---|---|---|
| Planned | "Planned", secondary colour | Planned slot, pending, time not reached |
| Unconfirmed | "Unconfirmed", primary colour, semibold | Planned slot, pending, time passed |
| Confirmed | "✓ Confirmed" | Planned slot eaten as planned |
| Adjusted | "✓ Adjusted" | Planned slot saved with changes |
| Skipped | "Skipped", name struck through | Skipped |
| Open | "Log meal", accent colour | Open slot, nothing logged |
| Logged | "✓ Logged" | Open slot with something logged |
| Unplanned | "Unplanned" | A slot that did not come from the plan |

The state is always a word, never colour alone. The accessibility label is "Lunch, 13:00, Planned, 683 kcal".

### 3.7 Log screen

Native header with the title "Lunch · 13:00". Body:

1. Offline banner when needed.
2. **For a new or unplanned slot only:** a Name field (default "Snack") and a Time field (default now; 12:00 on an earlier day).
3. Total: kcal in `subtitle` size with a three-column macro row, titled "As planned", "What you ate", or for open and unplanned slots "This meal".
4. One line: "Leaves 1,418 kcal available today." or "Puts today 395 kcal over target."
5. The items as `QuantityRow`s, then a tonal button "Add a meal or food".
6. Primary button, with the labels the app uses today: "Ate as planned", "Save what I ate", "Save", "Save as empty"; and "Log it" for a new unplanned slot.
7. Secondary actions as `text` buttons: "Skip this slot" and "Mark as not eaten yet" as today. For an unplanned slot these are replaced by "Remove" (red text, asks for confirmation in place).

The prototype's single portion multiplier, and its lines "Other planned meals remain reserved." and "Changes apply to today only.", are not built.

### 3.8 Picker and quick entry

The picker keeps its sheet, search and Meals / Foods segments, with flat `ListRow`s. Its footer has two tonal buttons on both segments: "Create a new food" and "Enter macros directly".

"Enter macros directly" opens a second sheet that reuses the New food nutrition card:

```
Name       [ Pasta carbonara, Trattoria ]
Calories   [ 850 ] kcal
Carbs [ 90 ] g   Protein [ 35 ] g   Fat [ 38 ] g
(These macros add up to about 842 kcal.  [Use 842])
[ ] Also save to my library, as 1 serving
[ Add ]
```

- Name and at least one of kcal or the three macros are required. If kcal is empty it is filled from 4 / 4 / 9. The hint appears under the same rule as on the food form (more than 10 kcal and 10 % apart).
- The item is added to the slot at quantity 1 with unit "×", so half or one-and-a-half portions work through the normal quantity row.
- The library toggle is off by default. On, it also creates a food with unit `serving` and reference amount 1. It is disabled offline with "Saving to the library needs a connection."

### 3.9 Library, food form, meal builder

- **Library:** opens on Meals. Search on top, underline segments, a count ("12 meals") with "+ Meal" / "+ Food" as a `text` button, flat `ListRow`s (name, one line of detail, kcal, chevron) where the whole row opens the item. No letter tiles, no ↗ button, no "Your staples" heading, no tagline, no closing notice. "No matches" offers "Create “zzz” as a food".
- **Food form:** current order and behaviour, new tokens.
- **Meal builder:** current behaviour, new tokens: total at the top, ingredients as flat rows with the quantity on the right, tonal "Add ingredient", primary "Save".

### 3.10 Screens that only get the new tokens

Week, Schedules, the schedule editor, the day editor, the slot editor, Settings and Login keep their layout and copy. They change through the shared components and tokens, plus these local edits:
- every use of `carb` as an action or highlight colour moves to `accent` (list in section 6.2);
- cards that only wrap a list become flat lists where that is a one-line change; otherwise they stay as bordered-less cards;
- Week keeps macro colours off the day rows (neutral bars), and gains the "Day 3 of 7" position in its eyebrow.

### 3.11 Tabs, splash and icon

- Tabs: `tintColor` becomes `accent`, bar background `backgroundElement`, indicator `backgroundSelected`. SF Symbols: `checklist` (Today), `chart.bar` (Week), `books.vertical` (Library), `calendar` (Schedules).
- Navigation theme: the root `ThemeProvider` gets custom light and dark themes built from the tokens, so stack headers and modal sheets match.
- Splash background `#F8F6EF`, with the Quick Q mark.
- App icon: the app still ships Expo's placeholder icon. Replace `app/assets/expo.icon` and `app/assets/images/icon.png` with the Quick Q mark (`docs/design-directions/assets/quick-q-icon.svg`): cream mark on `#2C5540`. Thicken the tail if it closes up at 29 pt.

### 3.12 Copy

Removed: "Solid: eaten. Light: still planned. Line: target.", "It is set when that day starts.", and the prototype's taglines ("Made by you. Ready to repeat.", "A plan for the way you eat", "Your meals and foods, ready whenever you need them.").

## 4. Order of work

| Phase | Content | Depends on |
|---|---|---|
| 0 | Branch and repository preparation | — |
| 1 | Foundation: tokens, type, components, navigation theme, icon | 0 |
| 2 | Unplanned data layer, no screens | 0 (parallel with 1) |
| 3 | Today | 1, 2 |
| 4 | Log screen, picker, quick entry | 1, 2 |
| 5 | Library, food form, meal builder | 1 |
| 6 | Token restyle of the remaining screens | 1 |
| 7 | Documents, screenshots, device pass | 3–6 |

Each phase is one or more commits that leave the app working, with typecheck, lint and tests green. After phase 1 the whole app is already in the new colours with the old layouts, so every later phase can be reviewed on its own.

## 5. Phase 0 — preparation

1. Work continues on `codex/design-directions`. It is four commits behind `main` (CI workflow, `.gitignore`, `AGENTS.md`); merge `main` into it first so CI runs on the work.
2. Remove what was not chosen: `previews/split-*.png`, `previews/comparison.png`, `previews/split-board.png`, `previews/appearances.png`, `assets/split-lanes-*`, `assets/daily-tally-*`, and the Split branch of `review.js` / `review.css` / `index.html`. Keep the Fieldnotes prototype as the visual reference.
3. The other session's plan ("Unplanned food logging features") is superseded by this document. It should be cancelled, not approved, so two sessions do not edit the same files.

**Backend check (done while writing this plan).** No release is needed:
- `log_slots.plan_slot` is an optional relation, and the create rule accepts an empty value (`backend/pb_migrations/1762300004_tracking.js`, `refRule`).
- `log_entries.food` and `.meal` are optional, and each entry stores its own name and nutrition.
- PocketBase accepts a client-chosen 15-character id on create.

## 6. Phase 1 — foundation

### 6.1 Files
- `app/src/constants/theme.ts`: the tokens in 3.1. Add a `Radius` scale (`8, 12, 18`) and a screen margin of 20.
- `app/src/components/themed-text.tsx`: the variants in 3.2.
- `app/src/components/ui.tsx`: `Button`, `Card`, `Field`, `Segmented`, `Chip`, `Notice`, `MacroLine`, `NutritionSummary` as in 3.3; add `ListRow`, `SectionHeader`, `Disclosure`.
- `app/src/components/toast.tsx` (new): a provider mounted in `app/src/app/_layout.tsx` and a `useToast()` hook.
- `app/src/components/progress-bar.tsx`: restyle; add `SegmentedBar`.
- `app/src/components/quantity-row.tsx`, `offline-banner.tsx`, `form-screen.tsx` (margin 20): token changes.
- `app/src/components/app-tabs.tsx`, `app/src/app/_layout.tsx`: 3.11.
- `app/app.json`, `app/assets/`: splash colour and icon.

### 6.2 Moving actions off `carb`
Every place below uses `carb` for an action or highlight and moves to `accent`:
`ui.tsx` (primary button, field focus, selected chip), `app-tabs.tsx` (tint), `placeholder-screen.tsx`, `plan-slot/[id].tsx` (switch track), `day-plan/[id].tsx` (the "Reset" link at line 236; the carbs bar at line 116 stays `carb`), `login.tsx` (button), `(tabs)/schedules.tsx` (active badge), `(tabs)/week.tsx` (today's day name), `(tabs)/index.tsx` (Settings link; the budget card is removed in phase 3).

After this phase, `carb` appears only where carbohydrate is meant.

### 6.3 Done when
The app runs in both themes with the old layouts and the new colours and type; no hard-coded colour remains outside `theme.ts`; typecheck, lint and tests pass.

## 7. Phase 2 — unplanned data layer

No screen changes in this phase. Everything is pure functions with tests, plus the outbox sender.

### 7.1 `app/src/lib/daylog-model.ts`
- `isUnplanned(slot)`: true when `plan_slot` is empty.
- `nextUp(slots, now)`: returns one of `{ kind: 'due', slots }` (one or more), `{ kind: 'upNext', slot }`, `{ kind: 'done', openSlot? }`. Drives the next-meal card (3.5). Built on the existing `confirmableSlots` and `isDue`.
- `slotState(slot, now)`: returns the state names in 3.6. Replaces the chip logic now inside `SlotRow`.
- `quickEntryDraft(input)`: validates name and numbers, fills kcal from 4 / 4 / 9 when empty, and returns an `EntryDraft` with `food: ''`, `meal: ''`, `quantity: 1`, `origin: 'adhoc'`, `source: 'manual'`, or the field errors.
- `newSlotId()`: 15 characters from `[a-z0-9]`.
- **Fix in `reconcileDayLog`.** A plan slot is not created when a kept orphan has the same name and time. That check must ignore unplanned slots, or an unplanned "Snack" at 15:00 would stop a newly planned "Snack" at 15:00 from appearing. An orphan counts for the check only if it has at least one entry with `origin: 'planned'`.

### 7.2 `app/src/lib/outbox-model.ts`
`OutboxOp` gains three optional parts:
- `create?: { dayLogId, name, time, sort }` — the slot does not exist on the server yet;
- `fields?: { name?, time? }` — rename or re-time;
- `remove?: true` — delete the slot.

Rules:
- `addOp`: folding keeps `create` and merges `fields`. A `remove` that folds into an operation still holding `create` drops both, because nothing reached the server. A `remove` otherwise replaces entries and status.
- `applyOps`: a `create` appends a slot (`kind: 'open'`, `plan_slot: ''`) built from the operation; `fields` are applied; a `remove` drops the slot. The result is sorted by time, then `sort`, as `loadDay` does.
- Unplanned slots use `sort` 1000 and up, so they follow a planned slot at the same minute.
- Operations stored by the current version have none of the new parts and keep working unchanged.

### 7.3 `app/src/lib/outbox.ts`
`send` handles, in this order:
1. `remove`: delete the slot; a 404 counts as done.
2. `create`: look the slot up by id; create it only when the lookup returns 404. This makes a retry after a lost response safe, and unlike "treat any 400 as already created" it does not hide a real validation error.
3. `fields`: update name and time.
4. Entries and status, as today.

When an operation is sent it is already folded into the cached day; that continues to work because it goes through `applyOps`.

### 7.4 `app/src/lib/daylog.ts`
New hooks beside `useSaveLogSlot`, all through the outbox:
- `useCreateUnplannedSlot(date)`: takes name, time and entries; enqueues one operation with `create`, `status: 'confirmed'` and the entries; returns the new id.
- `useUpdateSlotFields(date)`: name and time of an unplanned slot.
- `useRemoveSlot(date)`.

They need the day log's id, so they are only offered when the day is in the `ready` state. Saving an unplanned slot with no items removes it, so an empty unplanned slot never exists: an empty open slot would mark the day incomplete in the week balance.

Nothing changes in `src/domain/`. `projectDay` and `dayOutcome` already count hand-logged entries as eaten, and reminders are keyed on `plan_slot`, so unplanned slots never produce one.

### 7.5 Tests added
- `daylog-model.test.ts`: `nextUp` in each state, on today and on an earlier day; `slotState` for all eight states; `quickEntryDraft` validation and kcal fill; reconcile keeps a confirmed unplanned slot; reconcile still creates a plan slot with the same name and time as an unplanned one; reconcile still does not duplicate a confirmed meal after a day's slots are replaced.
- `outbox-model.test.ts`: create then save folds into one operation; create then remove leaves nothing; remove of a slot already on the server; `applyOps` puts a created slot in time order; a stored operation in the old shape still applies.
- `day.test.ts`: an unplanned slot lowers `remaining` and `openBudget`, and counts in `dayOutcome` without making the day incomplete.
- `reminders-model.test.ts`: an unplanned slot produces no reminder and does not count in the nudges.
- `scripts/test-backend.mjs`: a slot can be created with an empty `plan_slot` and a client-chosen id; another user cannot create one in this user's day log.

## 8. Phase 3 — Today

`app/src/app/(tabs)/index.tsx` is rebuilt to 3.4–3.6. It has grown to 350 lines, so the parts move to `app/src/components/today/`: `next-meal-card.tsx`, `available-summary.tsx`, `day-details.tsx`, `slot-row.tsx`.

- The screen keeps its data hooks (`useDay`, `useWeek`, `useSetSlotStatus`) and its loading, error, needs-weight, no-schedule, no-plan-day and no-log states, restyled as notices.
- "+ Log food" pushes `/log-slot/new` with the date. It is hidden unless the day is `ready`.
- Confirm and bulk confirm show the undo toast.
- `testID`s that exist today are kept where the element still exists (`kcal-consumed`, `kcal-projected`, `target-correction`, `confirm-all`, `slot-<name>`, `tomorrow-preview`, `day-prev`, `day-next`). `confirm-<name>` moves to the card as `confirm-next`; `open-budget` becomes `available-today`.

## 9. Phase 4 — log screen, picker, quick entry

- `app/src/app/log-slot/[id].tsx`: restyle to 3.7 with behaviour unchanged for planned and open slots. Add the `new` mode and the name and time editor for unplanned slots, "Log it", and "Remove". After "Log it" the screen closes and Today shows the toast with "Undo" (which removes the slot).
- Time editing uses a typed field parsed by the existing time parser in `app/src/lib/format.ts`, as the slot editor does; no new dependency.
- `app/src/components/library-picker.tsx`: flat rows, the two-button footer, new optional prop `onQuickEntry`.
- `app/src/components/quick-entry.tsx` (new): the sheet in 3.8, built on `quickEntryDraft`. With the toggle on, it calls `useSaveFood` first and puts the new food's id on the entry; if that request fails the entry is not added and the error is shown, so the user can retry or switch the toggle off.
- The slot editor and the meal builder also use `LibraryPicker`. They do not pass `onQuickEntry`, so quick entry is not offered there: a plan item or meal ingredient must point at a library item.

## 10. Phase 5 — Library, food form, meal builder

`(tabs)/library.tsx`, `food/[id].tsx`, `meal/[id].tsx` to 3.9. Default segment becomes Meals. No change to queries, mutations, archiving or validation.

## 11. Phase 6 and 7 — remaining screens, documents, device pass

**Phase 6.** `(tabs)/week.tsx`, `(tabs)/schedules.tsx`, `schedule/[id].tsx`, `day-plan/[id].tsx`, `plan-slot/[id].tsx`, `settings.tsx`, `login.tsx` to 3.10. One commit per screen so each can be compared with its old screenshot.

**Phase 7.**
- `docs/DESIGN.md`: §2 (a `log_slots` row without `plan_slot` is an unplanned slot; entries may have neither food nor meal), §6 (Today, log screen, picker, Library), §9 (outbox create, fields and remove).
- `docs/PRD.md`: unplanned eating and quick entry in the daily-use requirements.
- `docs/design-review/`: retake every screenshot from the web build, add the new states (several due, up next, done, over target, unplanned row, new unplanned slot, quick entry), and rewrite "The current visual system" and "Known issues".
- `docs/design-directions/README.md`: mark the direction as implemented and point to this plan for the differences from the prototype.
- Device pass on the iPhone (list in 12.3).

## 12. Verification

### 12.1 Every commit
`npm run typecheck`, `npm run lint` and `npm test` in `app/`; `npm run test:backend` at the root when `scripts/` or `backend/` is touched. CI runs the same.

### 12.2 Every phase with screen changes
Run the web build against local PocketBase with the seed (`npm run backend:dev`, `npm run seed`) and capture the changed screens at 390 pt and 320 pt, light and dark, with Playwright. Compare against the prototype and the old screenshot. For Today, also drive the flows: confirm with undo, bulk confirm with undo, adjust lunch, log dinner past the target, log an unplanned snack, remove it.

### 12.3 Device pass (owner's iPhone, dev build)
The web build cannot show these:
- native tab bar and stack headers in both themes with the new tint and navigation theme;
- New York serif rendering for `display` and `title`;
- Dynamic Type at the largest standard size and at the first accessibility size: Today's card and summary must not clip, and the confirm button must stay on the first screen;
- VoiceOver: slot row labels, the disclosure's expanded state, toast announcement;
- the picker and quick-entry sheets with the keyboard open;
- unplanned snack logged in airplane mode, then synced once on reconnect;
- a notification's "Ate as planned" still confirms, and Today shows it on return;
- the app icon on the home screen, in Settings and in a notification.

### 12.4 Definition of done
All phases merged to the branch; CI green; screenshots and documents updated; the device pass completed with any findings fixed or listed.

## 13. Open points for review

1. **Schedule name in the Today eyebrow.** The prototype shows "Q4 training" where the app shows "Day 3 of 7". This plan follows the prototype and moves the day position to Week. Say if you want both.
2. **"Up next" confirm.** The plan keeps a one-tap confirm for a meal that is not due yet, as a quieter button. The alternative is to offer only "Adjust" until the time has passed.
3. **Default name for an unplanned item.** "Snack", editable. The earlier plan had quick-pick chips (Snack, Fika, Drink); they are left out to keep the screen short.
4. **Quick entry when planning.** Not offered in the slot editor (section 9). A one-off dish cannot be put in a schedule without saving it to the library.
5. **Serif fallback.** If `ui-serif` does not resolve in React Native 0.88, bundling one font file is the fallback. That adds a file of roughly 100 kB to the app.
6. **Icon.** Quick Q as drawn, or a pass on the tail weight at small sizes before it ships.
