/** Microcycle data access: the logs of one microcycle, and its summary for the Week and Today screens. */

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { addDays, buildBaseTargets, microcycleFor, type Microcycle } from '@/domain';
import type { LoggedSlot } from '@/lib/daylog-model';
import { applyOps } from '@/lib/outbox-model';
import { useOutbox } from '@/lib/outbox';
import { pb } from '@/lib/pocketbase';
import { fetchOrCached } from '@/lib/query-client';
import { useSchedules, type Schedule } from '@/lib/schedules';
import { useSettings, type SettingsValues } from '@/lib/settings';
import type { DayLogRecord, IsoDate, LogEntryRecord, LogSlotRecord, MacroTargets, MicrocycleRecord } from '@/lib/types';
import { summarizeMicrocycle, type WeekDayLog, type WeekSummary } from '@/lib/week-model';

export type { WeekDay, WeekDayLog, WeekSummary } from '@/lib/week-model';

export type WeekData = { microcycle: MicrocycleRecord | null; logs: WeekDayLog[] };

export const weekKey = (start: IsoDate) => ['week', start] as const;

async function fetchWeek(microcycle: Microcycle): Promise<WeekData> {
  const range = { from: microcycle.startDate, to: addDays(microcycle.startDate, microcycle.length - 1) };
  const [rows, dayLogs, slots, entries] = await Promise.all([
    pb.collection('microcycles').getList<MicrocycleRecord>(1, 1, { filter: pb.filter('start_date = {:from}', range) }),
    pb.collection('day_logs').getFullList<DayLogRecord>({ filter: pb.filter('date >= {:from} && date <= {:to}', range), sort: 'date' }),
    pb.collection('log_slots').getFullList<LogSlotRecord>({ filter: pb.filter('day_log.date >= {:from} && day_log.date <= {:to}', range) }),
    pb.collection('log_entries').getFullList<LogEntryRecord>({
      filter: pb.filter('log_slot.day_log.date >= {:from} && log_slot.day_log.date <= {:to}', range),
      sort: 'sort',
    }),
  ]);
  const entriesBySlot = new Map<string, LogEntryRecord[]>();
  for (const entry of entries) entriesBySlot.set(entry.log_slot, [...(entriesBySlot.get(entry.log_slot) ?? []), entry]);
  const slotsByDay = new Map<string, LoggedSlot[]>();
  for (const slot of slots) slotsByDay.set(slot.day_log, [...(slotsByDay.get(slot.day_log) ?? []), { ...slot, entries: entriesBySlot.get(slot.id) ?? [] }]);
  return {
    microcycle: rows.items[0] ?? null,
    logs: dayLogs.map((dayLog) => ({ dayLog, slots: slotsByDay.get(dayLog.id) ?? [] })),
  };
}

const weekQuery = (microcycle: Microcycle) => ({
  queryKey: weekKey(microcycle.startDate),
  queryFn: () => fetchWeek({ startDate: microcycle.startDate, length: microcycle.length }),
});

/** A microcycle's logs for code outside React. Reuses fresh cached data. */
export function loadWeek(microcycle: Microcycle): Promise<WeekData> {
  return fetchOrCached(weekQuery(microcycle));
}

export function useWeekData(microcycle: Microcycle, enabled = true) {
  return useQuery({ ...weekQuery(microcycle), enabled });
}

/** Base targets per day index from a schedule, or nulls when there is no schedule or weight. */
export function planBaseTargets(schedule: Schedule | undefined, length: number, bwKg: number | null, settings: SettingsValues): (MacroTargets | null)[] {
  const result: (MacroTargets | null)[] = Array.from({ length }, () => null);
  if (!schedule || !bwKg) return result;
  const built = buildBaseTargets(schedule.days, schedule, bwKg, settings).days;
  schedule.days.forEach((day, i) => {
    if (day.day_index < length) result[day.day_index] = built[i].base;
  });
  return result;
}

export type WeekView = {
  microcycle: Microcycle;
  /** The stored microcycle (body weight and its source), once a day of it has been logged. */
  record: MicrocycleRecord | null;
  summary: WeekSummary | null;
  bwKg: number | null;
  isCurrent: boolean;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
};

/**
 * The summary of the microcycle that is `offset` microcycles away from the current one
 * (0 = current, −1 = previous). `fallbackBwKg` is used until the microcycle has its own weight.
 */
export function useWeek(today: IsoDate, offset: number, fallbackBwKg: number | null): WeekView {
  const { settings, isLoading: settingsLoading } = useSettings();
  const scheduleData = useSchedules();
  const current = microcycleFor(today, settings.microcycle_anchor_date, settings.microcycle_length_days);
  const startDate = addDays(current.startDate, offset * current.length);
  const length = current.length;
  const query = useWeekData({ startDate, length }, !settingsLoading);

  const record = query.data?.microcycle ?? null;
  const bwKg = record && record.bw_kg > 0 ? record.bw_kg : fallbackBwKg;
  const active = scheduleData.schedules.find((s) => s.is_active);
  const outbox = useOutbox();
  const logs = useMemo(() => query.data?.logs.map((l) => ({ ...l, slots: applyOps(l.slots, outbox) })), [query.data, outbox]);

  const summary = useMemo(() => {
    if (!logs) return null;
    return summarizeMicrocycle({
      microcycle: { startDate, length },
      today,
      logs,
      planBase: planBaseTargets(active, length, bwKg, settings),
      bwKg,
      settings,
    });
  }, [logs, startDate, length, today, active, bwKg, settings]);

  return {
    microcycle: { startDate, length },
    record,
    summary,
    bwKg,
    isCurrent: offset === 0,
    isLoading: settingsLoading || query.isLoading || scheduleData.isLoading,
    error: (query.data ? null : query.error) ?? scheduleData.error,
    refetch: () => {
      void query.refetch();
      void scheduleData.refetch();
    },
  };
}
