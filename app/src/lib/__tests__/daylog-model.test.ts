import { describe, expect, it } from '@jest/globals';

import {
  confirmableSlots,
  hasChanges,
  isUntouched,
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
