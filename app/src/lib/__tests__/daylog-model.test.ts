import { describe, expect, it } from '@jest/globals';

import {
  confirmableSlots,
  hasChanges,
  isUnplanned,
  isUntouched,
  macroKcalHint,
  newSlotId,
  nextUnplannedSort,
  nextUp,
  quickEntryDraft,
  slotState,
  UNPLANNED_SORT_START,
  plannedSlots,
  reconcileDayLog,
  scaleEntry,
  statusAfterSave,
  type EntryDraft,
  type LoggedSlot,
  type PlannedSlot,
} from '@/lib/daylog-model';
import type { LogEntryRecord, SlotKind, SlotStatus } from '@/lib/types';

const base = { user: 'u1', created: '', updated: '' };
const draft = (name: string, quantity: number, kcal: number, extra: Partial<EntryDraft> = {}): EntryDraft => ({
  food: `food-${name}`,
  meal: '',
  name,
  quantity,
  kcal,
  carbs_g: kcal / 8,
  protein_g: kcal / 40,
  fat_g: kcal / 90,
  origin: 'planned',
  source: 'manual',
  ...extra,
});
const entry = (d: EntryDraft, id = `e-${d.name}`): LogEntryRecord => ({ ...base, ...d, id, log_slot: 's', sort: 0 });
const planned = (id: string, name: string, time: string, entries: EntryDraft[] = [], kind: SlotKind = 'planned', sort = 0): PlannedSlot => ({
  planSlotId: id,
  name,
  time,
  kind,
  sort,
  entries,
});
const logged = (id: string, planSlot: string, name: string, time: string, status: SlotStatus, entries: EntryDraft[] = [], kind: SlotKind = 'planned', sort = 0): LoggedSlot => ({
  ...base,
  id,
  day_log: 'd',
  plan_slot: planSlot,
  name,
  time,
  kind,
  status,
  sort,
  entries: entries.map((e) => entry(e)),
});

const oats = draft('Oats', 120, 444);
const banana = draft('Banana', 2, 214);

describe('plannedSlots', () => {
  it('snapshots planned items and leaves open slots empty', () => {
    const nutrition = { kcal: 444, carbs_g: 72, protein_g: 15.6, fat_g: 8.4 };
    const item = { id: 'i1', quantity: 120, name: 'Oats', nutrition, food: { id: 'f1' } as never };
    const slots = plannedSlots({
      slots: [
        { id: 'p1', name: 'Breakfast', time: '09:00', kind: 'planned', items: [item] } as never,
        { id: 'p2', name: 'Dinner', time: '18:30', kind: 'open', items: [item] } as never,
      ],
    });
    expect(slots[0]).toEqual({
      planSlotId: 'p1',
      name: 'Breakfast',
      time: '09:00',
      kind: 'planned',
      sort: 0,
      entries: [{ food: 'f1', meal: '', name: 'Oats', quantity: 120, ...nutrition, origin: 'planned', source: 'manual' }],
    });
    expect(slots[1].entries).toEqual([]);
    expect(slots[1].sort).toBe(1);
  });
});

