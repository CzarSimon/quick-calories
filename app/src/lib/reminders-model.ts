/**
 * Pure reminder planning: which local notifications should exist right now.
 *
 * Notifications are scheduled on the phone and their text is fixed when they are scheduled, so
 * the whole set is recomputed whenever the plan or today's log changes, and compared with what
 * is already scheduled (diffReminders).
 */

import { addDays, microcycleFor, projectDay } from '@/domain';
import { confirmableSlots, type LoggedSlot } from '@/lib/daylog-model';
import { formatKcal } from '@/lib/format';
import type { Schedule } from '@/lib/schedules-model';
import type { SettingsValues } from '@/lib/settings';
import type { ClockTime, IsoDate, MacroTargets } from '@/lib/types';

/** Every identifier this app schedules starts with this, so other notifications are left alone. */
export const REMINDER_PREFIX = 'qc:';
/** iOS keeps at most 64 pending local notifications per app. */
export const MAX_REMINDERS = 60;
export const DAYS_AHEAD = 7;

export type ReminderData = {
  kind: 'slot' | 'evening' | 'morning';
  /** The day the reminder is about (for a morning nudge, the day before it fires). */
  date: IsoDate;
  planSlotId?: string;
  /** True when the notification offers the "Ate as planned" button. */
  confirmable?: boolean;
};

export type Reminder = {
  id: string;
  at: { date: IsoDate; time: ClockTime };
  title: string;
  body: string;
  data: ReminderData;
  /** Changes whenever the time or the text does. */
  signature: string;
};

export type QueuedConfirmation = { date: IsoDate; planSlotId: string };

export type ReminderInput = {
  today: IsoDate;
  now: ClockTime;
  settings: Pick<SettingsValues, 'microcycle_anchor_date' | 'microcycle_length_days' | 'nudge_evening_time' | 'nudge_morning_time'>;
  /** The active schedule, or null when there is none. */
  schedule: Schedule | null;
  /** Today's log once it exists. */
  todayLog: { slots: LoggedSlot[]; targets: MacroTargets | null } | null;
  /** Planned meals from yesterday that are still unconfirmed. */
  yesterdayUnconfirmed: number;
  /** Confirmations made from a notification that have not reached the server yet. */
  queued: QueuedConfirmation[];
  daysAhead?: number;
};

const names = (items: { name: string }[]) => items.map((i) => i.name).join(', ');
const meals = (n: number) => `${n} ${n === 1 ? 'meal' : 'meals'}`;

function make(id: string, date: IsoDate, time: ClockTime, title: string, body: string, data: ReminderData): Reminder {
  return { id: REMINDER_PREFIX + id, at: { date, time }, title, body, data, signature: `${date}T${time}|${title}|${body}` };
}

