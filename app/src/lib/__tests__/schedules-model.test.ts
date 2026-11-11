import { describe, expect, it } from '@jest/globals';

import { formatSignedKcal, normalizeTime } from '@/lib/format';
import { buildLibrary } from '@/lib/library-model';
import { buildSchedules, copyName, plannedNutrition } from '@/lib/schedules-model';
import type { DayPlanRecord, FoodRecord, PlanSlotItemRecord, PlanSlotRecord, ScheduleRecord } from '@/lib/types';

const base = { user: 'u1', created: '', updated: '' };
const oats: FoodRecord = { ...base, id: 'f1', name: 'Oats', ref_amount: 100, unit: 'g', kcal: 370, carbs_g: 60, protein_g: 13, fat_g: 7, source: 'manual', archived: false };
const banana: FoodRecord = { ...base, id: 'f2', name: 'Banana', ref_amount: 1, unit: 'piece', kcal: 107, carbs_g: 27, protein_g: 1.3, fat_g: 0.4, source: 'manual', archived: false };
const library = buildLibrary(
  [oats, banana],
  [{ ...base, id: 'm1', name: 'Base breakfast', notes: '', source: 'manual', archived: false }],
  [{ ...base, id: 'mi1', meal: 'm1', food: 'f1', quantity: 120, sort: 0 }],
);

const schedule = (id: string, name: string, is_active: boolean): ScheduleRecord => ({ ...base, id, name, labels: ['l1', 'gone'], is_active, adjustment_kcal: 0, adjustment_mode: 'even' });
const plan = (id: string, scheduleId: string, day_index: number): DayPlanRecord => ({ ...base, id, schedule: scheduleId, day_index, kcal: 3500, macro_overrides: null, accepted_imbalance_kcal: 0, adjustment_included: true, adjustment_custom_kcal: 0 });
const slot = (id: string, day_plan: string, time: string, kind: 'planned' | 'open', sort = 0): PlanSlotRecord => ({ ...base, id, day_plan, name: id, time, kind, notify: true, sort });
const item = (id: string, slotId: string, ref: { food?: string; meal?: string }, quantity: number, sort: number): PlanSlotItemRecord => ({ ...base, id, slot: slotId, food: ref.food ?? '', meal: ref.meal ?? '', quantity, sort });

describe('buildSchedules', () => {
  const built = buildSchedules(
    [schedule('s2', 'holiday', false), schedule('s1', 'Q4 training', true), schedule('s3', 'Cut', false)],
    [{ ...base, id: 'l1', name: 'Q4', color: '' }],
    [plan('d2', 's1', 1), plan('d1', 's1', 0)],
    [slot('lunch', 'd1', '13:00', 'planned'), slot('breakfast', 'd1', '09:00', 'planned'), slot('dinner', 'd1', '18:30', 'open')],
    [
      item('i2', 'breakfast', { food: 'f2' }, 2, 1),
      item('i1', 'breakfast', { meal: 'm1' }, 1, 0),
      item('i3', 'lunch', { food: 'f1' }, 50, 0),
      item('i4', 'lunch', { food: 'missing' }, 1, 1),
    ],
    library,
  );

  it('puts the active schedule first, then sorts by name', () => {
    expect(built.map((s) => s.name)).toEqual(['Q4 training', 'Cut', 'holiday']);
  });

  it('orders days by index and slots by time, and resolves labels', () => {
    const s = built[0];
    expect(s.days.map((d) => d.id)).toEqual(['d1', 'd2']);
    expect(s.days[0].slots.map((x) => x.id)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(s.labelRecords.map((l) => l.name)).toEqual(['Q4']);
  });

  it('resolves foods and meals with their nutrition and skips missing ones', () => {
    const [breakfast, lunch] = built[0].days[0].slots;
    expect(breakfast.items.map((i) => i.name)).toEqual(['Base breakfast', 'Banana']);
    expect(breakfast.items[0].nutrition.kcal).toBe(444);
    expect(breakfast.nutrition.kcal).toBe(444 + 214);
    expect(lunch.items).toHaveLength(1);
    expect(lunch.nutrition.kcal).toBe(185);
  });

  it('sums the planned slots of a day', () => {
    expect(plannedNutrition(built[0].days[0]).kcal).toBe(444 + 214 + 185);
    expect(plannedNutrition(built[0].days[1]).kcal).toBe(0);
  });
});

describe('copyName', () => {
  it('finds a free name', () => {
    expect(copyName('Q4', ['Q4'])).toBe('Q4 (copy)');
    expect(copyName('Q4', ['Q4', 'q4 (COPY)'])).toBe('Q4 (copy 2)');
  });
});

describe('normalizeTime and formatSignedKcal', () => {
  it('normalises typed times', () => {
    expect(normalizeTime('9')).toBe('09:00');
    expect(normalizeTime('900')).toBe('09:00');
    expect(normalizeTime('0930')).toBe('09:30');
    expect(normalizeTime('9:30')).toBe('09:30');
    expect(normalizeTime('18.45')).toBe('18:45');
    expect(normalizeTime(' 23:59 ')).toBe('23:59');
    for (const bad of ['', '24:00', '12:60', 'noon', '1:5', '12345']) expect(normalizeTime(bad)).toBeNull();
  });

  it('formats signed kcal', () => {
    expect(formatSignedKcal(-3500)).toBe('−3,500');
    expect(formatSignedKcal(250)).toBe('+250');
    expect(formatSignedKcal(0)).toBe('0');
  });
});
