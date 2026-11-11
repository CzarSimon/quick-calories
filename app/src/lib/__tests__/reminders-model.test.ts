import { describe, expect, it } from '@jest/globals';

import { createConfirmQueue, flushConfirmQueue } from '@/lib/confirm-queue';
import type { LoggedSlot } from '@/lib/daylog-model';
import { buildReminders, diffReminders, fireDate, MAX_REMINDERS, type ReminderInput } from '@/lib/reminders-model';
import type { Schedule } from '@/lib/schedules-model';
import type { SlotKind, SlotStatus } from '@/lib/types';

const base = { user: 'u', created: '', updated: '' };
const nutrition = (kcal: number) => ({ kcal, carbs_g: kcal / 8, protein_g: kcal / 40, fat_g: kcal / 90 });

const planSlot = (id: string, name: string, time: string, kind: SlotKind, items: [string, number][], notify = true) => ({
  ...base,
  id,
  day_plan: 'd',
  name,
  time,
  kind,
  notify,
  sort: 0,
  items: items.map(([n, kcal], i) => ({ id: `${id}-i${i}`, quantity: 1, name: n, nutrition: nutrition(kcal) })),
  nutrition: nutrition(items.reduce((s, [, k]) => s + k, 0)),
});

// Every day of the week has the same plan; ids are prefixed with the day index.
const daySlots = (d: number) => [
  planSlot(`${d}-bf`, 'Breakfast', '09:00', 'planned', [['Base breakfast', 444], ['Banana', 107]]),
  planSlot(`${d}-sn`, 'Snack', '11:30', 'planned', [['Banana', 214]]),
  planSlot(`${d}-em`, 'Empty', '12:00', 'planned', []),
  planSlot(`${d}-lu`, 'Lunch', '13:00', 'planned', [['Oats', 740]], false),
  planSlot(`${d}-di`, 'Dinner', '18:30', 'open', []),
  planSlot(`${d}-ev`, 'Evening snack', '21:30', 'planned', [['Skyr', 300]]),
];
const schedule = {
  ...base,
  id: 's1',
  name: 'Q4',
  labels: [],
  is_active: true,
  adjustment_kcal: 0,
  adjustment_mode: 'even',
  labelRecords: [],
  days: Array.from({ length: 7 }, (_, d) => ({ id: `day${d}`, day_index: d, kcal: 3500, slots: daySlots(d) })),
} as unknown as Schedule;

const logged = (planId: string, name: string, time: string, kind: SlotKind, status: SlotStatus, kcals: number[]): LoggedSlot =>
  ({
    ...base,
    id: `log-${planId}`,
    day_log: 'dl',
    plan_slot: planId,
    name,
    time,
    kind,
    status,
    sort: 0,
    entries: kcals.map((kcal, i) => ({ ...base, id: `e${i}`, log_slot: '', food: '', meal: '', name: `Item ${i + 1}`, quantity: 1, ...nutrition(kcal), origin: 'planned', source: 'manual', sort: i })),
  }) as LoggedSlot;

// 2026-11-11 is a Wednesday: day index 2 with a Monday anchor.
const input = (extra: Partial<ReminderInput> = {}): ReminderInput => ({
  today: '2026-11-11',
  now: '12:10',
  settings: { microcycle_anchor_date: '2026-11-02', microcycle_length_days: 7, nudge_evening_time: '21:00', nudge_morning_time: '08:00' },
  schedule,
  todayLog: null,
  yesterdayUnconfirmed: 0,
  queued: [],
  ...extra,
});
const ids = (rs: { id: string }[]) => rs.map((r) => r.id);
const on = (rs: ReturnType<typeof buildReminders>, date: string) => rs.filter((r) => r.at.date === date);

