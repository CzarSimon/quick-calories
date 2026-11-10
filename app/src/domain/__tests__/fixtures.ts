import type { RedistributionSettings } from '@/domain';

/** Body weight and default settings used by the worked examples in docs/DESIGN.md §8. */
export const BW = 82;

export const SETTINGS: RedistributionSettings = {
  protein_target_gkg: 2.0,
  protein_floor_gkg: 1.6,
  fat_target_gkg: 0.8,
  fat_floor_gkg: 0.8,
  carb_floor_gkg: 4.0,
  max_daily_change_pct: 15,
};

/** Mon–Sun kcal targets of the Q4 training schedule. */
export const Q4_KCAL = [3500, 3950, 3600, 3800, 3300, 3100, 3100];

export const plan = (kcal: number, extra: Partial<{ adjustment_included: boolean; adjustment_custom_kcal: number }> = {}) => ({
  kcal,
  macro_overrides: null,
  adjustment_included: true,
  adjustment_custom_kcal: 0,
  ...extra,
});
