/**
 * Pure day-log model.
 *
 * A day log is created on the day itself from the active schedule's day plan, and stays in sync
 * with that plan for as long as a slot is untouched. Anything the user has confirmed, adjusted,
 * skipped or logged by hand is never changed by a plan edit.
 */

import { macroKcal, scaleNutrition, type Nutrition } from '@/domain';
import { parseNumber } from '@/lib/format';
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

/** A slot that was copied from the plan at some point. Unplanned slots are always open and sort from UNPLANNED_SORT_START. */
function cameFromPlan(slot: LoggedSlot): boolean {
  return slot.kind === 'planned' || slot.sort < UNPLANNED_SORT_START;
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
      // that was already confirmed under the old slot. Only slots that came from the plan count:
      // an unplanned "Snack" at 15:00 must not stop a newly planned "Snack" at 15:00.
      const alreadyHandled = keptOrphans.some((s) => s.name === plan.name && s.time === plan.time && cameFromPlan(s));
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

// ---------- unplanned slots ----------

/** Unplanned slots sort after any planned slot at the same minute. */
export const UNPLANNED_SORT_START = 1000;

/**
 * A slot that is not (or no longer) part of the plan: something eaten outside the planned meals.
 * A planned slot whose plan slot was deleted after it was eaten also counts, which is accurate.
 */
export function isUnplanned(slot: Pick<LogSlotRecord, 'plan_slot'>): boolean {
  return !slot.plan_slot;
}

/** The sort value for a new unplanned slot. */
export function nextUnplannedSort(slots: Pick<LogSlotRecord, 'sort'>[]): number {
  return Math.max(UNPLANNED_SORT_START - 1, ...slots.map((s) => s.sort)) + 1;
}

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** A record id chosen on the phone: 15 characters of [a-z0-9], which PocketBase accepts on create. */
export function newSlotId(random: () => number = Math.random): string {
  let id = '';
  for (let i = 0; i < 15; i++) id += ID_CHARS[Math.floor(random() * ID_CHARS.length)];
  return id;
}

// ---------- what Today shows ----------

export type NextUp =
  /** One or more planned meals are past their time and not confirmed. */
  | { kind: 'due'; slots: LoggedSlot[] }
  /** Nothing is due; this planned meal is the next one. */
  | { kind: 'upNext'; slot: LoggedSlot }
  /** No planned meal is waiting. `openSlot` is an open slot with nothing logged, if there is one. */
  | { kind: 'done'; openSlot: LoggedSlot | null };

/** What the card at the top of Today offers. `now` is "HH:MM"; null for an earlier day (everything is due). */
export function nextUp(slots: LoggedSlot[], now: string | null): NextUp {
  const due = confirmableSlots(slots, now);
  if (due.length > 0) return { kind: 'due', slots: due };
  const upcoming = slots.find((s) => s.kind === 'planned' && s.status === 'pending' && s.entries.length > 0);
  if (upcoming) return { kind: 'upNext', slot: upcoming };
  const openSlot = slots.find((s) => s.kind === 'open' && !isUnplanned(s) && s.status === 'pending' && s.entries.length === 0) ?? null;
  return { kind: 'done', openSlot };
}

export type SlotState = 'planned' | 'unconfirmed' | 'confirmed' | 'adjusted' | 'skipped' | 'open' | 'logged' | 'unplanned';

/** The state word a slot row shows. */
export function slotState(slot: LoggedSlot, now: string | null): SlotState {
  if (slot.status === 'skipped') return 'skipped';
  if (isUnplanned(slot)) return 'unplanned';
  if (slot.kind === 'open') return slot.entries.length > 0 || slot.status === 'confirmed' ? 'logged' : 'open';
  if (slot.status === 'confirmed') return 'confirmed';
  if (slot.status === 'adjusted') return 'adjusted';
  return isDue(slot, now) && slot.entries.length > 0 ? 'unconfirmed' : 'planned';
}

// ---------- quick entry ----------

export type QuickEntryInput = { name: string; kcal: string; carbs: string; protein: string; fat: string };
export type QuickEntryErrors = Partial<Record<keyof QuickEntryInput, string>>;

/** kcal from macros at 4/4/9, or null when no macro was entered. */
export function quickEntryMacroKcal(input: QuickEntryInput): number | null {
  const values = [input.carbs, input.protein, input.fat];
  if (values.every((v) => v.trim() === '')) return null;
  const [carbs_g, protein_g, fat_g] = values.map((v) => parseNumber(v) ?? 0);
  return Math.round(macroKcal({ carbs_g, protein_g, fat_g }));
}

/**
 * A logged item typed in directly, with no library food or meal behind it (a restaurant dish).
 * Name and either kcal or at least one macro are required; an empty macro counts as 0, and empty
 * kcal is worked out from the macros. One portion is quantity 1, so the normal quantity row can
 * log half or one and a half.
 */
export function quickEntryDraft(input: QuickEntryInput): { draft: EntryDraft; errors: null } | { draft: null; errors: QuickEntryErrors } {
  const errors: QuickEntryErrors = {};
  const name = input.name.trim();
  if (!name) errors.name = 'Give it a name.';
  const numbers: Record<'kcal' | 'carbs' | 'protein' | 'fat', number | null> = { kcal: null, carbs: null, protein: null, fat: null };
  for (const key of ['kcal', 'carbs', 'protein', 'fat'] as const) {
    if (input[key].trim() === '') continue;
    numbers[key] = parseNumber(input[key]);
    if (numbers[key] === null) errors[key] = 'Enter a number.';
  }
  const fromMacros = quickEntryMacroKcal(input);
  if (input.kcal.trim() === '' && fromMacros === null) errors.kcal = 'Enter the calories or the macros.';
  if (Object.keys(errors).length > 0) return { draft: null, errors };
  const kcal = numbers.kcal ?? fromMacros ?? 0;
  return {
    draft: {
      food: '',
      meal: '',
      name,
      quantity: 1,
      kcal: Math.round(kcal),
      carbs_g: numbers.carbs ?? 0,
      protein_g: numbers.protein ?? 0,
      fat_g: numbers.fat ?? 0,
      origin: 'adhoc',
      source: 'manual',
    },
    errors: null,
  };
}

/**
 * The "these macros add up to about N kcal" hint: shown when the macros are complete and the
 * typed kcal is missing or more than 10 kcal and 10 % away from them.
 */
export function macroKcalHint(kcal: number | null, fromMacros: number | null): number | null {
  if (fromMacros === null || fromMacros <= 0) return null;
  return kcal === null || Math.abs(kcal - fromMacros) > Math.max(10, fromMacros * 0.1) ? fromMacros : null;
}
