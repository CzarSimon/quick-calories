import { describe, expect, it } from '@jest/globals';

import { isMonday, microcycleDayLabel } from '@/domain';

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
