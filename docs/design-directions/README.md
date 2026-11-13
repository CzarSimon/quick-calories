# Quick Calories — Fieldnotes refinement

Design exploration based on `claude/modest-brown-lo8k28` at `7b93aa6`, the supplied design-review ZIP, and the current implementation. Fieldnotes and Quick Q were selected by the owner. This is the third design iteration, not a change to the Expo app or its data model.

Open `index.html` in a browser. The prototype uses sample data only, with no backend connection. Both directions support Today, Library, meal entry, new food, Week and Schedules. Use the review controls to switch direction, appearance and screen.

## Selected direction — iteration 03

- **Fieldnotes + Quick Q** are the chosen visual direction and identity. The earlier Split study remains available for reference.
- **Ready to log comes first**, immediately below the date/header. All meal rows in **Your day** open that slot's log, including already logged meals for corrections. The list includes all five slots; the top card is a shortcut, not the only entry point.
- **Available today** replaces “Left for dinner.” The subtitle **After your planned meals** makes the calculation explicit: target − eaten − still planned. It is shared by all unplanned food, not a separate allowance per open meal.
- Calories and remaining carbs/protein/fat lead a single daily summary. Eaten and still-planned energy appear underneath in one progress bar; macro details and the corrected daily target are in a disclosure. Negative remaining values say **over**, rather than being silently clamped to zero.
- **+ Log food** lets the sample demonstrate an extra snack. It reduces the shared calorie and macro allowance; it does not silently consume or replace a planned meal. Dinner remains accessible through its own row. The extra row is a design proposal for presenting ad-hoc intake, not a new approved backend concept.
- **Day details stays collapsed by default.** Opening it shows separate carbs, protein and fat bars: solid for eaten, lighter for still planned, with a target tick and numeric labels. The bars rescale when projected intake exceeds target, preserving the target marker and showing the overage in text.
- **Settings is visible at the top right of Today.** It opens a styled reference screen covering the existing app settings; the prototype does not alter saved settings or account permissions.
- **New food retains the existing app layout**: name → five-unit segmented selector (g/ml/piece/slice/serving) → reference amount → nutrition card with calories and a single three-column macro row → Add food. Only colour and surface styling change. The original kcal-from-macros hint and default-unit amount behaviour are reproduced.

Updated previews: [Today + New food](previews/fieldnotes-refinement.png), [New food with the calorie hint](previews/fieldnotes-food-hint.png).

## Original review

1. **The frequent action is below the fold.** On Today the summary and dinner allowance precede the due meal. Put a single next-action area near the top, with confirm and adjust together. Confirmation updates eaten values immediately, offers undo, and leaves projection unchanged.
2. **Repeated containers flatten the hierarchy.** Almost every row is a rounded card. Use a continuous list for food, meals and the daily timeline; reserve a bounded surface for the current action.
3. **Macro colour competes with action colour.** Let one brand colour identify actions. Label C/P/F explicitly, align values, and use neutral typography for most data. Never use colour alone for status.
4. **The library needs to support reuse, not just storage.** Default to meals, keep search visible, offer Food / Meal creation directly, and let a new item return to the meal being built. Recipe quantities and totals stay together. Editing a recipe remains separate from changing today's portion.
5. **Planning is secondary on mobile.** Keep the existing four native tabs. Schedules begins with active plan and day selection; changing a day opens a focused editor. Deeper weekly distribution belongs one level down and can expand into the future desktop app.
6. **Avoid moral scoring.** Show remaining / over numerically, without celebrating low intake or turning every overage red. This is a tool for fuelling training.

The top web tabs in the handover are a web-only rendering detail, not an iPhone defect. Proposed bottom navigation is a schematic for existing native tabs, not a replacement custom navigation component.

## A — Fieldnotes

Warm paper, deep evergreen, restrained serif display titles and system sans for actions and data. The due meal leads, followed by a single allowance-and-progress section. The rest of the day reads like an orderly journal with time in the margin. Most rows have separators, not boxes.

Best fit: calm repeated use, a personal food library, an app that feels deliberately made rather than like a fitness dashboard. Tradeoff: quieter numeric hierarchy than Split. Use the native system serif (New York) only for short display headings; use SF Pro and tabular numerals everywhere functional.

## B — Split

A training-instrument aesthetic: ink, chalk and signal yellow, squared surfaces, tightly aligned numbers, a broad calorie track and a compact macro ledger. The due meal leads, with the dinner allowance immediately below it. The daily sequence uses a strong time column.

Best fit: fast scanning during a training day. Tradeoff: more technical and visually assertive. Keep yellow to the one primary action and one fuel highlight; do not turn the whole screen into a dashboard.

## Identity studies

All three retain **Quick Calories** as the product name. Fieldnotes and Split are direction names, not proposed renames. Each mark ships as an editable SVG logo and a square SVG app-icon master, plus PNG previews. The square assets have full-bleed backgrounds; iOS supplies the final mask.

