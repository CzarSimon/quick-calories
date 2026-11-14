import { describe, expect, it } from '@jest/globals';

import type { EntryDraft, LoggedSlot } from '@/lib/daylog-model';
import { addOp, applyOps, classifyFailure, sendOps, type OutboxOp } from '@/lib/outbox-model';

const draft = (name: string, kcal: number): EntryDraft => ({ food: 'f', meal: '', name, quantity: 1, kcal, carbs_g: 0, protein_g: 0, fat_g: 0, origin: 'planned', source: 'manual' });
const slot = (id: string, status: LoggedSlot['status'], names: string[]): LoggedSlot =>
  ({ id, user: 'u', created: '', updated: '', day_log: 'd', plan_slot: 'p', name: id, time: '09:00', kind: 'planned', status, sort: 0, entries: names.map((n, i) => ({ ...draft(n, 100), id: `e${i}`, user: 'u', created: '', updated: '', log_slot: id, sort: i })) }) as LoggedSlot;
const op = (id: string, slotId: string, status: OutboxOp['status'], entries?: EntryDraft[]): OutboxOp => ({ id, date: '2026-11-11', slotId, status, entries });

describe('addOp', () => {
  it('appends the first operation for a slot', () => {
    expect(addOp([], { date: '2026-11-11', slotId: 's1', status: 'confirmed' }, 'a')).toEqual([op('a', 's1', 'confirmed')]);
  });

  it('lets the latest status win for the same slot', () => {
    const ops = addOp([op('a', 's1', 'confirmed'), op('b', 's2', 'skipped')], { date: '2026-11-11', slotId: 's1', status: 'pending' }, 'c');
    expect(ops).toEqual([op('a', 's1', 'pending'), op('b', 's2', 'skipped')]);
  });

  it('keeps saved entries when only the status changes afterwards', () => {
    const entries = [draft('Oats', 555)];
    const ops = addOp([op('a', 's1', 'adjusted', entries)], { date: '2026-11-11', slotId: 's1', status: 'skipped' }, 'b');
    expect(ops).toEqual([op('a', 's1', 'skipped', entries)]);
  });

  it('replaces entries with a newer save', () => {
    const ops = addOp([op('a', 's1', 'adjusted', [draft('Oats', 555)])], { date: '2026-11-11', slotId: 's1', status: 'adjusted', entries: [draft('Oats', 370)] }, 'b');
    expect(ops[0].entries?.[0].kcal).toBe(370);
    expect(ops).toHaveLength(1);
  });

  it('does not touch an operation that is being sent', () => {
    const ops = addOp([op('a', 's1', 'confirmed')], { date: '2026-11-11', slotId: 's1', status: 'pending' }, 'b', 'a');
    expect(ops).toEqual([op('a', 's1', 'confirmed'), op('b', 's1', 'pending')]);
  });
});

describe('applyOps', () => {
  const slots = [slot('s1', 'pending', ['Oats', 'Banana']), slot('s2', 'pending', ['Skyr'])];

  it('returns the same slots when nothing is pending', () => {
    expect(applyOps(slots, [])).toBe(slots);
  });

  it('shows a pending status and leaves other slots alone', () => {
    const shown = applyOps(slots, [op('a', 's1', 'confirmed')]);
    expect(shown[0].status).toBe('confirmed');
    expect(shown[0].entries).toBe(slots[0].entries);
    expect(shown[1]).toBe(slots[1]);
  });

  it('shows pending entries in place of the saved ones', () => {
    const shown = applyOps(slots, [op('a', 's1', 'adjusted', [draft('Oats', 555)])]);
    expect(shown[0].entries.map((e) => [e.name, e.kcal, e.log_slot, e.sort])).toEqual([['Oats', 555, 's1', 0]]);
    expect(shown[0].status).toBe('adjusted');
  });

  it('applies operations for the same slot in order', () => {
    const shown = applyOps(slots, [op('a', 's1', 'confirmed'), op('b', 's1', 'skipped', [])]);
    expect(shown[0]).toMatchObject({ status: 'skipped', entries: [] });
  });

  it('ignores operations for slots that are not there', () => {
    expect(applyOps(slots, [op('a', 'gone', 'confirmed')])).toEqual(slots);
  });
});

