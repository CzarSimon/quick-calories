/** Schedule data access: schedules, their day plans, slots and slot items, and labels. */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useLibrary } from '@/lib/library';
import { currentUserId, pb } from '@/lib/pocketbase';
import { buildSchedules, copyName, type Day, type Schedule } from '@/lib/schedules-model';
import type {
  DayPlanRecord,
  LabelRecord,
  MacroOverrides,
  PlanSlotItemRecord,
  PlanSlotRecord,
  ScheduleRecord,
  SlotKind,
} from '@/lib/types';

export { plannedNutrition, type Day, type Schedule, type Slot, type SlotItem } from '@/lib/schedules-model';

const KEYS = {
  schedules: ['schedules'] as const,
  labels: ['labels'] as const,
  dayPlans: ['day_plans'] as const,
  slots: ['plan_slots'] as const,
  items: ['plan_slot_items'] as const,
};

function invalidate(queryClient: QueryClient, ...keys: (keyof typeof KEYS)[]) {
  return Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: KEYS[key] })));
}

export function useSchedules() {
  const library = useLibrary();
  const schedules = useQuery({ queryKey: KEYS.schedules, queryFn: () => pb.collection('schedules').getFullList<ScheduleRecord>() });
  const labels = useQuery({ queryKey: KEYS.labels, queryFn: () => pb.collection('labels').getFullList<LabelRecord>({ sort: 'name' }) });
  const dayPlans = useQuery({ queryKey: KEYS.dayPlans, queryFn: () => pb.collection('day_plans').getFullList<DayPlanRecord>() });
  const slots = useQuery({ queryKey: KEYS.slots, queryFn: () => pb.collection('plan_slots').getFullList<PlanSlotRecord>() });
  const items = useQuery({ queryKey: KEYS.items, queryFn: () => pb.collection('plan_slot_items').getFullList<PlanSlotItemRecord>() });

  const { foodById, mealById } = library;
  const built = useMemo(
    () => buildSchedules(schedules.data ?? [], labels.data ?? [], dayPlans.data ?? [], slots.data ?? [], items.data ?? [], { foodById, mealById }),
    [schedules.data, labels.data, dayPlans.data, slots.data, items.data, foodById, mealById],
  );
  const queries = [schedules, labels, dayPlans, slots, items];

  return {
    schedules: built,
    labels: labels.data ?? [],
    library,
    isLoading: library.isLoading || queries.some((q) => q.isLoading),
    error: library.error ?? queries.find((q) => q.error)?.error ?? null,
    refetch: () => Promise.all([library.refetch(), ...queries.map((q) => q.refetch())]),
  };
}

/** Find a day plan (and its schedule) in the loaded schedules. */
export function findDay(schedules: Schedule[], dayPlanId: string): { schedule: Schedule; day: Day } | null {
  for (const schedule of schedules) {
    const day = schedule.days.find((d) => d.id === dayPlanId);
    if (day) return { schedule, day };
  }
  return null;
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, kcal, days }: { name: string; kcal: number; days: number }) => {
      const user = currentUserId();
      const schedule = await pb
        .collection('schedules')
        .create<ScheduleRecord>({ user, name, labels: [], is_active: false, adjustment_kcal: 0, adjustment_mode: 'even' });
      for (let day_index = 0; day_index < days; day_index++) {
        await pb.collection('day_plans').create({
          user,
          schedule: schedule.id,
          day_index,
          kcal,
          macro_overrides: {},
          accepted_imbalance_kcal: 0,
          adjustment_included: true,
          adjustment_custom_kcal: 0,
        });
      }
      return schedule;
    },
    onSettled: () => invalidate(queryClient, 'schedules', 'dayPlans'),
  });
}

async function copySlotsInto(day: Day, targetDayPlanId: string, user: string) {
  for (const slot of day.slots) {
    const created = await pb.collection('plan_slots').create<PlanSlotRecord>({
      user,
      day_plan: targetDayPlanId,
      name: slot.name,
      time: slot.time,
      kind: slot.kind,
      notify: slot.notify,
      sort: slot.sort,
    });
    for (const [sort, item] of slot.items.entries()) {
      await pb.collection('plan_slot_items').create({
        user,
        slot: created.id,
        food: item.food?.id ?? '',
        meal: item.meal?.id ?? '',
        quantity: item.quantity,
        sort,
      });
    }
  }
}

