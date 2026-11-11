import { router } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { toIsoDate } from '@/domain';
import { prepareDay } from '@/lib/daylog';
import { queryClient } from '@/lib/query-client';
import { cancelAllReminders, flushQueuedConfirmations, refreshReminders, setReminderNavigator, type ReminderNavigation } from '@/lib/reminders';

/** Query keys whose data decides which reminders exist. */
const WATCHED = new Set(['day', 'schedules', 'day_plans', 'plan_slots', 'plan_slot_items', 'settings', 'foods', 'meals', 'meal_items']);

async function open(target: ReminderNavigation) {
  // A tap on a meal reminder opens that meal; the nudges open the day they are about.
  if (target.kind === 'slot' && target.planSlotId) {
    try {
      const data = await prepareDay(target.date, toIsoDate(new Date()));
      const slot = data.slots.find((s) => s.plan_slot === target.planSlotId);
      if (slot) {
        router.push({ pathname: '/log-slot/[id]', params: { id: slot.id, date: target.date } });
        return;
      }
    } catch {
      // Offline: fall through to Today.
    }
  }
  router.navigate('/');
}

/**
 * Keeps reminders in step with the app while the user is signed in (and removes them on sign-out): on start, when the app
 * returns to the foreground, and shortly after the plan or today's log changes.
 */
export function useReminders(signedIn: boolean | null) {
  useEffect(() => {
    // null: the stored login is still loading. Leave scheduled reminders alone until it is known.
    if (signedIn === null) return;
    if (!signedIn) {
      void cancelAllReminders();
      return;
    }

    const sync = (mayAsk: boolean) => void flushQueuedConfirmations().then(() => refreshReminders({ mayAsk }));
    sync(true);
    setReminderNavigator((target) => void open(target));

    const appState = AppState.addEventListener('change', (state) => state === 'active' && sync(true));

    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      if (!WATCHED.has(String(event.query.queryKey[0]))) return;
      if (timer) clearTimeout(timer);
      // Also retries queued confirmations: one may have been waiting for today's log to exist.
      timer = setTimeout(() => sync(false), 2000);
    });

    return () => {
      appState.remove();
      unsubscribe();
      if (timer) clearTimeout(timer);
      setReminderNavigator(null);
    };
  }, [signedIn]);
}