describe('reconcileDayLog', () => {
  it('creates every planned slot for a new day', () => {
    const plan = [planned('p1', 'Breakfast', '09:00', [oats]), planned('p2', 'Dinner', '18:30', [], 'open', 1)];
    const changes = reconcileDayLog([], plan);
    expect(changes).toEqual({ create: plan, update: [], remove: [] });
  });

  it('does nothing when the log already matches the plan', () => {
    const changes = reconcileDayLog([logged('s1', 'p1', 'Breakfast', '09:00', 'pending', [oats])], [planned('p1', 'Breakfast', '09:00', [oats])]);
    expect(hasChanges(changes)).toBe(false);
  });

  it('lets an untouched slot follow plan edits', () => {
    const changes = reconcileDayLog(
      [logged('s1', 'p1', 'Breakfast', '09:00', 'pending', [oats])],
      [planned('p1', 'Big breakfast', '08:30', [oats, banana])],
    );
    expect(changes.update).toEqual([
      { id: 's1', fields: { name: 'Big breakfast', time: '08:30', kind: 'planned', sort: 0 }, entries: [oats, banana] },
    ]);
  });

  it('only sends what differs', () => {
    const renamed = reconcileDayLog([logged('s1', 'p1', 'Breakfast', '09:00', 'pending', [oats])], [planned('p1', 'Frukost', '09:00', [oats])]);
    expect(renamed.update[0].entries).toBeUndefined();
    const refilled = reconcileDayLog([logged('s1', 'p1', 'Breakfast', '09:00', 'pending', [oats])], [planned('p1', 'Breakfast', '09:00', [scaleEntry(oats, 100)])]);
    expect(refilled.update[0].fields).toBeUndefined();
    expect(refilled.update[0].entries?.[0].quantity).toBe(100);
  });

  it('never changes a slot the user has acted on', () => {
    for (const status of ['confirmed', 'adjusted', 'skipped'] as const) {
      const changes = reconcileDayLog([logged('s1', 'p1', 'Breakfast', '09:00', status, [oats])], [planned('p1', 'Renamed', '10:00', [banana])]);
      expect(hasChanges(changes)).toBe(false);
    }
    const withAdhoc = logged('s1', 'p1', 'Dinner', '18:30', 'pending', [draft('Pizza', 1, 900, { origin: 'adhoc' })], 'open');
    expect(isUntouched(withAdhoc)).toBe(false);
    expect(hasChanges(reconcileDayLog([withAdhoc], [planned('p1', 'Supper', '19:00', [], 'open')]))).toBe(false);
  });

  it('removes untouched slots the plan no longer has and keeps handled ones', () => {
    const changes = reconcileDayLog(
      [
        logged('s1', 'gone', 'Snack', '11:30', 'pending', [banana]),
        logged('s2', '', 'Orphan', '15:00', 'pending'),
        logged('s3', 'gone2', 'Lunch', '13:00', 'confirmed', [oats]),
      ],
      [],
    );
    expect(changes.remove).toEqual(['s1', 's2']);
  });

  it('does not duplicate a confirmed meal when the plan slots are replaced', () => {
    // "Copy slots from another day" deletes and recreates plan slots, so ids change.
    const changes = reconcileDayLog(
      [logged('s1', '', 'Breakfast', '09:00', 'confirmed', [oats]), logged('s2', '', 'Lunch', '13:00', 'pending', [oats])],
      [planned('new1', 'Breakfast', '09:00', [oats]), planned('new2', 'Lunch', '13:00', [banana], 'planned', 1)],
    );
    expect(changes.remove).toEqual(['s2']);
    expect(changes.create.map((p) => p.planSlotId)).toEqual(['new2']);
  });
});

describe('entries', () => {
  it('scales the snapshot with the quantity', () => {
    expect(scaleEntry(oats, 60)).toMatchObject({ quantity: 60, kcal: 222, carbs_g: 27.8 });
    expect(scaleEntry(banana, 3).kcal).toBe(321);
    expect(scaleEntry({ ...oats, quantity: 0 }, 50).kcal).toBe(444);
  });

  it('marks a planned slot confirmed only when eaten exactly as planned', () => {
    const original = [entry(oats), entry(banana)];
    expect(statusAfterSave('planned', original, [oats, banana])).toBe('confirmed');
    expect(statusAfterSave('planned', original, [oats, scaleEntry(banana, 1)])).toBe('adjusted');
    expect(statusAfterSave('planned', original, [oats])).toBe('adjusted');
    expect(statusAfterSave('planned', original, [oats, banana, draft('Honey', 15, 46, { origin: 'adhoc' })])).toBe('adjusted');
  });

  it('marks an open slot confirmed once something is logged', () => {
    expect(statusAfterSave('open', [], [draft('Pizza', 1, 900, { origin: 'adhoc' })])).toBe('confirmed');
    expect(statusAfterSave('open', [], [])).toBe('pending');
  });
});

