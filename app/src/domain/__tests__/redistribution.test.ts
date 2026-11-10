import { describe, expect, it } from '@jest/globals';

import { buildBaseTargets, cumulativeBalance, previewRedistribution, redistribute } from '@/domain';

import { BW, plan, Q4_KCAL, SETTINGS } from './fixtures';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const base = buildBaseTargets(Q4_KCAL.map((k) => plan(k)), { adjustment_kcal: 0, adjustment_mode: 'even' }, BW, SETTINGS).days.map((d) => d.base);

describe('cumulativeBalance', () => {
  it('sums eaten minus base target over closed days', () => {
    expect(cumulativeBalance([])).toBe(0);
    expect(cumulativeBalance([{ consumedKcal: 3620, baseKcal: 3500 }, { consumedKcal: 3850, baseKcal: 3950 }])).toBe(20);
  });
});

describe('redistribute', () => {
  it('matches the worked example: Saturday +800 with only Sunday left', () => {
    const r = redistribute(800, [base[6]], BW, SETTINGS);
    expect(r.changes).toEqual([-460]);
    expect(r.targets[0]).toEqual({ kcal: 2640, protein_g: 164, fat_g: 66, carbs_g: 348 });
    expect(r.unrecoveredKcal).toBe(340);
  });

  it('spreads a small overshoot proportionally in steps of 10 (mockup: Monday +120)', () => {
    const r = redistribute(120, base.slice(1), BW, SETTINGS);
    expect(r.changes).toEqual([-20, -20, -20, -20, -20, -20]);
    expect(r.targets.map((t) => t.kcal)).toEqual([3930, 3580, 3780, 3280, 3080, 3080]);
    expect(r.unrecoveredKcal).toBe(0);
  });

  it('gives bigger days a bigger share', () => {
    const r = redistribute(1200, base.slice(1), BW, SETTINGS);
    expect(sum(r.changes)).toBe(-1200);
    expect(r.unrecoveredKcal).toBe(0);
    expect(Math.abs(r.changes[0])).toBeGreaterThan(Math.abs(r.changes[5])); // Tue 3,950 vs Sun 3,100
    expect(r.changes.every((c) => c % 10 === 0)).toBe(true);
  });

  it('never changes protein and never goes below the fat or carb floor', () => {
    const r = redistribute(5000, base.slice(1), BW, SETTINGS);
    for (const t of r.targets) {
      expect(t.protein_g).toBe(164);
      expect(t.fat_g).toBeGreaterThanOrEqual(66);
      expect(t.carbs_g).toBeGreaterThanOrEqual(328);
    }
  });

  it('caps each day at 15 % and reports the rest as unrecovered', () => {
    const future = base.slice(1);
    const r = redistribute(5000, future, BW, SETTINGS);
    r.changes.forEach((c, i) => expect(Math.abs(c)).toBeLessThanOrEqual(future[i].kcal * 0.15));
    // Caps: Tue 590, Wed 540, Thu 570, Fri 490, Sat 460, Sun 460.
    expect(r.changes).toEqual([-590, -540, -570, -490, -460, -460]);
    expect(r.unrecoveredKcal).toBe(5000 - 3110);
  });

  it('re-shares what a saturated day cannot take', () => {
    // Two days: a low day that can only lose 100 kcal before the carb floor, and a normal day.
    const low = { kcal: 2662, protein_g: 164, fat_g: 66, carbs_g: 353 };
    const r = redistribute(400, [low, base[1]], BW, SETTINGS);
    expect(r.changes).toEqual([-100, -300]);
    expect(r.unrecoveredKcal).toBe(0);
  });

  it('adds an undershoot back as carbs, with the same cap', () => {
    const r = redistribute(-600, base.slice(4), BW, SETTINGS); // Fri, Sat, Sun
    expect(sum(r.changes)).toBe(600);
    expect(r.unrecoveredKcal).toBe(0);
    r.targets.forEach((t, i) => {
      expect(t.fat_g).toBe(66);
      expect(t.protein_g).toBe(164);
      expect(t.carbs_g).toBe(base[4 + i].carbs_g + Math.round(r.changes[i] / 4));
    });

    const capped = redistribute(-2000, [base[6]], BW, SETTINGS);
    expect(capped.changes).toEqual([460]);
    expect(capped.unrecoveredKcal).toBe(-1540);
  });

  it('leaves everything alone at zero balance and with no days left', () => {
    expect(redistribute(0, base, BW, SETTINGS).targets).toEqual(base);
    expect(redistribute(300, [], BW, SETTINGS)).toEqual({ targets: [], changes: [], unrecoveredKcal: 300 });
  });

  it('keeps balances under 10 kcal as unrecovered instead of moving targets', () => {
    const r = redistribute(7, base.slice(1), BW, SETTINGS);
    expect(sum(r.changes)).toBe(0);
    expect(r.unrecoveredKcal).toBe(7);
  });

  it('does not correct the same kcal twice when recomputed day by day', () => {
    // Monday +120. Tuesday is then eaten exactly at its redistributed target.
    const afterMon = redistribute(cumulativeBalance([{ consumedKcal: 3620, baseKcal: 3500 }]), base.slice(1), BW, SETTINGS);
    const tueEaten = afterMon.targets[0].kcal; // 3,930
    const balance = cumulativeBalance([
      { consumedKcal: 3620, baseKcal: 3500 },
      { consumedKcal: tueEaten, baseKcal: base[1].kcal },
    ]);
    expect(balance).toBe(100);
    const afterTue = redistribute(balance, base.slice(2), BW, SETTINGS);
    expect(afterTue.changes).toEqual([-20, -20, -20, -20, -20]);
    // Wed–Sun keep the targets they already had.
    expect(afterTue.targets).toEqual(afterMon.targets.slice(1));
  });

  it('is deterministic', () => {
    expect(redistribute(730, base.slice(2), BW, SETTINGS)).toEqual(redistribute(730, base.slice(2), BW, SETTINGS));
  });
});

describe('previewRedistribution', () => {
  it('treats today\'s projection as final', () => {
    const preview = previewRedistribution(120, { projectedKcal: 4150, baseKcal: 3950 }, base.slice(2), BW, SETTINGS);
    expect(preview).toEqual(redistribute(320, base.slice(2), BW, SETTINGS));
    expect(sum(preview.changes)).toBe(-320);
  });
});
