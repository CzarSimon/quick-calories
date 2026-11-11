# Device checklist: notifications, Apple Health and offline use

Notifications use a native module, so they need a **new development build**. The logic that decides which notifications exist is unit-tested, and the path a lock-screen confirmation takes to the server is tested in a browser. What iOS itself does (delivery, the buttons, running in the background) can only be checked on a phone.

## Build

From `app/`:

```bash
npm install
```

```bash
npx eas-cli@latest build --profile development --platform ios
```

Install the new build, then start the dev server:

```bash
npm start
```

## Setup for the checks

1. In Schedules, make sure today has at least two planned slots with foods or meals and "Remind me" on. Set their times a few minutes ahead, a few minutes apart.
2. Open Today once, and allow notifications when asked. Settings → Notifications should say reminders are on.

## Checks

| # | Do this | Expected |
|---|---|---|
| 1 | Leave the app in the background and wait for the first slot time. | A notification with the slot name, its items and kcal. |
| 2 | Long-press it and tap **Ate as planned**. Then open the app. | Today shows the slot as Confirmed. |
| 3 | Wait for the second slot's notification and tap **Adjust**. | The app opens on that meal. |
| 4 | Confirm a meal in the app before its time. | No notification arrives for it. |
| 5 | **Force-quit the app** (swipe it away), wait for a reminder, tap **Ate as planned**, wait a minute, then open the app. | The slot is Confirmed. This is the case iOS may not support; see below if it is not. |
| 6 | Turn on flight mode, tap **Ate as planned** on a reminder, turn flight mode off, open the app. | The slot becomes Confirmed shortly after the app opens. |
| 7 | Leave one planned meal unconfirmed until the evening time in Settings. | A nudge: "1 meal to confirm". Confirm it earlier on another day and no nudge arrives. |
| 8 | Sign out. | No further reminders arrive. |

## If check 5 fails

iOS only runs the app's code for a background button while the app is still in memory. If the tap is lost when the app was force-quit, the meal simply stays unconfirmed (and the evening nudge still catches it), but the button did nothing.

To make the button always work, set `CONFIRM_OPENS_APP = true` in `app/src/lib/reminders.ts`. "Ate as planned" then opens the app and confirms there. No new build is needed for that change, only a reload.

## Apple Health (M6)

Apple Health also needs the new build. The balance and correction logic is unit-tested and was run through a three-day scenario in a browser; reading weight from Health can only be checked on the phone.

| # | Do this | Expected |
|---|---|---|
| 9 | Open Today on the new build. | iOS shows the Health sheet asking to read Weight. Allow it. |
| 10 | Open the Week tab. | "Body weight used" shows a weight. If last week has weigh-ins in Health, the text says it is the average from Apple Health; otherwise it says it is the fallback or carried over. |
| 11 | Compare that weight with last week's weigh-ins in the Health app (Mon–Sun average, one value per day). | They match to 0.1 kg. |
| 12 | Settings → Apple Health. | Says the app reads your weight, or offers "Connect Apple Health" if you dismissed the sheet. |

If this week started on the fallback weight (for example because its first day was created from a notification while the phone was locked), it switches to the Health average the next time you open the app, and today's targets follow.

## Offline use (M7)

Offline support adds no native module, so it works in the same build. It was tested in a browser by cutting the connection to the server; flight mode on a real phone is worth one pass.

| # | Do this | Expected |
|---|---|---|
| 13 | Open Today, Week, Library and Schedules once while online. Turn on flight mode. | Every tab still shows its data. A banner says the app is offline. |
| 14 | In flight mode, confirm a meal, adjust another, and log dinner. | Each change shows at once. The banner counts the changes waiting. |
| 15 | Still in flight mode, force-quit the app and open it again. | The same data and the same changes are there. |
| 16 | Turn flight mode off and wait up to 20 seconds, or reopen the app. | The banner disappears. The changes are on the server (check from another device or the PocketBase dashboard). |
| 17 | In flight mode, try to add a food. | "Can't reach the server". Nothing is saved. |