describe('reconcileDayLog with unplanned slots', () => {
  const fika = draft('Cinnamon bun', 1, 310, { food: '', origin: 'adhoc' });
  const unplanned = (id: string, name: string, time: string, sort = UNPLANNED_SORT_START) =>
    logged(id, '', name, time, 'confirmed', [fika], 'open', sort);

  it('keeps a confirmed unplanned slot and creates nothing for it', () => {
    const changes = reconcileDayLog([logged('s1', 'p1', 'Breakfast', '09:00', 'pending', [oats]), unplanned('u1', 'Fika', '10:42')], [planned('p1', 'Breakfast', '09:00', [oats])]);
    expect(hasChanges(changes)).toBe(false);
  });

  it('still creates a planned slot with the same name and time as an unplanned one', () => {
    const changes = reconcileDayLog([unplanned('u1', 'Snack', '15:00')], [planned('p9', 'Snack', '15:00', [banana])]);
    expect(changes.create.map((p) => p.planSlotId)).toEqual(['p9']);
    expect(changes.remove).toEqual([]);
  });

  it('still does not duplicate a handled open plan slot after the plan slots are replaced', () => {
    const dinner = logged('s1', '', 'Dinner', '18:30', 'confirmed', [fika], 'open', 3);
    const changes = reconcileDayLog([dinner], [planned('new', 'Dinner', '18:30', [], 'open', 3)]);
    expect(changes.create).toEqual([]);
  });
});

describe('unplanned slot helpers', () => {
  it('recognises a slot without a plan slot', () => {
    expect(isUnplanned({ plan_slot: '' })).toBe(true);
    expect(isUnplanned({ plan_slot: 'p1' })).toBe(false);
  });

  it('sorts new unplanned slots after the plan and after each other', () => {
    expect(nextUnplannedSort([{ sort: 0 }, { sort: 4 }])).toBe(UNPLANNED_SORT_START);
    expect(nextUnplannedSort([{ sort: 2 }, { sort: UNPLANNED_SORT_START }])).toBe(UNPLANNED_SORT_START + 1);
  });

  it('makes 15-character ids from [a-z0-9]', () => {
    const id = newSlotId();
    expect(id).toMatch(/^[a-z0-9]{15}$/);
    expect(newSlotId(() => 0)).toBe('aaaaaaaaaaaaaaa');
  });
});

describe('nextUp', () => {
  const breakfast = logged('s1', 'p1', 'Breakfast', '09:00', 'pending', [oats]);
  const snack = logged('s2', 'p2', 'Snack', '11:30', 'pending', [banana]);
  const dinner = logged('s3', 'p3', 'Dinner', '18:30', 'pending', [], 'open');

  it('lists the due meals', () => {
    expect(nextUp([breakfast, snack, dinner], '12:10')).toEqual({ kind: 'due', slots: [breakfast, snack] });
    expect(nextUp([breakfast, snack, dinner], '10:00')).toEqual({ kind: 'due', slots: [breakfast] });
  });

  it('offers the next planned meal when nothing is due', () => {
    expect(nextUp([breakfast, snack, dinner], '08:00')).toEqual({ kind: 'upNext', slot: breakfast });
  });

  it('is done when no planned meal waits, pointing at an empty open slot', () => {
    const done = [{ ...breakfast, status: 'confirmed' as const }, { ...snack, status: 'skipped' as const }];
    expect(nextUp([...done, dinner], '12:10')).toEqual({ kind: 'done', openSlot: dinner });
    expect(nextUp(done, '12:10')).toEqual({ kind: 'done', openSlot: null });
  });

  it('treats every pending meal as due on an earlier day', () => {
    expect(nextUp([breakfast, snack, dinner], null)).toEqual({ kind: 'due', slots: [breakfast, snack] });
  });

  it('does not point at an unplanned slot', () => {
    const fika = logged('u1', '', 'Fika', '10:42', 'pending', [], 'open', UNPLANNED_SORT_START);
    expect(nextUp([fika], '12:10')).toEqual({ kind: 'done', openSlot: null });
  });
});

