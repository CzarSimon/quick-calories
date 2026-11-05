/**
 * Record types mirroring pocketbase/pb_migrations. Keep in sync when the schema changes.
 */

export type IsoDate = string; // "YYYY-MM-DD", local date
export type ClockTime = string; // "HH:MM", local wall-clock time

export type BaseRecord = {
  id: string;
  user: string;
  created: string;
  updated: string;
};

export type Source = 'manual' | 'ai';
export type FoodUnit = 'g' | 'ml' | 'piece' | 'slice' | 'serving';
export type SlotKind = 'planned' | 'open';
export type SlotStatus = 'pending' | 'confirmed' | 'adjusted' | 'skipped';

export type MacroTargets = {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
};

export type SettingsRecord = BaseRecord & {
  protein_target_gkg: number;
  protein_floor_gkg: number;
  fat_target_gkg: number;
  fat_floor_gkg: number;
  carb_floor_gkg: number;
  max_daily_change_pct: number;
  fallback_weight_kg: number;
  microcycle_length_days: number;
  microcycle_anchor_date: IsoDate;
  nudge_evening_time: ClockTime;
  nudge_morning_time: ClockTime;
};

export type FoodRecord = BaseRecord & {
  name: string;
  ref_amount: number;
  unit: FoodUnit;
  kcal: number;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
  source: Source;
  archived: boolean;
};

export type MealRecord = BaseRecord & {
  name: string;
  notes: string;
  source: Source;
  archived: boolean;
};

export type MealItemRecord = BaseRecord & {
  meal: string;
  food: string;
  quantity: number;
  sort: number;
};

export type LabelRecord = BaseRecord & {
  name: string;
  color: string;
};

export type ScheduleRecord = BaseRecord & {
  name: string;
  labels: string[];
  is_active: boolean;
  adjustment_kcal: number;
  adjustment_mode: 'even' | 'custom';
};

/** A missing key means the value is derived (see DESIGN.md §4). */
export type MacroOverrides = {
  protein_gkg?: number;
  fat_gkg?: number;
  carbs_g?: number;
};

export type DayPlanRecord = BaseRecord & {
  schedule: string;
  day_index: number;
  kcal: number;
  macro_overrides: MacroOverrides | null;
  accepted_imbalance_kcal: number;
  adjustment_included: boolean;
  adjustment_custom_kcal: number;
};

export type PlanSlotRecord = BaseRecord & {
  day_plan: string;
  name: string;
  time: ClockTime;
  kind: SlotKind;
  notify: boolean;
  sort: number;
};

/** Exactly one of `food` / `meal` is set; the other is "". */
export type PlanSlotItemRecord = BaseRecord & {
  slot: string;
  food: string;
  meal: string;
  quantity: number;
  sort: number;
};

export type MicrocycleRecord = BaseRecord & {
  start_date: IsoDate;
  length: number;
  bw_kg: number;
  bw_source: 'healthkit' | 'previous' | 'manual' | '';
  cumulative_balance_kcal: number;
  unrecovered_kcal: number;
  closed: boolean;
};

export type DayLogRecord = BaseRecord & {
  date: IsoDate;
  microcycle: string;
  day_index: number;
  schedule: string;
  day_plan: string;
  base_targets: MacroTargets | null;
  targets: MacroTargets | null;
  closed: boolean;
};

export type LogSlotRecord = BaseRecord & {
  day_log: string;
  plan_slot: string;
  name: string;
  time: ClockTime;
  kind: SlotKind;
  status: SlotStatus;
  sort: number;
};

export type LogEntryRecord = BaseRecord & {
  log_slot: string;
  food: string;
  meal: string;
  name: string;
  quantity: number;
  kcal: number;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
  origin: 'planned' | 'adhoc';
  source: Source;
  sort: number;
};
