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
