/**
 * Day logs: what was planned and eaten on one date.
 *
 * Today's log is created from the active schedule the first time the day is opened, together
 * with the microcycle it belongs to, and is then kept in sync with the plan for untouched slots
 * (see daylog-model.ts). Past days are read as they were left.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';

import { buildBaseTargets, microcycleFor, projectDay, type DayProjection } from '@/domain';
import {
  hasChanges,
  plannedSlots,
  reconcileDayLog,
  sameEntries,
  type DayLogChanges,
  type EntryDraft,
  type LoggedSlot,
} from '@/lib/daylog-model';
import { currentUserId, pb } from '@/lib/pocketbase';
import { useSchedules } from '@/lib/schedules';
import { useBodyWeight, useSettings } from '@/lib/settings';
import type {
  DayLogRecord,
  IsoDate,
  LogEntryRecord,
  LogSlotRecord,
  MacroTargets,
  MicrocycleRecord,
  SlotStatus,
} from '@/lib/types';

export type { EntryDraft, LoggedSlot } from '@/lib/daylog-model';

type DayData = { microcycle: MicrocycleRecord | null; dayLog: DayLogRecord | null; slots: LoggedSlot[] };

const dayKey = (date: IsoDate) => ['day', date] as const;
const NO_SLOTS: LoggedSlot[] = [];

async function first<T>(collection: string, filter: string): Promise<T | null> {
  return (await pb.collection(collection).getList<T>(1, 1, { filter })).items[0] ?? null;
}

async function fetchDay(date: IsoDate, microcycleStart: IsoDate): Promise<DayData> {
  const [microcycle, dayLog] = await Promise.all([
    first<MicrocycleRecord>('microcycles', pb.filter('start_date = {:d}', { d: microcycleStart })),
    first<DayLogRecord>('day_logs', pb.filter('date = {:d}', { d: date })),
  ]);
  if (!dayLog) return { microcycle, dayLog: null, slots: [] };

  const [slots, entries] = await Promise.all([
    pb.collection('log_slots').getFullList<LogSlotRecord>({ filter: pb.filter('day_log = {:id}', { id: dayLog.id }) }),
    pb.collection('log_entries').getFullList<LogEntryRecord>({ filter: pb.filter('log_slot.day_log = {:id}', { id: dayLog.id }), sort: 'sort' }),
  ]);
  const bySlot = new Map<string, LogEntryRecord[]>();
  for (const entry of entries) bySlot.set(entry.log_slot, [...(bySlot.get(entry.log_slot) ?? []), entry]);
  return {
    microcycle,
    dayLog,
    slots: slots
      .map((slot) => ({ ...slot, entries: bySlot.get(slot.id) ?? [] }))
      .sort((a, b) => a.time.localeCompare(b.time) || a.sort - b.sort),
  };
}

/** Make a slot's stored entries match `drafts`, reusing rows by position. */
async function replaceEntries(slotId: string, existing: LogEntryRecord[], drafts: EntryDraft[]) {
  const user = currentUserId();
  for (const [sort, draft] of drafts.entries()) {
    const row = existing[sort];
    if (!row) {
      await pb.collection('log_entries').create({ ...draft, user, log_slot: slotId, sort });
    } else if (!sameEntries([row], [draft]) || row.origin !== draft.origin || row.sort !== sort) {
      await pb.collection('log_entries').update(row.id, { ...draft, sort });
    }
  }
  for (const row of existing.slice(drafts.length)) await pb.collection('log_entries').delete(row.id);
}

type SyncPlan = {
  date: IsoDate;
  microcycle: MicrocycleRecord | null;
  newMicrocycle: { start_date: IsoDate; length: number; bw_kg: number; bw_source: 'previous' | 'manual' };
  dayLog: DayLogRecord | null;
  dayFields: Pick<DayLogRecord, 'day_index' | 'schedule' | 'day_plan' | 'base_targets' | 'targets'>;
  updateDay: boolean;
  slots: LoggedSlot[];
  changes: DayLogChanges;
};

const isConflict = (err: unknown) => (err as { status?: number })?.status === 400;

