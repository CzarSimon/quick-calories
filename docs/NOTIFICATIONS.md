# Notifications: build and device checklist

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
