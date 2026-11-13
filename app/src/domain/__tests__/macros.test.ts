import { describe, expect, it } from '@jest/globals';

import { applyKcalChange, canSaveDayPlan, cutCapacityKcal, deriveMacros, macroFloors, macroKcal } from '@/domain';

import { BW, SETTINGS } from './fixtures';

describe('deriveMacros', () => {
  it('matches the worked example: Monday 3,500 kcal at 82 kg', () => {
    const d = deriveMacros(3500, BW, SETTINGS);
    expect(d.targets).toEqual({ kcal: 3500, protein_g: 164, fat_g: 66, carbs_g: 563 });
    expect(d.imbalanceKcal).toBe(0);
    expect(d.carbsDerived).toBe(true);
    expect(d.belowFloor).toEqual({ protein: false, fat: false, carbs: false });
  });

  it('keeps protein and fat fixed across days and lets carbs follow kcal', () => {
    const rest = deriveMacros(3100, BW, SETTINGS).targets;
    const hard = deriveMacros(3950, BW, SETTINGS).targets;
    expect([rest.protein_g, rest.fat_g]).toEqual([164, 66]);
    expect([hard.protein_g, hard.fat_g]).toEqual([164, 66]);
    expect(rest.carbs_g).toBe(463);
    expect(hard.carbs_g).toBe(675);
  });

  it('stays within gram rounding of the kcal target while carbs are derived', () => {
    for (const kcal of [2400, 3100, 3333, 3950, 4200]) {
      const d = deriveMacros(kcal, BW, SETTINGS);
      expect(Math.abs(macroKcal(d.targets) - kcal)).toBeLessThanOrEqual(2);
      expect(d.imbalanceKcal).toBe(0);
    }
  });

  it('lets carbs absorb protein and fat overrides without an imbalance', () => {
    // 150 g protein and 95 g fat, as in the current Monday plan.
    const d = deriveMacros(3500, BW, SETTINGS, { protein_gkg: 150 / BW, fat_gkg: 95 / BW });
    expect(d.targets.protein_g).toBe(150);
    expect(d.targets.fat_g).toBe(95);
    expect(d.targets.carbs_g).toBe(Math.round((3500 - 600 - 855) / 4));
    expect(d.imbalanceKcal).toBe(0);
    expect(d.targets.kcal).toBe(3500);
  });

  it('scales g/kg overrides with body weight', () => {
    expect(deriveMacros(3500, 80, SETTINGS, { protein_gkg: 1.8 }).targets.protein_g).toBe(144);
    expect(deriveMacros(3500, 85, SETTINGS, { protein_gkg: 1.8 }).targets.protein_g).toBe(153);
  });

  it('reports a surplus or deficit when carbs are set by hand', () => {
    const over = deriveMacros(3500, BW, SETTINGS, { carbs_g: 600 });
    expect(over.carbsDerived).toBe(false);
    expect(over.imbalanceKcal).toBe(164 * 4 + 66 * 9 + 600 * 4 - 3500); // +150
    expect(over.targets.kcal).toBe(3650);

    const under = deriveMacros(3500, BW, SETTINGS, { carbs_g: 500 });
    expect(under.imbalanceKcal).toBe(-250);
    expect(under.targets.kcal).toBe(3250);
  });

  it('reports a surplus when protein and fat alone exceed the target', () => {
    const d = deriveMacros(1000, BW, SETTINGS);
    expect(d.targets.carbs_g).toBe(0);
    expect(d.imbalanceKcal).toBe(164 * 4 + 66 * 9 - 1000);
    expect(d.belowFloor.carbs).toBe(true);
  });

  it('flags macros below their floor', () => {
    const d = deriveMacros(3500, BW, SETTINGS, { protein_gkg: 1.5, fat_gkg: 0.6 });
    expect(d.belowFloor).toEqual({ protein: true, fat: true, carbs: false });
  });
});

describe('canSaveDayPlan', () => {
  it('requires the exact imbalance to be accepted', () => {
    expect(canSaveDayPlan(0, 0)).toBe(true);
    expect(canSaveDayPlan(150, 0)).toBe(false);
    expect(canSaveDayPlan(150, 150)).toBe(true);
    expect(canSaveDayPlan(150, 100)).toBe(false);
    expect(canSaveDayPlan(-250, -250)).toBe(true);
  });
});

describe('applyKcalChange', () => {
  const floors = macroFloors(BW, SETTINGS);

  it('has the floors from the worked example', () => {
    expect(floors).toEqual({ protein_g: 131, fat_g: 66, carbs_g: 328 });
  });

  it('adds energy as carbs only', () => {
    const base = deriveMacros(3100, BW, SETTINGS).targets;
    const { targets, appliedKcal } = applyKcalChange(base, 200, floors);
    expect(appliedKcal).toBe(200);
    expect(targets).toEqual({ kcal: 3300, protein_g: 164, fat_g: 66, carbs_g: 513 });
  });

  it('cuts carbs when fat is already at its floor, and never protein', () => {
    const base = deriveMacros(3100, BW, SETTINGS).targets;
    const { targets, appliedKcal } = applyKcalChange(base, -460, floors);
    expect(appliedKcal).toBe(-460);
    expect(targets).toEqual({ kcal: 2640, protein_g: 164, fat_g: 66, carbs_g: 348 });
  });

  it('cuts fat above its floor before carbs', () => {
    const base = deriveMacros(3500, BW, SETTINGS, { fat_gkg: 95 / BW }).targets; // 95 g fat, 29 g above floor
    const small = applyKcalChange(base, -180, floors);
    expect(small.targets.fat_g).toBe(75);
    expect(small.targets.carbs_g).toBe(base.carbs_g);

    const big = applyKcalChange(base, -500, floors);
    expect(big.targets.fat_g).toBe(66);
    expect(big.targets.carbs_g).toBe(base.carbs_g - Math.round((500 - 29 * 9) / 4));
    expect(big.targets.protein_g).toBe(base.protein_g);
    expect(big.targets.kcal).toBe(base.kcal - 500);
  });

  it('stops at the floors and reports what was applied', () => {
    const base = deriveMacros(3100, BW, SETTINGS).targets;
    expect(cutCapacityKcal(base, floors)).toBe((463 - 328) * 4);
    const { targets, appliedKcal } = applyKcalChange(base, -2000, floors);
    expect(appliedKcal).toBe(-540);
    expect(targets).toEqual({ kcal: 2560, protein_g: 164, fat_g: 66, carbs_g: 328 });
  });

  it('cuts nothing from a day already below the carb floor', () => {
    const low = deriveMacros(2000, BW, SETTINGS).targets;
    expect(applyKcalChange(low, -300, floors)).toEqual({ targets: low, appliedKcal: 0 });
  });
});