describe('unplanned slots in the outbox', () => {
  const fika = [{ ...draft('Cinnamon bun', 310), food: '', origin: 'adhoc' as const }];
  const create = { dayLogId: 'd', name: 'Fika', time: '10:42', sort: 1000 };
  const created: OutboxOp = { id: 'a', date: '2026-11-11', slotId: 'u1', status: 'confirmed', entries: fika, create };

  it('folds a later save into a creation that has not been sent', () => {
    const ops = addOp([created], { date: '2026-11-11', slotId: 'u1', status: 'confirmed', entries: [], fields: { time: '10:30' } }, 'b');
    expect(ops).toEqual([{ ...created, entries: [], fields: { time: '10:30' } }]);
  });

  it('cancels a creation that is removed before it is sent', () => {
    const other = op('x', 's1', 'confirmed');
    expect(addOp([other, created], { date: '2026-11-11', slotId: 'u1', remove: true }, 'b')).toEqual([other]);
  });

  it('keeps a removal separate from a creation that is being sent', () => {
    const ops = addOp([created], { date: '2026-11-11', slotId: 'u1', remove: true }, 'b', 'a');
    expect(ops).toEqual([created, { id: 'b', date: '2026-11-11', slotId: 'u1', remove: true }]);
  });

  it('turns a pending save of a slot on the server into a removal', () => {
    const ops = addOp([op('a', 's1', 'confirmed', fika)], { date: '2026-11-11', slotId: 's1', remove: true }, 'b');
    expect(ops).toEqual([{ id: 'a', date: '2026-11-11', slotId: 's1', remove: true }]);
  });

  it('merges name and time changes and keeps the status when none is given', () => {
    const first = addOp([], { date: '2026-11-11', slotId: 's1', status: 'confirmed', fields: { name: 'Fika' } }, 'a');
    const ops = addOp(first, { date: '2026-11-11', slotId: 's1', fields: { time: '15:00' } }, 'b');
    expect(ops).toEqual([{ id: 'a', date: '2026-11-11', slotId: 's1', status: 'confirmed', fields: { name: 'Fika', time: '15:00' } }]);
  });

  const day = [{ ...slot('s1', 'confirmed', ['Oats']), time: '09:00' }, { ...slot('s2', 'pending', ['Skyr']), time: '13:00' }];

  it('shows a created slot in time order on its own day only', () => {
    const shown = applyOps(day, [created], 'd');
    expect(shown.map((s) => [s.id, s.time])).toEqual([['s1', '09:00'], ['u1', '10:42'], ['s2', '13:00']]);
    expect(shown[1]).toMatchObject({ plan_slot: '', kind: 'open', status: 'confirmed', name: 'Fika', sort: 1000, day_log: 'd' });
    expect(shown[1].entries.map((e) => [e.name, e.kcal, e.log_slot])).toEqual([['Cinnamon bun', 310, 'u1']]);
    expect(applyOps(day, [created], 'another-day')).toEqual(day);
  });

  it('takes the day from the slots when none is given', () => {
    expect(applyOps(day, [created]).map((s) => s.id)).toEqual(['s1', 'u1', 's2']);
  });

  it('does not add a created slot twice once the server has it', () => {
    const onServer = [...day, { ...slot('u1', 'confirmed', ['Cinnamon bun']), time: '10:42', plan_slot: '' }];
    expect(applyOps(onServer, [created], 'd').filter((s) => s.id === 'u1')).toHaveLength(1);
  });

  it('applies a new time and re-sorts', () => {
    const shown = applyOps(day, [{ id: 'a', date: '2026-11-11', slotId: 's1', fields: { time: '14:00', name: 'Late breakfast' } }], 'd');
    expect(shown.map((s) => [s.id, s.name, s.time, s.status])).toEqual([
      ['s2', 's2', '13:00', 'pending'],
      ['s1', 'Late breakfast', '14:00', 'confirmed'],
    ]);
  });

  it('hides a removed slot', () => {
    expect(applyOps(day, [{ id: 'a', date: '2026-11-11', slotId: 's2', remove: true }], 'd').map((s) => s.id)).toEqual(['s1']);
  });

  it('still applies an operation stored by an earlier version of the app', () => {
    const stored = JSON.parse(JSON.stringify(op('a', 's2', 'skipped'))) as OutboxOp;
    expect(applyOps(day, [stored], 'd')[1].status).toBe('skipped');
  });
});

describe('sendOps', () => {
  const ops = [op('a', 's1', 'confirmed'), op('b', 's2', 'skipped'), op('c', 's3', 'confirmed')];
  const fail = (status?: number) => Object.assign(new Error('x'), { status });

  it('classifies failures', () => {
    expect(classifyFailure(0)).toBe('offline');
    expect(classifyFailure(undefined)).toBe('offline');
    expect(classifyFailure(503)).toBe('offline');
    expect(classifyFailure(429)).toBe('offline');
    expect(classifyFailure(404)).toBe('rejected');
    expect(classifyFailure(400)).toBe('rejected');
    expect(classifyFailure(401)).toBe('rejected');
  });

  it('sends everything in order when online', async () => {
    const done: string[] = [];
    const result = await sendOps(ops, async () => undefined, (o, outcome) => void done.push(`${o.id}:${outcome}`));
    expect(result).toEqual({ sent: 3, rejected: 0, stoppedOffline: false });
    expect(done).toEqual(['a:sent', 'b:sent', 'c:sent']);
  });

  it('stops at the first operation that cannot be sent and keeps the rest', async () => {
    const done: string[] = [];
    const send = async (o: OutboxOp) => {
      if (o.id === 'b') throw fail(0);
    };
    expect(await sendOps(ops, send, (o) => void done.push(o.id))).toEqual({ sent: 1, rejected: 0, stoppedOffline: true });
    expect(done).toEqual(['a']);
  });

  it('drops an operation the server refuses and carries on', async () => {
    const done: string[] = [];
    const send = async (o: OutboxOp) => {
      if (o.id === 'a') throw fail(404);
    };
    expect(await sendOps(ops, send, (o, outcome) => void done.push(`${o.id}:${outcome}`))).toEqual({ sent: 2, rejected: 1, stoppedOffline: false });
    expect(done).toEqual(['a:rejected', 'b:sent', 'c:sent']);
  });
});