export function useDuplicateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ schedule, existingNames }: { schedule: Schedule; existingNames: string[] }) => {
      const user = currentUserId();
      const copy = await pb.collection('schedules').create<ScheduleRecord>({
        user,
        name: copyName(schedule.name, existingNames),
        labels: schedule.labels,
        is_active: false,
        adjustment_kcal: schedule.adjustment_kcal,
        adjustment_mode: schedule.adjustment_mode,
      });
      for (const day of schedule.days) {
        const plan = await pb.collection('day_plans').create<DayPlanRecord>({
          user,
          schedule: copy.id,
          day_index: day.day_index,
          kcal: day.kcal,
          macro_overrides: day.macro_overrides ?? {},
          accepted_imbalance_kcal: day.accepted_imbalance_kcal,
          adjustment_included: day.adjustment_included,
          adjustment_custom_kcal: day.adjustment_custom_kcal,
        });
        await copySlotsInto(day, plan.id, user);
      }
      return copy;
    },
    onSettled: () => invalidate(queryClient, 'schedules', 'dayPlans', 'slots', 'items'),
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    // Day plans, slots and slot items cascade on the server.
    mutationFn: (id: string) => pb.collection('schedules').delete(id),
    // Not awaited: the screen showing this record navigates away as soon as the delete succeeds.
    onSettled: () => void invalidate(queryClient, 'schedules', 'dayPlans', 'slots', 'items'),
  });
}

export function useActivateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Activate first so there is never a moment without an active schedule.
      await pb.collection('schedules').update(id, { is_active: true });
      const others = await pb
        .collection('schedules')
        .getFullList<ScheduleRecord>({ filter: pb.filter('is_active = true && id != {:id}', { id }) });
      for (const other of others) await pb.collection('schedules').update(other.id, { is_active: false });
    },
    onSettled: () => invalidate(queryClient, 'schedules'),
  });
}

export type ScheduleDetailsInput = {
  schedule: Schedule;
  name: string;
  labels: string[];
  adjustment_kcal: number;
  adjustment_mode: ScheduleRecord['adjustment_mode'];
  /** In day order, one entry per day of the schedule. */
  days: { adjustment_included: boolean; adjustment_custom_kcal: number }[];
};

export function useSaveScheduleDetails() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ScheduleDetailsInput) => {
      await pb.collection('schedules').update(input.schedule.id, {
        name: input.name,
        labels: input.labels,
        adjustment_kcal: input.adjustment_kcal,
        adjustment_mode: input.adjustment_mode,
      });
      for (const [i, day] of input.schedule.days.entries()) {
        const next = input.days[i];
        if (day.adjustment_included !== next.adjustment_included || day.adjustment_custom_kcal !== next.adjustment_custom_kcal) {
          await pb.collection('day_plans').update(day.id, next);
        }
      }
    },
    onSettled: () => invalidate(queryClient, 'schedules', 'dayPlans'),
  });
}

export function useCreateLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => pb.collection('labels').create<LabelRecord>({ user: currentUserId(), name }),
    onSettled: () => invalidate(queryClient, 'labels'),
  });
}

export function useSaveDayPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...fields }: { id: string; kcal: number; macro_overrides: MacroOverrides; accepted_imbalance_kcal: number }) =>
      pb.collection('day_plans').update<DayPlanRecord>(id, fields),
    onSettled: () => invalidate(queryClient, 'dayPlans'),
  });
}

export type SlotInput = {
  id?: string;
  dayPlan: string;
  name: string;
  time: string;
  kind: SlotKind;
  notify: boolean;
  /** Each item has either a food or a meal id. Ignored (and removed) for open slots. */
  items: { food?: string; meal?: string; quantity: number }[];
};

export function useSaveSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SlotInput) => {
      const user = currentUserId();
      const fields = { name: input.name, time: input.time, kind: input.kind, notify: input.notify };
      const slot = input.id
        ? await pb.collection('plan_slots').update<PlanSlotRecord>(input.id, fields)
        : await pb.collection('plan_slots').create<PlanSlotRecord>({ ...fields, user, day_plan: input.dayPlan, sort: 0 });

      const wanted = input.kind === 'planned' ? input.items : [];
      const existing = input.id
        ? await pb
            .collection('plan_slot_items')
            .getFullList<PlanSlotItemRecord>({ filter: pb.filter('slot = {:id}', { id: input.id }), sort: 'sort' })
        : [];
      for (const [sort, item] of wanted.entries()) {
        const data = { food: item.food ?? '', meal: item.meal ?? '', quantity: item.quantity, sort };
        const row = existing[sort];
        if (!row) {
          await pb.collection('plan_slot_items').create({ ...data, user, slot: slot.id });
        } else if (row.food !== data.food || row.meal !== data.meal || row.quantity !== data.quantity || row.sort !== sort) {
          await pb.collection('plan_slot_items').update(row.id, data);
        }
      }
      for (const row of existing.slice(wanted.length)) await pb.collection('plan_slot_items').delete(row.id);
      return slot;
    },
    onSettled: () => invalidate(queryClient, 'slots', 'items'),
  });
}

export function useDeleteSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pb.collection('plan_slots').delete(id),
    // Not awaited: the screen showing this record navigates away as soon as the delete succeeds.
    onSettled: () => void invalidate(queryClient, 'slots', 'items'),
  });
}

/** Replace a day's slots with copies of another day's slots (items included). */
export function useCopySlots() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ from, to }: { from: Day; to: Day }) => {
      for (const slot of to.slots) await pb.collection('plan_slots').delete(slot.id);
      await copySlotsInto(from, to.id, currentUserId());
    },
    onSettled: () => invalidate(queryClient, 'slots', 'items'),
  });
}
