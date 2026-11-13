/**
 * Local notifications: meal reminders with an "Ate as planned" button, and the evening and
 * morning nudges. Everything here is the thin iOS layer around reminders-model.ts.
 *
 * Scheduling and notification handling only run on iOS. Sending queued confirmations runs
 * everywhere, which also lets the web build exercise that path in UI tests.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { addDays, toIsoDate } from '@/domain';
import { createConfirmQueue, flushConfirmQueue } from '@/lib/confirm-queue';
import { confirmableSlots } from '@/lib/daylog-model';
import { confirmPlanSlot, loadDay } from '@/lib/daylog';
import { authReady, pb } from '@/lib/pocketbase';
import { buildReminders, diffReminders, fireDate, REMINDER_PREFIX, type ReminderData } from '@/lib/reminders-model';
import { loadSchedules } from '@/lib/schedules';
import { loadSettingsAndWeight } from '@/lib/settings';

const SUPPORTED = Platform.OS === 'ios';
const SLOT_CATEGORY = 'planned-slot';
const CONFIRM_ACTION = 'confirm';
const ADJUST_ACTION = 'adjust';

/**
 * Whether "Ate as planned" confirms from the lock screen without opening the app.
 *
 * iOS only runs the app's JavaScript for a background action while the app is still in memory.
 * If the app was fully closed, the tap may not reach it; the response is then picked up on the
 * next start when iOS still has it. The meal stays "unconfirmed" in the app and in the evening
 * nudge until then. Set this to true to make the button open the app instead, which always works.
 */
const CONFIRM_OPENS_APP = false;

const queue = createConfirmQueue(AsyncStorage);

