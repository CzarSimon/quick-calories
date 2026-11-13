/**
 * Pure day-log model.
 *
 * A day log is created on the day itself from the active schedule's day plan, and stays in sync
 * with that plan for as long as a slot is untouched. Anything the user has confirmed, adjusted,
 * skipped or logged by hand is never changed by a plan edit.
 */

import { scaleNutrition, type Nutrition } from '@/domain';
import type { Day } from '@/lib/schedules-model';
import type { LogEntryRecord, LogSlotRecord, SlotKind, SlotStatus } from '@/lib/types';

/** What gets stored for one logged item: a reference plus a snapshot of its nutrition. */
export type EntryDraft = Nutrition & {
  food: string;
  meal: string;
  name: string;
  quantity: number;
  origin: LogEntryRecord['origin'];
  source: LogEntryRecord['source'];
};

export type PlannedSlot = {
  planSlotId: string;
  name: string;
  time: string;
  kind: SlotKind;
  sort: number;
  entries: EntryDraft[];
};

export type LoggedSlot = LogSlotRecord & { entries: LogEntryRecord[] };

/** The slots a day log should start from, taken from a schedule day. Open slots carry no entries. */
export function plannedSlots(day: Pick<Day, 'slots'>): PlannedSlot[] {
  return day.slots.map((slot, sort) => ({
    planSlotId: slot.id,
    name: slot.name,
    time: slot.time,
    kind: slot.kind,
    sort,
    entries:
      slot.kind === 'open'
        ? []
        : slot.items.map((item) => ({
            food: item.food?.id ?? '',
            meal: item.meal?.id ?? '',
            name: item.name,
            quantity: item.quantity,
            ...item.nutrition,
            origin: 'planned' as const,
            source: 'manual' as const,
          })),
  }));
}

const sameEntry = (a: EntryDraft | LogEntryRecord, b: EntryDraft | LogEntryRecord) =>
  a.food === b.food &&
  a.meal === b.meal &&
  a.name === b.name &&
  a.quantity === b.quantity &&
  a.kcal === b.kcal &&
  a.carbs_g === b.carbs_g &&
  a.protein_g === b.protein_g &&
  a.fat_g === b.fat_g;

export function sameEntries(a: (EntryDraft | LogEntryRecord)[], b: (EntryDraft | LogEntryRecord)[]): boolean {
  return a.length === b.length && a.every((entry, i) => sameEntry(entry, b[i]));
}

/** A slot the user has not acted on: still pending, with nothing logged by hand. */
export function isUntouched(slot: LoggedSlot): boolean {
  return slot.status === 'pending' && slot.entries.every((entry) => entry.origin === 'planned');
}

export type DayLogChanges = {
  create: PlannedSlot[];
  update: { id: string; fields?: Pick<PlannedSlot, 'name' | 'time' | 'kind' | 'sort'>; entries?: EntryDraft[] }[];
  remove: string[];
};

export const hasChanges = (c: DayLogChanges) => c.create.length + c.update.length + c.remove.length > 0;

/**
 * Work out what to change so an open day's log matches the plan.
 * - A planned slot without a logged slot is created.
 * - An untouched logged slot follows the plan: renamed, re-timed, its planned items replaced,
 *   or removed when the plan no longer has it.
 * - A slot the user has acted on is left exactly as it is.
 */
export function reconcileDayLog(logged: LoggedSlot[], planned: PlannedSlot[]): DayLogChanges {
  const changes: DayLogChanges = { create: [], update: [], remove: [] };
  const byPlanSlot = new Map(logged.filter((s) => s.plan_slot).map((s) => [s.plan_slot, s]));
  const plannedIds = new Set(planned.map((p) => p.planSlotId));

  // Logged slots whose plan slot was deleted lose their reference on the server.
  const orphans = logged.filter((s) => !s.plan_slot || !plannedIds.has(s.plan_slot));
  for (const orphan of orphans) {
    if (isUntouched(orphan)) changes.remove.push(orphan.id);
  }
  const keptOrphans = orphans.filter((s) => !isUntouched(s));

  for (const plan of planned) {
    const existing = byPlanSlot.get(plan.planSlotId);
    if (!existing) {
      // Replacing a day's plan slots (e.g. copying from another day) must not duplicate a meal
      // that was already confirmed under the old slot.
      const alreadyHandled = keptOrphans.some((s) => s.name === plan.name && s.time === plan.time);
      if (!alreadyHandled) changes.create.push(plan);
      continue;
    }
    if (!isUntouched(existing)) continue;

    const fieldsDiffer =
      existing.name !== plan.name || existing.time !== plan.time || existing.kind !== plan.kind || existing.sort !== plan.sort;
    const entriesDiffer = !sameEntries(existing.entries, plan.entries);
    if (fieldsDiffer || entriesDiffer) {
      changes.update.push({
        id: existing.id,
        ...(fieldsDiffer ? { fields: { name: plan.name, time: plan.time, kind: plan.kind, sort: plan.sort } } : {}),
        ...(entriesDiffer ? { entries: plan.entries } : {}),
      });
    }
  }
  return changes;
}

/** An entry at a new quantity, scaling its nutrition snapshot proportionally. */
export function scaleEntry<T extends EntryDraft>(entry: T, quantity: number): T {
  if (!(entry.quantity > 0)) return { ...entry, quantity };
  const scaled = scaleNutrition(entry, quantity / entry.quantity);
  const g = (x: number) => Math.round(x * 10) / 10;
  return {
    ...entry,
    quantity,
    kcal: Math.round(scaled.kcal),
    carbs_g: g(scaled.carbs_g),
    protein_g: g(scaled.protein_g),
    fat_g: g(scaled.fat_g),
  };
}

export function toDraft(entry: LogEntryRecord): EntryDraft {
  const { food, meal, name, quantity, kcal, carbs_g, protein_g, fat_g, origin, source } = entry;
  return { food, meal, name, quantity, kcal, carbs_g, protein_g, fat_g, origin, source };
}

/**
 * The status a slot gets when the user saves it with these entries.
 * - Planned slot: confirmed when eaten exactly as planned, otherwise adjusted.
 * - Open slot: confirmed once something is logged, pending while empty.
 */
export function statusAfterSave(kind: SlotKind, original: LogEntryRecord[], saved: EntryDraft[]): SlotStatus {
  if (kind === 'open') return saved.length > 0 ? 'confirmed' : 'pending';
  const planned = original.filter((entry) => entry.origin === 'planned');
  return sameEntries(planned, saved) ? 'confirmed' : 'adjusted';
}

/** True when a slot's time has passed. `now` is "HH:MM"; pass null for a past day (everything is due). */
export function isDue(slot: Pick<LogSlotRecord, 'time'>, now: string | null): boolean {
  return now === null || slot.time <= now;
}

/** Pending planned slots with something to confirm, optionally only those already due. */
export function confirmableSlots(slots: LoggedSlot[], now: string | null): LoggedSlot[] {
  return slots.filter((s) => s.kind === 'planned' && s.status === 'pending' && s.entries.length > 0 && isDue(s, now));
}
