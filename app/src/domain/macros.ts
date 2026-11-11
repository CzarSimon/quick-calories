/**
 * Macro derivation for a day (DESIGN.md §4).
 *
 * Kcal is the primary input. Protein and fat come from g/kg settings (or per-day overrides),
 * and carbs fill whatever energy is left.
 */

import type { MacroOverrides, MacroTargets, SettingsRecord } from '@/lib/types';

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

export type MacroSettings = Pick<
  SettingsRecord,
  'protein_target_gkg' | 'protein_floor_gkg' | 'fat_target_gkg' | 'fat_floor_gkg' | 'carb_floor_gkg'
>;

export type MacroFloors = { protein_g: number; fat_g: number; carbs_g: number };

export type DerivedMacros = {
  /** Planned intake. `kcal` is the entered target plus any imbalance. */
  targets: MacroTargets;
  /**
   * Macro energy minus the entered kcal target. Positive = surplus, negative = deficit.
   * 0 while carbs are derived and can absorb protein/fat changes.
   */
  imbalanceKcal: number;
  /** False when carbs were set by hand. */
  carbsDerived: boolean;
  /** Which macros sit below their floor (for warnings in the editor). */
  belowFloor: { protein: boolean; fat: boolean; carbs: boolean };
};

/** Energy of a set of macros using 4/4/9 kcal per gram. */
export function macroKcal(m: Pick<MacroTargets, 'protein_g' | 'fat_g' | 'carbs_g'>): number {
  return m.protein_g * KCAL_PER_G.protein + m.carbs_g * KCAL_PER_G.carbs + m.fat_g * KCAL_PER_G.fat;
}

/** Floors in whole grams for a body weight. */
export function macroFloors(bwKg: number, settings: MacroSettings): MacroFloors {
  return {
    protein_g: Math.round(settings.protein_floor_gkg * bwKg),
    fat_g: Math.round(settings.fat_floor_gkg * bwKg),
    carbs_g: Math.round(settings.carb_floor_gkg * bwKg),
  };
}

export function deriveMacros(
  kcal: number,
  bwKg: number,
  settings: MacroSettings,
  overrides?: MacroOverrides | null,
): DerivedMacros {
  const o = overrides ?? {};
  const protein_g = Math.round((o.protein_gkg ?? settings.protein_target_gkg) * bwKg);
  const fat_g = Math.round((o.fat_gkg ?? settings.fat_target_gkg) * bwKg);
  const fixedKcal = protein_g * KCAL_PER_G.protein + fat_g * KCAL_PER_G.fat;

  const carbsDerived = o.carbs_g == null;
  let carbs_g: number;
  let imbalanceKcal: number;
  if (carbsDerived) {
    const exact = (kcal - fixedKcal) / KCAL_PER_G.carbs;
    carbs_g = Math.max(0, Math.round(exact));
    // Carbs absorb the difference; gram rounding is ignored. Only when protein + fat alone
    // exceed the target is there a real surplus.
    imbalanceKcal = exact < 0 ? fixedKcal - kcal : 0;
  } else {
    carbs_g = Math.max(0, Math.round(o.carbs_g as number));
    imbalanceKcal = fixedKcal + carbs_g * KCAL_PER_G.carbs - kcal;
  }

  const floors = macroFloors(bwKg, settings);
  return {
    targets: { kcal: kcal + imbalanceKcal, protein_g, fat_g, carbs_g },
    imbalanceKcal,
    carbsDerived,
    belowFloor: {
      protein: protein_g < floors.protein_g,
      fat: fat_g < floors.fat_g,
      carbs: carbs_g < floors.carbs_g,
    },
  };
}

/** A day plan can be saved when its macros match the kcal target, or the difference was accepted. */
export function canSaveDayPlan(imbalanceKcal: number, acceptedImbalanceKcal: number): boolean {
  return imbalanceKcal === 0 || imbalanceKcal === acceptedImbalanceKcal;
}

/** Energy that can be removed from a day before fat and carbs hit their floors. Protein is never cut. */
export function cutCapacityKcal(targets: MacroTargets, floors: MacroFloors): number {
  return (
    Math.max(0, targets.fat_g - floors.fat_g) * KCAL_PER_G.fat +
    Math.max(0, targets.carbs_g - floors.carbs_g) * KCAL_PER_G.carbs
  );
}

/**
 * Add (positive) or remove (negative) energy from a day's targets.
 * - Removing: fat above its floor goes first, then carbs down to the carb floor. Protein is untouched.
 * - Adding: everything goes to carbs.
 * Returns the new targets and how much of the change could be applied.
 */
export function applyKcalChange(
  targets: MacroTargets,
  deltaKcal: number,
  floors: MacroFloors,
): { targets: MacroTargets; appliedKcal: number } {
  if (deltaKcal === 0) return { targets: { ...targets }, appliedKcal: 0 };

  if (deltaKcal > 0) {
    return {
      targets: {
        ...targets,
        kcal: targets.kcal + deltaKcal,
        carbs_g: targets.carbs_g + Math.round(deltaKcal / KCAL_PER_G.carbs),
      },
      appliedKcal: deltaKcal,
    };
  }

  const cut = Math.min(-deltaKcal, cutCapacityKcal(targets, floors));
  const fatCutG = Math.min(Math.max(0, targets.fat_g - floors.fat_g), Math.floor(cut / KCAL_PER_G.fat));
  const carbCutG = Math.min(
    Math.max(0, targets.carbs_g - floors.carbs_g),
    Math.round((cut - fatCutG * KCAL_PER_G.fat) / KCAL_PER_G.carbs),
  );
  return {
    targets: {
      kcal: targets.kcal - cut,
      protein_g: targets.protein_g,
      fat_g: targets.fat_g - fatCutG,
      carbs_g: targets.carbs_g - carbCutG,
    },
    appliedKcal: cut === 0 ? 0 : -cut,
  };
}