function nowParts() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return { today: toIsoDate(d), now: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

async function signedIn(): Promise<boolean> {
  await authReady;
  return pb.authStore.isValid;
}

// ---------- queue ----------

let flushing: Promise<unknown> | null = null;

/** Send confirmations that were made from a notification and have not reached the server yet. */
export function flushQueuedConfirmations(): Promise<unknown> {
  flushing ??= (async () => {
    try {
      if (!(await signedIn())) return;
      const { today } = nowParts();
      await flushConfirmQueue(queue, (item) => confirmPlanSlot(item.date, item.planSlotId, today));
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

// ---------- scheduling ----------

export type ReminderStatus = 'unsupported' | 'signed-out' | 'not-asked' | 'denied' | 'on';

async function permission(mayAsk: boolean): Promise<'on' | 'denied' | 'not-asked'> {
  let current = await Notifications.getPermissionsAsync();
  if (!current.granted && current.status === 'undetermined' && mayAsk) {
    current = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  }
  if (current.granted) return 'on';
  return current.status === 'undetermined' ? 'not-asked' : 'denied';
}

async function cancelOurs() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const request of scheduled) {
    if (request.identifier.startsWith(REMINDER_PREFIX)) await Notifications.cancelScheduledNotificationAsync(request.identifier);
  }
}

async function refresh(mayAsk: boolean): Promise<ReminderStatus> {
  if (!SUPPORTED) return 'unsupported';
  if (!(await signedIn())) {
    await cancelOurs();
    return 'signed-out';
  }

  const { today, now } = nowParts();
  const [{ settings }, schedules, queued] = await Promise.all([loadSettingsAndWeight(), loadSchedules(), queue.list()]);
  const [todayData, yesterdayData] = await Promise.all([loadDay(today, settings), loadDay(addDays(today, -1), settings)]);

  const desired = buildReminders({
    today,
    now,
    settings,
    schedule: schedules.find((s) => s.is_active) ?? null,
    todayLog: todayData.dayLog ? { slots: todayData.slots, targets: todayData.dayLog.targets ?? todayData.dayLog.base_targets } : null,
    yesterdayUnconfirmed: confirmableSlots(yesterdayData.slots, null).length,
    queued,
  });

  // Only ask once there is something to remind about.
  const status = await permission(mayAsk && desired.length > 0);
  if (status !== 'on') return status;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const diff = diffReminders(
    desired,
    scheduled.map((r) => ({ id: r.identifier, signature: (r.content.data as { signature?: string } | null)?.signature })),
  );
  for (const id of diff.cancel) await Notifications.cancelScheduledNotificationAsync(id);
  for (const reminder of diff.schedule) {
    await Notifications.scheduleNotificationAsync({
      identifier: reminder.id,
      content: {
        title: reminder.title,
        body: reminder.body,
        sound: true,
        data: { ...reminder.data, signature: reminder.signature },
        ...(reminder.data.confirmable ? { categoryIdentifier: SLOT_CATEGORY } : {}),
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate(reminder.at) },
    });
  }
  return 'on';
}

let running: Promise<ReminderStatus> | null = null;
let again: { mayAsk: boolean } | null = null;

/**
 * Bring the phone's scheduled reminders in line with the plan and today's log.
 * Calls made while one is running collapse into a single follow-up run.
 */
export function refreshReminders({ mayAsk = false }: { mayAsk?: boolean } = {}): Promise<ReminderStatus> {
  if (running) {
    again = { mayAsk: mayAsk || !!again?.mayAsk };
    return running;
  }
  running = refresh(mayAsk)
    .catch((): ReminderStatus => 'on') // offline or a server error: keep what is scheduled
    .finally(() => {
      running = null;
      if (again) {
        const next = again;
        again = null;
        void refreshReminders(next);
      }
    });
  return running;
}

/** Remove every reminder this app scheduled (on sign-out). */
export async function cancelAllReminders() {
  if (SUPPORTED) await cancelOurs().catch(() => undefined);
}

/** The current permission state, without asking. */
export async function reminderPermission(): Promise<ReminderStatus> {
  if (!SUPPORTED) return 'unsupported';
  return permission(false);
}

// ---------- responses ----------

export type ReminderNavigation = { kind: ReminderData['kind']; date: string; planSlotId?: string };

let pendingNavigation: ReminderNavigation | null = null;
let onNavigation: ((target: ReminderNavigation) => void) | null = null;

/** The app's navigator registers here to open the right screen when a notification is tapped. */
export function setReminderNavigator(handler: ((target: ReminderNavigation) => void) | null) {
  onNavigation = handler;
  if (handler && pendingNavigation) {
    const target = pendingNavigation;
    pendingNavigation = null;
    handler(target);
  }
}

async function handleResponse(response: Notifications.NotificationResponse) {
  const id = response.notification.request.identifier;
  if (!id.startsWith(REMINDER_PREFIX)) return;
  const data = response.notification.request.content.data as Partial<ReminderData> | null;
  if (!data?.kind || !data.date) return;

  // iOS can deliver the same response again on the next start.
  if (!(await queue.markHandled(`${id}|${response.actionIdentifier}`))) return;

  if (response.actionIdentifier === CONFIRM_ACTION && data.kind === 'slot' && data.planSlotId) {
    // Written to the phone first, so the confirmation survives a missing connection.
    await queue.add({ date: data.date, planSlotId: data.planSlotId });
    await flushQueuedConfirmations();
    await refreshReminders();
    return;
  }

  const target: ReminderNavigation = { kind: data.kind, date: data.date, planSlotId: data.planSlotId };
  if (onNavigation) onNavigation(target);
  else pendingNavigation = target;
}

let initialised = false;

/** Call once, as early as possible: registers the buttons and listens for taps. */
export function initReminders() {
  if (!SUPPORTED || initialised) return;
  initialised = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });

  void Notifications.setNotificationCategoryAsync(SLOT_CATEGORY, [
    { identifier: CONFIRM_ACTION, buttonTitle: 'Ate as planned', options: { opensAppToForeground: CONFIRM_OPENS_APP } },
    { identifier: ADJUST_ACTION, buttonTitle: 'Adjust', options: { opensAppToForeground: true } },
  ]).catch(() => undefined);

  Notifications.addNotificationResponseReceivedListener((response) => void handleResponse(response).catch(() => undefined));

  // A response that started the app arrives before the listener exists.
  try {
    const last = Notifications.getLastNotificationResponse();
    if (last) void handleResponse(last).catch(() => undefined);
  } catch {
    // Not available: nothing to recover.
  }
}