describe('buildReminders', () => {
  it('schedules nothing without an active schedule', () => {
    expect(buildReminders(input({ schedule: null }))).toEqual([]);
  });

  it('covers a week, in time order, within the iOS limit', () => {
    const all = buildReminders(input());
    expect(all.length).toBeLessThanOrEqual(MAX_REMINDERS);
    expect(new Set(all.map((r) => r.at.date)).size).toBe(7);
    const times = all.map((r) => `${r.at.date}T${r.at.time}`);
    expect([...times].sort()).toEqual(times);
    expect(all.every((r) => r.id.startsWith('qc:'))).toBe(true);
  });

  it('describes a planned meal and offers the confirm button', () => {
    const tomorrow = on(buildReminders(input()), '2026-11-12');
    const breakfast = tomorrow.find((r) => r.id === 'qc:slot:2026-11-12:3-bf')!;
    expect(breakfast).toMatchObject({
      at: { date: '2026-11-12', time: '09:00' },
      title: 'Breakfast',
      body: 'Base breakfast, Banana · 551 kcal',
      data: { kind: 'slot', date: '2026-11-12', planSlotId: '3-bf', confirmable: true },
    });
  });

  it('skips slots with reminders off and planned slots with nothing in them', () => {
    const tomorrow = ids(on(buildReminders(input()), '2026-11-12'));
    expect(tomorrow).not.toContain('qc:slot:2026-11-12:3-lu');
    expect(tomorrow).not.toContain('qc:slot:2026-11-12:3-em');
    expect(tomorrow).toContain('qc:slot:2026-11-12:3-di');
  });

  it('leaves out what is already past today', () => {
    const today = ids(on(buildReminders(input()), '2026-11-11'));
    expect(today).toEqual(['qc:slot:2026-11-11:2-di', 'qc:evening:2026-11-11', 'qc:slot:2026-11-11:2-ev']);
  });

  it('uses today\'s log: no reminder for handled meals, and the dinner budget in the text', () => {
    const todayLog = {
      targets: { kcal: 3600, protein_g: 164, fat_g: 66, carbs_g: 588 },
      slots: [
        logged('2-bf', 'Breakfast', '09:00', 'planned', 'confirmed', [444, 107]),
        logged('2-sn', 'Snack', '11:30', 'planned', 'pending', [214]),
        logged('2-di', 'Dinner', '18:30', 'open', 'pending', []),
        logged('2-ev', 'Evening snack', '21:30', 'planned', 'skipped', [300]),
      ],
    };
    const today = on(buildReminders(input({ todayLog })), '2026-11-11');
    expect(ids(today)).toEqual(['qc:slot:2026-11-11:2-di', 'qc:evening:2026-11-11']);
    // 3,600 − (551 + 214) = 2,835 left; the skipped snack does not count.
    expect(today[0].body).toBe('About 2,835 kcal left: 492 g carbs, 145 g protein.');
    expect(today[0].data.confirmable).toBeUndefined();
    expect(today[1].title).toBe('1 meal to confirm');
  });

  it('drops the evening nudge once everything due is confirmed or queued', () => {
    const slots = [logged('2-bf', 'Breakfast', '09:00', 'planned', 'confirmed', [551]), logged('2-sn', 'Snack', '11:30', 'planned', 'pending', [214])];
    const todayLog = { targets: null, slots };
    expect(ids(on(buildReminders(input({ todayLog })), '2026-11-11'))).toContain('qc:evening:2026-11-11');
    const queued = [{ date: '2026-11-11', planSlotId: '2-sn' }];
    expect(ids(on(buildReminders(input({ todayLog, queued })), '2026-11-11'))).not.toContain('qc:evening:2026-11-11');
    const done = { targets: null, slots: slots.map((s) => ({ ...s, status: 'confirmed' as const })) };
    expect(ids(on(buildReminders(input({ todayLog: done })), '2026-11-11'))).not.toContain('qc:evening:2026-11-11');
  });

  it('does not count a meal after the evening time towards the evening nudge', () => {
    const todayLog = { targets: null, slots: [logged('2-ev', 'Evening snack', '21:30', 'planned', 'pending', [300])] };
    const today = ids(on(buildReminders(input({ todayLog })), '2026-11-11'));
    expect(today).toEqual(['qc:slot:2026-11-11:2-ev']);
  });

  it('nudges in the morning about yesterday', () => {
    const early = input({ now: '07:00', yesterdayUnconfirmed: 2 });
    const morning = buildReminders(early).find((r) => r.id === 'qc:morning:2026-11-11')!;
    expect(morning).toMatchObject({ at: { date: '2026-11-11', time: '08:00' }, title: '2 meals from yesterday to confirm', data: { kind: 'morning', date: '2026-11-10' } });
    expect(ids(buildReminders(input({ now: '07:00' })))).not.toContain('qc:morning:2026-11-11');
    // Tomorrow morning is about today.
    const todayLog = { targets: null, slots: [logged('2-sn', 'Snack', '11:30', 'planned', 'pending', [214])] };
    expect(buildReminders(input({ todayLog })).find((r) => r.id === 'qc:morning:2026-11-12')!.title).toBe('1 meal from yesterday to confirm');
    const done = { targets: null, slots: [logged('2-sn', 'Snack', '11:30', 'planned', 'confirmed', [214])] };
    expect(ids(buildReminders(input({ todayLog: done })))).not.toContain('qc:morning:2026-11-12');
  });

  it('does not remind about a meal whose confirmation is queued', () => {
    const queued = [{ date: '2026-11-12', planSlotId: '3-bf' }];
    expect(ids(buildReminders(input({ queued })))).not.toContain('qc:slot:2026-11-12:3-bf');
  });
});

