import { describe, expect, it } from '@jest/globals';

import { buildBaseTargets, spreadAdjustment } from '@/domain';

import { BW, plan, Q4_KCAL, SETTINGS } from './fixtures';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const week = (included: boolean[] = Array(7).fill(true), custom: number[] = Array(7).fill(0)) =>
  Q4_KCAL.map((kcal, i) => plan(kcal, { adjustment_included: included[i], adjustment_custom_kcal: custom[i] }));

describe('spreadAdjustment', () => {
  it('spreads evenly over all days by default', () => {
    expect(spreadAdjustment(-3500, week(), 'even')).toEqual({ perDay: Array(7).fill(-500), unplacedKcal: 0 });
  });

  it('matches the worked example: −3,500 with Tuesday at maintenance', () => {
    const { perDay, unplacedKcal } = spreadAdjustment(-3500, week([true, false, true, true, true, true, true]), 'even');
    expect(perDay).toEqual([-583, 0, -583, -583, -583, -584, -584]);
    expect(sum(perDay)).toBe(-3500);
    expect(unplacedKcal).toBe(0);
  });

  it('lands only on the selected days', () => {
    const { perDay } = spreadAdjustment(-1500, week([true, false, true, false, true, false, false]), 'even');
    expect(perDay).toEqual([-500, 0, -500, 0, -500, 0, 0]);
  });

  it('handles a surplus the same way', () => {
    const { perDay } = spreadAdjustment(1000, week(), 'even');
    expect(sum(perDay)).toBe(1000);
    expect(Math.max(...perDay) - Math.min(...perDay)).toBeLessThanOrEqual(1);
  });

  it('uses custom amounts and reports when they do not add up', () => {
    const days = week([true, false, true, false, true, false, false], [-700, -999, -500, 0, -300, 0, 0]);
    expect(spreadAdjustment(-1500, days, 'custom')).toEqual({ perDay: [-700, 0, -500, 0, -300, 0, 0], unplacedKcal: 0 });
    expect(spreadAdjustment(-2000, days, 'custom').unplacedKcal).toBe(-500);
  });

  it('places nothing when no day is included', () => {
    expect(spreadAdjustment(-1000, week(Array(7).fill(false)), 'even')).toEqual({ perDay: Array(7).fill(0), unplacedKcal: -1000 });
  });
});

describe('buildBaseTargets', () => {
  it('gives the maintenance week when there is no adjustment', () => {
    const t = buildBaseTargets(week(), { adjustment_kcal: 0, adjustment_mode: 'even' }, BW, SETTINGS);
    expect(t.maintenanceKcal).toBe(24350);
    expect(t.goalKcal).toBe(24350);
    expect(t.unappliedKcal).toBe(0);
    expect(t.days.map((d) => d.base.kcal)).toEqual(Q4_KCAL);
    expect(t.days[0].base).toEqual({ kcal: 3500, protein_g: 164, fat_g: 66, carbs_g: 563 });
  });

  it('applies a deficit to carbs and leaves protein alone', () => {
    const t = buildBaseTargets(week(), { adjustment_kcal: -3500, adjustment_mode: 'even' }, BW, SETTINGS);
    expect(t.goalKcal).toBe(24350 - 3500);
    expect(t.days[0].base).toEqual({ kcal: 3000, protein_g: 164, fat_g: 66, carbs_g: 438 });
    expect(t.days.every((d) => d.base.protein_g === 164)).toBe(true);
  });

  it('keeps a maintenance day untouched during a cut', () => {
    const t = buildBaseTargets(week([true, false, true, true, true, true, true]), { adjustment_kcal: -3500, adjustment_mode: 'even' }, BW, SETTINGS);
    expect(t.days[1].base).toEqual(t.days[1].maintenance);
    expect(t.days[1].adjustmentKcal).toBe(0);
    // Sat and Sun can only lose (463 − 328) × 4 = 540 of their 584 kcal share before the carb floor.
    expect(t.days[5].adjustmentKcal).toBe(-540);
    expect(t.unappliedKcal).toBe(-88);
    expect(t.goalKcal).toBe(24350 - 3500 + 88);
  });

  it('reports the part of a deficit the floors do not allow', () => {
    // −1,000 per day. Carb-floor capacity: Mon 940, Fri 740, Sat and Sun 540; Tue–Thu have room.
    const t = buildBaseTargets(week(), { adjustment_kcal: -7000, adjustment_mode: 'even' }, BW, SETTINGS);
    expect(t.days[6].base.carbs_g).toBe(328);
    expect(t.days.map((d) => d.unappliedKcal)).toEqual([-60, 0, 0, 0, -260, -460, -460]);
    expect(t.unappliedKcal).toBe(-1240);
    expect(t.goalKcal).toBe(24350 - 7000 + 1240);
  });

  it('includes an accepted surplus in the planned intake', () => {
    const plans = week();
    const withOverride = [{ ...plans[0], macro_overrides: { carbs_g: 600 } }, ...plans.slice(1)];
    const t = buildBaseTargets(withOverride, { adjustment_kcal: 0, adjustment_mode: 'even' }, BW, SETTINGS);
    expect(t.days[0].base.kcal).toBe(3650);
    expect(t.goalKcal).toBe(24350 + 150);
  });
});