export function buildReminders(input: ReminderInput): Reminder[] {
  const { today, now, settings, schedule, todayLog, queued } = input;
  if (!schedule) return [];
  const daysAhead = input.daysAhead ?? DAYS_AHEAD;
  const isQueued = (date: IsoDate, planSlotId: string) => queued.some((q) => q.date === date && q.planSlotId === planSlotId);
  const planDay = (date: IsoDate) => {
    const { dayIndex } = microcycleFor(date, settings.microcycle_anchor_date, settings.microcycle_length_days);
    return schedule.days.find((d) => d.day_index === dayIndex);
  };
  const reminders: Reminder[] = [];

  /** Planned meals of a day that would still be unconfirmed at `by` (null = end of day). */
  const unconfirmed = (date: IsoDate, by: ClockTime | null): number => {
    if (date === today && todayLog) {
      return confirmableSlots(todayLog.slots, by).filter((s) => !isQueued(date, s.plan_slot)).length;
    }
    const day = planDay(date);
    if (!day) return 0;
    return day.slots.filter(
      (s) => s.kind === 'planned' && s.items.length > 0 && (by === null || s.time <= by) && !isQueued(date, s.id),
    ).length;
  };

  for (let offset = 0; offset < daysAhead; offset++) {
    const date = addDays(today, offset);
    const isToday = offset === 0;
    const day = planDay(date);
    const upcoming = (time: ClockTime) => !isToday || time > now;

    // Slot reminders.
    if (isToday && todayLog) {
      const notify = new Map((day?.slots ?? []).map((s) => [s.id, s.notify]));
      const budget = todayLog.targets ? projectDay(todayLog.slots, todayLog.targets).remaining : null;
      for (const slot of todayLog.slots) {
        if (!notify.get(slot.plan_slot) || slot.status !== 'pending' || !upcoming(slot.time) || isQueued(date, slot.plan_slot)) continue;
        const data: ReminderData = { kind: 'slot', date, planSlotId: slot.plan_slot };
        if (slot.kind === 'planned') {
          if (slot.entries.length === 0) continue;
          const kcal = slot.entries.reduce((sum, e) => sum + e.kcal, 0);
          reminders.push(make(`slot:${date}:${slot.plan_slot}`, date, slot.time, slot.name, `${names(slot.entries)} · ${formatKcal(kcal)} kcal`, { ...data, confirmable: true }));
        } else if (slot.entries.length === 0) {
          const body = budget
            ? `About ${formatKcal(budget.kcal)} kcal left: ${Math.round(budget.carbs_g)} g carbs, ${Math.round(budget.protein_g)} g protein.`
            : 'Log what you eat.';
          reminders.push(make(`slot:${date}:${slot.plan_slot}`, date, slot.time, slot.name, body, data));
        }
      }
    } else if (day) {
      for (const slot of day.slots) {
        if (!slot.notify || !upcoming(slot.time) || isQueued(date, slot.id)) continue;
        const data: ReminderData = { kind: 'slot', date, planSlotId: slot.id };
        if (slot.kind === 'planned') {
          if (slot.items.length === 0) continue;
          reminders.push(make(`slot:${date}:${slot.id}`, date, slot.time, slot.name, `${names(slot.items)} · ${formatKcal(slot.nutrition.kcal)} kcal`, { ...data, confirmable: true }));
        } else {
          reminders.push(make(`slot:${date}:${slot.id}`, date, slot.time, slot.name, 'Log what you eat.', data));
        }
      }
    }

    // Evening nudge: meals of this day still unconfirmed by the evening time.
    const evening = settings.nudge_evening_time;
    if (evening && upcoming(evening)) {
      const count = unconfirmed(date, evening);
      if (count > 0) {
        const exact = isToday && !!todayLog;
        reminders.push(
          make(`evening:${date}`, date, evening, exact ? `${meals(count)} to confirm` : 'Meals to confirm', 'Confirm what you ate today.', { kind: 'evening', date }),
        );
      }
    }

    // Morning nudge: meals of the day before that are still unconfirmed.
    const morning = settings.nudge_morning_time;
    if (morning && upcoming(morning)) {
      const about = addDays(date, -1);
      const count = isToday ? input.yesterdayUnconfirmed : unconfirmed(about, null);
      if (count > 0) {
        const exact = isToday || (offset === 1 && !!todayLog);
        reminders.push(
          make(`morning:${date}`, date, morning, exact ? `${meals(count)} from yesterday to confirm` : 'Yesterday has meals to confirm', 'Confirm what you ate so your week adds up.', { kind: 'morning', date: about }),
        );
      }
    }
  }

  return reminders
    .sort((a, b) => `${a.at.date}T${a.at.time}`.localeCompare(`${b.at.date}T${b.at.time}`) || a.id.localeCompare(b.id))
    .slice(0, MAX_REMINDERS);
}

/** What to cancel and what to schedule so the phone's pending reminders match `desired`. */
export function diffReminders(desired: Reminder[], scheduled: { id: string; signature?: string }[]): { cancel: string[]; schedule: Reminder[] } {
  const ours = scheduled.filter((s) => s.id.startsWith(REMINDER_PREFIX));
  const wanted = new Map(desired.map((r) => [r.id, r]));
  const current = new Map(ours.map((s) => [s.id, s.signature]));
  return {
    cancel: ours.filter((s) => wanted.get(s.id)?.signature !== s.signature).map((s) => s.id),
    schedule: desired.filter((r) => current.get(r.id) !== r.signature),
  };
}

/** The local moment a reminder fires. */
export function fireDate(at: Reminder['at']): Date {
  const [y, m, d] = at.date.split('-').map(Number);
  const [hh, mm] = at.time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}
