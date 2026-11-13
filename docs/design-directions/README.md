# Quick Calories — two design directions

Design exploration based on `claude/modest-brown-lo8k28` at `7b93aa6`, the supplied design-review ZIP, and the current implementation. These are proposals for discussion, not changes to the app or its data model.

Open `index.html` in a browser. The prototype uses sample data only, with no backend connection. Both directions support Today, Library, meal entry, new food, Week and Schedules. Use the review controls to switch direction, appearance and screen.

## Review

1. **The frequent action is below the fold.** On Today the summary and dinner allowance precede the due meal. Put a single next-action area near the top, with confirm and adjust together. Confirmation updates eaten values immediately, offers undo, and leaves projection unchanged.
2. **Repeated containers flatten the hierarchy.** Almost every row is a rounded card. Use a continuous list for food, meals and the daily timeline; reserve a bounded surface for the current action.
3. **Macro colour competes with action colour.** Let one brand colour identify actions. Label C/P/F explicitly, align values, and use neutral typography for most data. Never use colour alone for status.
4. **The library needs to support reuse, not just storage.** Default to meals, keep search visible, offer Food / Meal creation directly, and let a new item return to the meal being built. Recipe quantities and totals stay together. Editing a recipe remains separate from changing today's portion.
5. **Planning is secondary on mobile.** Keep the existing four native tabs. Schedules begins with active plan and day selection; changing a day opens a focused editor. Deeper weekly distribution belongs one level down and can expand into the future desktop app.
6. **Avoid moral scoring.** Show remaining / over numerically, without celebrating low intake or turning every overage red. This is a tool for fuelling training.

The top web tabs in the handover are a web-only rendering detail, not an iPhone defect. Proposed bottom navigation is a schematic for existing native tabs, not a replacement custom navigation component.

## A — Fieldnotes

Warm paper, deep evergreen, restrained serif display titles and system sans for actions and data. A compact dinner allowance sits above the due meal. The rest of the day reads like an orderly journal with time in the margin. Most rows have separators, not boxes.

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
- Dinner allowance = target minus eaten and still-planned food. Confirmation moves food from planned to eaten without changing dinner allowance. The prototype demonstrates this with the snack.
- Adjusting a portion recalculates the current meal before saving. Skip, bulk confirm, notification actions, historical navigation and sync are specified for the production flow but are not all simulated here.
- The library and new-food flow demonstrate temporary in-memory creation. Reload resets sample data. A production implementation must use the existing library mutations and connection rules.
- In production, offline confirms remain available and show queued status. Library / schedule editing requires connection. Failed saves retain entered data and offer retry.
- Native stack headers, native tabs, safe-area insets and keyboard avoidance remain in Expo. No schema changes are required for these visual proposals. Frequently-used sorting is a proposal and needs a query/caching decision before implementation.
- Keep target correction detail under a disclosure. Preserve incomplete-day and unconfirmed-meal indicators in Week; never display a missing dinner as zero consumption.
- Use >=44 pt controls, Dynamic Type, accessible labels, numeric keyboards, visible focus in the review prototype, and explicit status text. Actual VoiceOver, Dynamic Type and native glass appearance still require device validation.

## Recommended first iteration

Start with Fieldnotes' continuous lists and warm restraint, and choose whether its journal-like hierarchy or Split's action-first hierarchy feels faster. Pick the identity independently. Implement Today + logging + library first; then Week and focused schedule editing. No production app, backend or schedule data is changed by this review branch.