describe('diffReminders', () => {
  const desired = buildReminders(input()).slice(0, 3);

  it('schedules everything on a clean phone', () => {
    expect(diffReminders(desired, [])).toEqual({ cancel: [], schedule: desired });
  });

  it('does nothing when the phone already matches', () => {
    expect(diffReminders(desired, desired.map((r) => ({ id: r.id, signature: r.signature })))).toEqual({ cancel: [], schedule: [] });
  });

  it('replaces changed reminders, cancels stale ones and ignores foreign notifications', () => {
    const scheduled = [
      { id: desired[0].id, signature: desired[0].signature },
      { id: desired[1].id, signature: 'old text' },
      { id: 'qc:slot:2026-11-01:gone', signature: 'x' },
      { id: 'some-other-notification', signature: 'y' },
    ];
    const diff = diffReminders(desired, scheduled);
    expect(diff.cancel).toEqual([desired[1].id, 'qc:slot:2026-11-01:gone']);
    expect(ids(diff.schedule)).toEqual([desired[1].id, desired[2].id]);
  });
});

describe('fireDate', () => {
  it('is the local wall-clock time', () => {
    const d = fireDate({ date: '2026-11-12', time: '09:05' });
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 10, 12, 9, 5]);
  });
});

describe('confirm queue', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: async (k: string) => data.get(k) ?? null, setItem: async (k: string, v: string) => void data.set(k, v) };
  };
  const a = { date: '2026-11-11', planSlotId: 'p1' };
  const b = { date: '2026-11-11', planSlotId: 'p2' };

  it('keeps each confirmation once and survives a new instance', async () => {
    const storage = memory();
    const queue = createConfirmQueue(storage);
    await queue.add(a);
    await queue.add(a);
    await queue.add(b);
    expect(await createConfirmQueue(storage).list()).toEqual([a, b]);
    await queue.remove(a);
    expect(await queue.list()).toEqual([b]);
  });

  it('acts on a notification response only once', async () => {
    const queue = createConfirmQueue(memory());
    expect(await queue.markHandled('qc:slot:2026-11-11:p1|confirm')).toBe(true);
    expect(await queue.markHandled('qc:slot:2026-11-11:p1|confirm')).toBe(false);
  });

  it('sends in order and keeps what could not be sent', async () => {
    const queue = createConfirmQueue(memory());
    await queue.add(a);
    await queue.add(b);
    const sent: string[] = [];
    const offlineAfterFirst = async (item: typeof a) => {
      if (sent.length === 1) throw new Error('offline');
      sent.push(item.planSlotId);
    };
    expect(await flushConfirmQueue(queue, offlineAfterFirst)).toEqual({ sent: 1, left: 1 });
    expect(await queue.list()).toEqual([b]);
    expect(await flushConfirmQueue(queue, async () => false)).toEqual({ sent: 1, left: 0 });
    expect(await queue.list()).toEqual([]);
  });

  it('treats unreadable storage as empty', async () => {
    const queue = createConfirmQueue({ getItem: async () => '{not json', setItem: async () => undefined });
    expect(await queue.list()).toEqual([]);
  });
});