async function syncDay(plan: SyncPlan) {
  const user = currentUserId();

  // Unique indexes guard both creates; if another run got there first, use its row.
  let microcycle = plan.microcycle;
  if (!microcycle) {
    try {
      microcycle = await pb.collection('microcycles').create<MicrocycleRecord>({ ...plan.newMicrocycle, user, closed: false });
    } catch (err) {
      microcycle = await first<MicrocycleRecord>('microcycles', pb.filter('start_date = {:d}', { d: plan.newMicrocycle.start_date }));
      if (!microcycle) throw err;
    }
  }

  let dayLog = plan.dayLog;
  if (!dayLog) {
    try {
      dayLog = await pb
        .collection('day_logs')
        .create<DayLogRecord>({ ...plan.dayFields, user, date: plan.date, microcycle: microcycle.id, closed: false });
    } catch (err) {
      if (!isConflict(err)) throw err;
      // Another run created the day; let the refetch pick it up rather than writing slots twice.
      return;
    }
  } else if (plan.updateDay) {
    await pb.collection('day_logs').update(dayLog.id, plan.dayFields);
  }

  const existing = new Map(plan.slots.map((s) => [s.id, s]));
  for (const id of plan.changes.remove) await pb.collection('log_slots').delete(id);
  for (const change of plan.changes.update) {
    if (change.fields) await pb.collection('log_slots').update(change.id, change.fields);
    if (change.entries) await replaceEntries(change.id, existing.get(change.id)?.entries ?? [], change.entries);
  }
  for (const slot of plan.changes.create) {
    const created = await pb.collection('log_slots').create<LogSlotRecord>({
      user,
      day_log: dayLog.id,
      plan_slot: slot.planSlotId,
      name: slot.name,
      time: slot.time,
      kind: slot.kind,
      status: 'pending',
      sort: slot.sort,
    });
    await replaceEntries(created.id, [], slot.entries);
  }
}

const sameTargets = (a: MacroTargets | null, b: MacroTargets) =>
  !!a && a.kcal === b.kcal && a.protein_g === b.protein_g && a.fat_g === b.fat_g && a.carbs_g === b.carbs_g;

export type DayState =
  | 'loading'
  | 'error'
  /** No schedule is active, so there is no plan to build today from. */
  | 'no-schedule'
  /** The active schedule has no day for this position in the microcycle. */
  | 'no-plan-day'
  | 'needs-weight'
  /** A past date that was never logged. */
  | 'no-log'
  | 'ready';

export type DayView = {
  state: DayState;
  date: IsoDate;
  isToday: boolean;
  /** Position in the microcycle. */
  dayIndex: number;
  microcycleLength: number;
  microcycleStart: IsoDate;
  dayLog: DayLogRecord | null;
  slots: LoggedSlot[];
  targets: MacroTargets | null;
  projection: DayProjection | null;
  bwKg: number | null;
  isSyncing: boolean;
  error: unknown;
  retry: () => void;
};

/**
 * One day's log with its totals. For today this also creates the log when it is missing and
 * keeps untouched slots in step with the active schedule.
 */