- **Quick Q:** an open circular Q with a short forward tail. A food/plate association without cutlery; strong fit for Fieldnotes. The simplest and most adaptable option.
- **Split lanes:** two parallel bent tracks moving forward. Suggests repetition and running without a runner silhouette. Strongest fit for Split; most distinctive of the three.
- **Daily tally:** three rounded strokes with the third forming a check. References repeat meals and quick confirmation. Friendly and highly legible; less uniquely ownable than the other two.

These are original geometric studies, not a trademark or App Store similarity clearance.

## Interaction and implementation notes

- Sample date is Wednesday 11 November 2026, matching the handover, rather than the device's current date.
- Today keeps eaten, projected and target separate. Source code distinguishes today's pending projection from historical weekly assumptions; the handover compresses these into a contradictory sentence. Preserve current domain behaviour.
- Available today = target minus eaten and still-planned food, for calories and each macro. Confirming the planned amount moves food from planned to eaten without changing what is available. An adjusted portion or extra food changes the allowance.
- Adjusting a portion recalculates the current meal before saving. Skip, bulk confirm, notification actions, historical navigation and sync are specified for the production flow but are not all simulated here.
- The library and new-food flow demonstrate temporary in-memory creation. Reload resets sample data. A production implementation must use the existing library mutations and connection rules.
- In production, offline confirms remain available and show queued status. Library / schedule editing requires connection. Failed saves retain entered data and offer retry.
- Native stack headers, native tabs, safe-area insets and keyboard avoidance remain in Expo. No schema changes are required for these visual proposals. Frequently-used sorting is a proposal and needs a query/caching decision before implementation.
- Keep target correction detail under a disclosure. Preserve incomplete-day and unconfirmed-meal indicators in Week; never display a missing dinner as zero consumption.
- Use >=44 pt controls, Dynamic Type, accessible labels, numeric keyboards, visible focus in the review prototype, and explicit status text. Actual VoiceOver, Dynamic Type and native glass appearance still require device validation.

## Implementation boundary

The selected design is still a browser prototype. Apply it to Today, meal logging and the library only after the design iteration is settled; then update Week and focused schedule editing. Keep the existing PocketBase backend, domain calculations, notification behaviour and native navigation. New food should retain its existing component order and behaviours when the theme is applied.

## Visuals and validation

Iteration 03 checks: accordion collapsed on load and return to Today; three macro bars with eaten/planned/target labels; confirmation updates eaten and planned segments; Settings opens and returns to Today; expanded details and Settings fit 320 px in both appearances. No JavaScript errors.

- [Expanded daily allowance and macro bars](previews/fieldnotes-expanded-budget.png)
- [Settings reference screen](previews/fieldnotes-light-settings.png)

- [Compare Today](previews/comparison.png)
- [Fieldnotes: Today, Library, meal builder](previews/fieldnotes-board.png)
- [Split: Today, Library, meal builder](previews/split-board.png)
- [Alternate appearances](previews/appearances.png)
- [Three identities](previews/identity-studies.png)

Browser verification for iteration 02: Ready to log precedes the combined summary; confirmation/undo preserve the unplanned allowance; portion adjustment changes it; all five slot rows open the correct logger; logged lunch is not double-counted; extra banana and dinner update calories and macros independently. The food form preserves all five units, custom reference amounts, the 4/4/9 kcal hint and inline creation without losing an unsaved recipe. All 24 screen/theme combinations were captured without horizontal content overflow. Today and New food also passed page/content overflow checks at 320 and 390 px in both appearances. No JavaScript errors. Representative light/dark previews were visually inspected.

Limits: sample data in memory only; reload resets it. Existing-library-item editing, multi-item open-meal composition, schedule mutations, notification actions and offline sync are not implemented here. The sample extra-food flow models one extra entry, which can be edited. Native accessibility, Dynamic Type, keyboard behaviour and full production integration still need device validation. No Expo or backend code changed.

### Starting tokens

| Role | Fieldnotes light / dark | Split light / dark |
| --- | --- | --- |
| Background | `#F8F6EF` / `#17241D` | `#F3F4F6` / `#1D2027` |
| Primary text | `#243E31` / `#F1F0E4` | `#20242D` / `#F0F2ED` |
| Secondary text | `#687267` / `#B2BEAC` | `#626B79` / `#B5BBC5` |
| Action | `#2C5540` / `#BED4A6` | `#D8EE4B` / `#D8EE4B` |
| Text on action | `#FFFDF4` / `#1C2A20` | `#202719` / `#202719` |
| Action radius | 18 pt | 6 pt |
| Display type | Native serif, short headings only | SF Pro, semibold/bold |

Use a 4 pt spacing grid, 20 pt screen margins at standard phone width, 44–48 pt action targets, and tabular numerals for quantities. These are starting tokens to translate into the existing theme and UI components after choosing a direction. Review full native text scaling before treating these as final specifications.
