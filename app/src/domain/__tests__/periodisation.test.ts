import { describe, expect, it } from '@jest/globals';

import {
  addDays,
  averageWeight,
  daysBetween,
  isMonday,
  microcycleDates,
  microcycleDayLabel,
  microcycleFor,
  nextMicrocycle,
  previousMicrocycle,
  resolveBodyWeight,
  toIsoDate,
} from '@/domain';

describe('date math', () => {
  it('adds days across month, year and DST boundaries', () => {
    expect(addDays('2026-11-02', 6)).toBe('2026-11-08');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30'); // EU DST change on the 29th
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(daysBetween('2026-11-02', '2026-11-10')).toBe(8);
    expect(daysBetween('2026-11-10', '2026-11-02')).toBe(-8);
  });

  it('formats a local date', () => {
    expect(toIsoDate(new Date(2026, 10, 3, 23, 59))).toBe('2026-11-03');
    expect(toIsoDate(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });
});

describe('microcycleFor', () => {
  it('finds the Monday-anchored week of a date', () => {
    expect(microcycleFor('2026-11-02', '2026-11-02', 7)).toEqual({ startDate: '2026-11-02', length: 7, dayIndex: 0 });
    expect(microcycleFor('2026-11-10', '2026-11-02', 7)).toEqual({ startDate: '2026-11-09', length: 7, dayIndex: 1 });
    expect(microcycleFor('2026-11-08', '2026-11-02', 7).dayIndex).toBe(6);
  });

  it('works for dates before the anchor', () => {
    expect(microcycleFor('2026-10-31', '2026-11-02', 7)).toEqual({ startDate: '2026-10-26', length: 7, dayIndex: 5 });
  });

  it('supports other lengths', () => {
    expect(microcycleFor('2026-11-12', '2026-11-02', 9)).toEqual({ startDate: '2026-11-11', length: 9, dayIndex: 1 });
    expect(microcycleFor('2026-11-06', '2026-11-02', 5)).toEqual({ startDate: '2026-11-02', length: 5, dayIndex: 4 });
  });

  it('steps between microcycles and lists their dates', () => {
    const mc = { startDate: '2026-11-09', length: 7 };
    expect(previousMicrocycle(mc)).toEqual({ startDate: '2026-11-02', length: 7 });
    expect(nextMicrocycle(mc)).toEqual({ startDate: '2026-11-16', length: 7 });
    expect(microcycleDates(mc)).toHaveLength(7);
    expect(microcycleDates(mc)[6]).toBe('2026-11-15');
  });
});

describe('microcycleDayLabel', () => {
  it('uses weekday names for a Monday-anchored 7-day microcycle', () => {
    const mc = { startDate: '2026-11-02', length: 7 };
    expect(isMonday(mc.startDate)).toBe(true);
    expect(microcycleDayLabel(mc, 0)).toBe('Mon');
    expect(microcycleDayLabel(mc, 6)).toBe('Sun');
  });

  it('numbers the days when the microcycle is not a Monday-anchored week', () => {
    expect(microcycleDayLabel({ startDate: '2026-11-02', length: 9 }, 0)).toBe('Day 1');
    expect(microcycleDayLabel({ startDate: '2026-11-03', length: 7 }, 4)).toBe('Day 5');
  });
});

describe('body weight', () => {
  const mc = { startDate: '2026-11-02', length: 7 };

  it('averages the samples inside the microcycle', () => {
    const samples = [
      { date: '2026-11-01', kg: 90 }, // before
      { date: '2026-11-02', kg: 82.4 },
      { date: '2026-11-04', kg: 81.8 },
      { date: '2026-11-08', kg: 82.1 },
      { date: '2026-11-09', kg: 70 }, // after
    ];
    expect(averageWeight(samples, mc)).toBe(82.1);
  });

  it('counts several weigh-ins on one day once', () => {
    const samples = [
      { date: '2026-11-02', kg: 83 },
      { date: '2026-11-02', kg: 83 },
      { date: '2026-11-02', kg: 83 },
      { date: '2026-11-03', kg: 81 },
    ];
    expect(averageWeight(samples, mc)).toBe(82);
  });

  it('returns null without samples', () => {
    expect(averageWeight([], mc)).toBeNull();
    expect(averageWeight([{ date: '2026-10-20', kg: 82 }], mc)).toBeNull();
  });

  it('falls back from Apple Health to the last used weight to the manual value', () => {
    expect(resolveBodyWeight({ previousMicrocycleAverageKg: 82.1, lastUsedKg: 82.5, fallbackKg: 82 })).toEqual({ kg: 82.1, source: 'healthkit' });
    expect(resolveBodyWeight({ previousMicrocycleAverageKg: null, lastUsedKg: 82.5, fallbackKg: 82 })).toEqual({ kg: 82.5, source: 'previous' });
    expect(resolveBodyWeight({ previousMicrocycleAverageKg: null, lastUsedKg: null, fallbackKg: 82 })).toEqual({ kg: 82, source: 'manual' });
    expect(resolveBodyWeight({ previousMicrocycleAverageKg: null, lastUsedKg: null, fallbackKg: 0 })).toBeNull();
  });
});