export function useDay(date: IsoDate, today: IsoDate): DayView {
  const queryClient = useQueryClient();
  const { settings, isLoading: settingsLoading } = useSettings();
  const scheduleData = useSchedules();
  const weight = useBodyWeight();
  const isToday = date === today;

  const position = microcycleFor(date, settings.microcycle_anchor_date, settings.microcycle_length_days);
  const query = useQuery({
    queryKey: dayKey(date),
    queryFn: () => fetchDay(date, position.startDate),
    enabled: !settingsLoading,
  });
  const data = query.data;

  const active = scheduleData.schedules.find((s) => s.is_active);
  const planDay = active?.days.find((d) => d.day_index === position.dayIndex);
  const bwKg = (data?.microcycle?.bw_kg || 0) > 0 ? data!.microcycle!.bw_kg : weight.bwKg;

  const loading = settingsLoading || query.isLoading || (isToday && (scheduleData.isLoading || weight.isLoading));
  const loadError = query.error ?? (isToday ? scheduleData.error : null);
  const canSync = isToday && !loading && !loadError && !!data && !data.dayLog?.closed;

  const plan = useMemo<SyncPlan | null>(() => {
    if (!canSync || !active || !planDay || !bwKg) return null;
    const base = buildBaseTargets(active.days, active, bwKg, settings).days[active.days.indexOf(planDay)].base;
    const dayLog = data!.dayLog;
    const updateDay =
      !!dayLog && (!sameTargets(dayLog.base_targets, base) || dayLog.schedule !== active.id || dayLog.day_plan !== planDay.id);
    const changes = reconcileDayLog(data!.slots, plannedSlots(planDay));
    if (data!.microcycle && dayLog && !updateDay && !hasChanges(changes)) return null;
    return {
      date,
      microcycle: data!.microcycle,
      newMicrocycle: {
        start_date: position.startDate,
        length: position.length,
        bw_kg: bwKg,
        bw_source: weight.source === 'previous' ? 'previous' : 'manual',
      },
      dayLog,
      // Redistribution arrives with day closing; until then a day's targets are its base targets.
      dayFields: { day_index: position.dayIndex, schedule: active.id, day_plan: planDay.id, base_targets: base, targets: base },
      updateDay,
      slots: data!.slots,
      changes,
    };
  }, [canSync, active, planDay, bwKg, settings, data, date, position.startDate, position.length, position.dayIndex, weight.source]);

  const sync = useMutation({
    mutationFn: syncDay,
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: dayKey(date) }),
        queryClient.invalidateQueries({ queryKey: ['microcycles'] }),
      ]),
  });

  // Run each distinct plan once; a failed plan waits for retry() instead of looping.
  const signature = plan ? JSON.stringify([plan.date, !plan.microcycle, !plan.dayLog, plan.updateDay, plan.dayFields, plan.changes]) : null;
  const attempted = useRef<string | null>(null);
  const { mutate, isPending } = sync;
  useEffect(() => {
    if (!plan || !signature || isPending || query.isFetching || attempted.current === signature) return;
    attempted.current = signature;
    mutate(plan);
  }, [plan, signature, isPending, query.isFetching, mutate]);

  const dayLog = data?.dayLog ?? null;
  const targets = dayLog?.targets ?? dayLog?.base_targets ?? null;
  const slots = data?.slots ?? NO_SLOTS;
  const projection = useMemo(() => (targets ? projectDay(slots, targets) : null), [slots, targets]);

  let state: DayState = 'ready';
  if (loading) state = 'loading';
  else if (loadError) state = 'error';
  else if (!dayLog) {
    if (!isToday) state = 'no-log';
    else if (!active) state = 'no-schedule';
    else if (!planDay) state = 'no-plan-day';
    else if (!bwKg) state = 'needs-weight';
    else state = sync.error ? 'error' : 'loading';
  }

  return {
    state,
    date,
    isToday,
    dayIndex: position.dayIndex,
    microcycleLength: position.length,
    microcycleStart: position.startDate,
    dayLog,
    slots,
    targets,
    projection,
    bwKg,
    isSyncing: isPending,
    error: loadError ?? sync.error,
    retry: () => {
      attempted.current = null;
      sync.reset();
      void query.refetch();
      if (isToday) void scheduleData.refetch();
    },
  };
}

/** Set the status of one or more slots (confirm, skip, reopen). Shows the change at once. */
export function useSetSlotStatus(date: IsoDate) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ slotIds, status }: { slotIds: string[]; status: SlotStatus }) => {
      for (const id of slotIds) await pb.collection('log_slots').update(id, { status });
    },
    onMutate: async ({ slotIds, status }) => {
      await queryClient.cancelQueries({ queryKey: dayKey(date) });
      const previous = queryClient.getQueryData<DayData>(dayKey(date));
      if (previous) {
        queryClient.setQueryData<DayData>(dayKey(date), {
          ...previous,
          slots: previous.slots.map((slot) => (slotIds.includes(slot.id) ? { ...slot, status } : slot)),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(dayKey(date), context.previous);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: dayKey(date) }),
  });
}

/** Save what was eaten in a slot: its entries and the resulting status. */
export function useSaveLogSlot(date: IsoDate) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ slot, entries, status }: { slot: LoggedSlot; entries: EntryDraft[]; status: SlotStatus }) => {
      await replaceEntries(slot.id, slot.entries, entries);
      if (slot.status !== status) await pb.collection('log_slots').update(slot.id, { status });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: dayKey(date) }),
  });
}