describe('slotState', () => {
  const at = (status: SlotStatus, entries: EntryDraft[] = [oats], kind: SlotKind = 'planned', planSlot = 'p1') =>
    logged('s', planSlot, 'Slot', '11:30', status, entries, kind);

  it('names every state', () => {
    expect(slotState(at('pending'), '10:00')).toBe('planned');
    expect(slotState(at('pending'), '12:00')).toBe('unconfirmed');
    expect(slotState(at('pending', []), '12:00')).toBe('planned');
    expect(slotState(at('confirmed'), '12:00')).toBe('confirmed');
    expect(slotState(at('adjusted'), '12:00')).toBe('adjusted');
    expect(slotState(at('skipped'), '12:00')).toBe('skipped');
    expect(slotState(at('pending', [], 'open'), '12:00')).toBe('open');
    expect(slotState(at('confirmed', [oats], 'open'), '12:00')).toBe('logged');
    expect(slotState(at('confirmed', [oats], 'open', ''), '12:00')).toBe('unplanned');
  });

  it('shows a skipped unplanned slot as skipped', () => {
    expect(slotState(at('skipped', [oats], 'open', ''), '12:00')).toBe('skipped');
  });
});

describe('quickEntryDraft', () => {
  const input = { name: 'Carbonara, Trattoria', kcal: '850', carbs: '90', protein: '35', fat: '38' };

  it('builds an item with no library reference', () => {
    expect(quickEntryDraft(input)).toEqual({
      draft: { food: '', meal: '', name: 'Carbonara, Trattoria', quantity: 1, kcal: 850, carbs_g: 90, protein_g: 35, fat_g: 38, origin: 'adhoc', source: 'manual' },
      errors: null,
    });
  });

  it('works out kcal from the macros when it is left empty, and counts empty macros as 0', () => {
    expect(quickEntryDraft({ ...input, kcal: '', fat: '' }).draft?.kcal).toBe(500);
    expect(quickEntryDraft({ ...input, kcal: '' }).draft?.kcal).toBe(842);
  });

  it('accepts kcal alone', () => {
    expect(quickEntryDraft({ name: 'Ice cream', kcal: '250', carbs: '', protein: '', fat: '' }).draft).toMatchObject({ kcal: 250, carbs_g: 0 });
  });

  it('accepts a decimal comma', () => {
    expect(quickEntryDraft({ ...input, fat: '38,5' }).draft?.fat_g).toBe(38.5);
  });

  it('reports what is missing or wrong', () => {
    expect(quickEntryDraft({ name: ' ', kcal: '', carbs: '', protein: '', fat: '' }).errors).toEqual({
      name: 'Give it a name.',
      kcal: 'Enter the calories or the macros.',
    });
    expect(quickEntryDraft({ ...input, protein: 'lots' }).errors).toEqual({ protein: 'Enter a number.' });
  });
});

describe('macroKcalHint', () => {
  it('suggests the macro kcal when the typed kcal is missing or far off', () => {
    expect(macroKcalHint(null, 842)).toBe(842);
    expect(macroKcalHint(700, 842)).toBe(842);
    expect(macroKcalHint(850, 842)).toBeNull();
    expect(macroKcalHint(null, null)).toBeNull();
    expect(macroKcalHint(null, 0)).toBeNull();
  });
});

describe('confirmableSlots', () => {
  const slots = [
    logged('s1', 'p1', 'Breakfast', '09:00', 'pending', [oats]),
    logged('s2', 'p2', 'Snack', '11:30', 'pending', [banana]),
    logged('s3', 'p3', 'Lunch', '13:00', 'pending', [oats]),
    logged('s4', 'p4', 'Empty', '08:00', 'pending'),
    logged('s5', 'p5', 'Dinner', '18:30', 'pending', [], 'open'),
    logged('s6', 'p6', 'Done', '07:00', 'confirmed', [oats]),
  ];

  it('lists pending planned slots with items that are due', () => {
    expect(confirmableSlots(slots, '12:10').map((s) => s.id)).toEqual(['s1', 's2']);
    expect(confirmableSlots(slots, '08:59')).toEqual([]);
  });

  it('treats everything as due on a past day', () => {
    expect(confirmableSlots(slots, null).map((s) => s.id)).toEqual(['s1', 's2', 's3']);
  });
});
