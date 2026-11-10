import { describe, expect, it } from '@jest/globals';

import { foodNutrition, mealNutrition, projectDay, roundNutrition, type DaySlotInput } from '@/domain';

const targets = { kcal: 3930, protein_g: 164, fat_g: 66, carbs_g: 670 };
const e = (kcal: number, carbs_g: number, protein_g: number, fat_g: number, origin: 'planned' | 'adhoc' = 'planned') => ({
  origin,
  kcal,
  carbs_g,
  protein_g,
  fat_g,
});

describe('food and meal nutrition', () => {
  const oats = { ref_amount: 100, kcal: 370, carbs_g: 60, protein_g: 13, fat_g: 7 };
  const banana = { ref_amount: 1, kcal: 107, carbs_g: 27, protein_g: 1.3, fat_g: 0.4 };

  it('scales a food by quantity over its reference amount', () => {
    expect(foodNutrition(oats, 120)).toEqual({ kcal: 444, carbs_g: 72, protein_g: 15.6, fat_g: 8.4 });
    expect(foodNutrition(banana, 2).kcal).toBe(214);
    expect(foodNutrition({ ...oats, ref_amount: 0 }, 50).kcal).toBe(0);
  });

  it('sums a meal and scales by servings', () => {
    const items = [{ food: oats, quantity: 120 }, { food: banana, quantity: 1 }];
    expect(roundNutrition(mealNutrition(items))).toEqual({ kcal: 551, carbs_g: 99, protein_g: 16.9, fat_g: 8.8 });
    expect(mealNutrition(items, 0.5).kcal).toBeCloseTo(275.5);
  });
});

describe('projectDay', () => {
  const slots: DaySlotInput[] = [
    { kind: 'planned', status: 'confirmed', entries: [e(833, 132, 44, 14)] },
    { kind: 'planned', status: 'pending', entries: [e(294, 75, 3, 1)] },
    { kind: 'planned', status: 'pending', entries: [e(1100, 190, 60, 15)] },
    { kind: 'open', status: 'pending', entries: [] },
    { kind: 'planned', status: 'pending', entries: [e(600, 80, 30, 12)] },
  ];

  it('separates eaten from projected and derives the open-slot budget', () => {
    const p = projectDay(slots, targets);
    expect(p.consumed).toEqual({ kcal: 833, carbs_g: 132, protein_g: 44, fat_g: 14 });
    expect(p.projected.kcal).toBe(833 + 294 + 1100 + 600);
    expect(p.remaining).toEqual({ kcal: 1103, carbs_g: 193, protein_g: 27, fat_g: 24 });
    expect(p.openBudget).toEqual(p.remaining);
    expect(p.pendingSlots).toBe(3);
  });

  it('counts adjusted slots as eaten and ignores skipped ones', () => {
    const p = projectDay(
      [
        { kind: 'planned', status: 'adjusted', entries: [e(500, 60, 20, 10)] },
        { kind: 'planned', status: 'skipped', entries: [e(294, 75, 3, 1)] },
      ],
      targets,
    );
    expect(p.consumed.kcal).toBe(500);
    expect(p.projected.kcal).toBe(500);
    expect(p.pendingSlots).toBe(0);
    expect(p.openBudget).toBeNull();
  });

  it('counts ad hoc entries as eaten and closes the open budget once dinner is logged', () => {
    const logged = slots.map((s) => (s.kind === 'open' ? { ...s, entries: [e(900, 120, 50, 20, 'adhoc')] } : s));
    const p = projectDay(logged, targets);
    expect(p.consumed.kcal).toBe(833 + 900);
    expect(p.openBudget).toBeNull();
    expect(p.remaining.kcal).toBe(3930 - (833 + 294 + 1100 + 600 + 900));
  });

  it('shows a negative remainder when the day is projected over target', () => {
    const p = projectDay([{ kind: 'planned', status: 'confirmed', entries: [e(4200, 700, 170, 70)] }], targets);
    expect(p.remaining.kcal).toBe(-270);
  });
});
