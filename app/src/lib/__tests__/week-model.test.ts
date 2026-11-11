import { describe, expect, it } from '@jest/globals';

import { buildBaseTargets, dayOutcome, type DaySlotInput } from '@/domain';
import type { LoggedSlot } from '@/lib/daylog-model';
import { summarizeMicrocycle, targetForNewDay, type WeekDayLog, type WeekInput } from '@/lib/week-model';
import type { DayLogRecord, MacroTargets, SlotKind, SlotStatus } from '@/lib/types';

const BW = 82;
const SETTINGS = { protein_target_gkg: 2, protein_floor_gkg: 1.6, fat_target_gkg: 0.8, fat_floor_gkg: 0.8, carb_floor_gkg: 4, max_daily_change_pct: 15 };
const KCAL = [3500, 3950, 3600, 3800, 3300, 3100, 3100];
const planBase = buildBaseTargets(
  KCAL.map((kcal) => ({ kcal, macro_overrides: null, adjustment_included: true, adjustment_custom_kcal: 0 })),
  { adjustment_kcal: 0, adjustment_mode: 'even' },
  BW,
  SETTINGS,
).days.map((d) => d.base);

const base = { user: 'u', created: '', updated: '' };
const slot = (kind: SlotKind, status: SlotStatus, kcals: number[], origin: 'planned' | 'adhoc' = 'planned'): LoggedSlot =>
  ({ ...base, id: '', day_log: '', plan_slot: '', name: '', time: '12:00', kind, status, sort: 0, entries: kcals.map((kcal) => ({ kcal, carbs_g: 0, protein_g: 0, fat_g: 0, origin })) }) as unknown as LoggedSlot;

// Monday 2 Nov 2026 is day 0.
const date = (i: number) => `2026-11-0${2 + i}`;
const log = (i: number, slots: LoggedSlot[], targets: MacroTargets = planBase[i]): WeekDayLog => ({
  dayLog: { ...base, id: `d${i}`, date: date(i), microcycle: 'm', day_index: i, schedule: 's', day_plan: 'p', base_targets: planBase[i], targets, closed: false } as DayLogRecord,
  slots,
});
/** A complete day that ended at `kcal`. */
const ate = (i: number, kcal: number, targets?: MacroTargets) => log(i, [slot('planned', 'confirmed', [kcal])], targets);

const input = (todayIndex: number, logs: WeekDayLog[], extra: Partial<WeekInput> = {}): WeekInput => ({
  microcycle: { startDate: '2026-11-02', length: 7 },
  today: date(todayIndex),
  logs,
  planBase,
  bwKg: BW,
  settings: SETTINGS,
  ...extra,
});
const kcals = (s: ReturnType<typeof summarizeMicrocycle>) => s.days.map((d) => d.target?.kcal);

describe('dayOutcome', () => {
  it('counts unconfirmed planned meals as expected, and flags an empty open slot', () => {
    const slots: DaySlotInput[] = [
      slot('planned', 'confirmed', [800]),
      slot('planned', 'pending', [700]),
      slot('planned', 'skipped', [300]),
      slot('open', 'pending', []),
    ];
    expect(dayOutcome(slots)).toEqual({ eatenKcal: 800, expectedKcal: 1500, complete: false, unconfirmed: 1 });
    expect(dayOutcome([...slots.slice(0, 3), slot('open', 'confirmed', [900], 'adhoc')])).toEqual({ eatenKcal: 1700, expectedKcal: 2400, complete: true, unconfirmed: 1 });
    expect(dayOutcome([slot('open', 'skipped', [])]).complete).toBe(true);
  });
});

describe('summarizeMicrocycle', () => {
  it('shows the plan untouched at the start of the microcycle', () => {
    const s = summarizeMicrocycle(input(0, []));
    expect(kcals(s)).toEqual(KCAL);
    expect(s).toMatchObject({ goalKcal: 24350, balanceKcal: 0, unrecoveredKcal: 0, uncountedDays: 0 });
    expect(s.days.map((d) => d.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(s.days.map((d) => d.when)).toEqual(['today', 'future', 'future', 'future', 'future', 'future', 'future']);
  });

  it('spreads Monday +120 over Tuesday to Sunday when Tuesday has no log yet', () => {
    const s = summarizeMicrocycle(input(1, [ate(0, 3620)]));
    expect(s.balanceKcal).toBe(120);
    expect(kcals(s)).toEqual([3500, 3930, 3580, 3780, 3280, 3080, 3080]);
    expect(s.unrecoveredKcal).toBe(0);
  });

  it('keeps today fixed once it has a log and carries today\'s expected result forward', () => {
    // Tuesday was created at 3,930 and is on course to end exactly there: Wed–Sun keep −20 each.
    const tuesday = log(1, [slot('planned', 'confirmed', [2000]), slot('planned', 'pending', [1930])], { ...planBase[1], kcal: 3930 });
    const s = summarizeMicrocycle(input(1, [ate(0, 3620), tuesday]));
    expect(s.todayDeltaKcal).toBe(-20);
    expect(kcals(s)).toEqual([3500, 3930, 3580, 3780, 3280, 3080, 3080]);
  });

  it('assumes an empty open slot today ends on target', () => {
    const tuesday = log(1, [slot('planned', 'confirmed', [1500]), slot('open', 'pending', [])], { ...planBase[1], kcal: 3930 });
    const s = summarizeMicrocycle(input(1, [ate(0, 3620), tuesday]));
    expect(s.days[1]).toMatchObject({ eatenKcal: 1500, expectedKcal: 1500, complete: false });
    expect(s.todayDeltaKcal).toBe(-20);
    expect(kcals(s).slice(2)).toEqual([3580, 3780, 3280, 3080, 3080]);
  });

  it('moves tomorrow when today is projected over target', () => {
    const tuesday = log(1, [slot('planned', 'confirmed', [4130])]);
    const s = summarizeMicrocycle(input(1, [ate(0, 3500), tuesday]));
    expect(s.todayDeltaKcal).toBe(180);
    expect(s.days.slice(2).reduce((sum, d) => sum + d.target!.kcal - d.base!.kcal, 0)).toBe(-180);
  });

  it('leaves incomplete and unlogged days out of the balance instead of counting them as zero', () => {
    const incomplete = log(1, [slot('planned', 'confirmed', [1200]), slot('open', 'pending', [])]);
    const s = summarizeMicrocycle(input(3, [ate(0, 3620), incomplete]));
    expect(s.balanceKcal).toBe(120);
    expect(s.uncountedDays).toBe(2); // Tuesday incomplete, Wednesday never logged
    expect(s.days[1]).toMatchObject({ counted: false, logged: true });
    expect(s.days[2]).toMatchObject({ counted: false, logged: false, eatenKcal: null });
  });

  it('counts unconfirmed planned meals of an earlier day as eaten', () => {
    const tuesday = log(1, [slot('planned', 'confirmed', [2000]), slot('planned', 'pending', [1950])]);
    const s = summarizeMicrocycle(input(2, [ate(0, 3500), tuesday]));
    expect(s.days[1]).toMatchObject({ counted: true, unconfirmed: 1, eatenKcal: 2000, expectedKcal: 3950 });
    expect(s.balanceKcal).toBe(0);
  });

  it('measures the balance against base targets, so a corrected day eaten to target settles it', () => {
    // Mon +120; Tue eaten at its corrected 3,930 (base 3,950): balance is 100, not 120.
    const s = summarizeMicrocycle(input(2, [ate(0, 3620), ate(1, 3930, { ...planBase[1], kcal: 3930 })]));
    expect(s.balanceKcal).toBe(100);
    expect(kcals(s).slice(2)).toEqual([3580, 3780, 3280, 3080, 3080]);
  });

  it('reports what the remaining days cannot absorb (worked example: Saturday +800)', () => {
    const logs = [0, 1, 2, 3, 4].map((i) => ate(i, KCAL[i]));
    const s = summarizeMicrocycle(input(6, [...logs, ate(5, 3900)]));
    expect(s.balanceKcal).toBe(800);
    expect(s.days[6].target).toEqual({ kcal: 2640, protein_g: 164, fat_g: 66, carbs_g: 348 });
    expect(s.unrecoveredKcal).toBe(340);
  });

  it('gives a finished microcycle its final balance', () => {
    const logs = KCAL.map((k, i) => ate(i, i === 6 ? k + 250 : k));
    const s = summarizeMicrocycle(input(0, logs, { today: '2026-11-12' }));
    expect(s.days.every((d) => d.when === 'past')).toBe(true);
    expect(s).toMatchObject({ balanceKcal: 250, unrecoveredKcal: 250, todayDeltaKcal: 0 });
  });

  it('adds an undershoot back to the remaining days', () => {
    const s = summarizeMicrocycle(input(5, [0, 1, 2, 3].map((i) => ate(i, KCAL[i])).concat(ate(4, 2900))));
    expect(s.balanceKcal).toBe(-400);
    expect(kcals(s).slice(5)).toEqual([3300, 3300]);
  });

  it('keeps targets at base without a body weight or a plan', () => {
    const noWeight = summarizeMicrocycle(input(1, [ate(0, 3620)], { bwKg: null }));
    expect(kcals(noWeight)).toEqual(KCAL);
    expect(noWeight.unrecoveredKcal).toBe(120);
    const noPlan = summarizeMicrocycle(input(1, [ate(0, 3620)], { planBase: KCAL.map(() => null) }));
    expect(noPlan.goalKcal).toBeNull();
    expect(noPlan.days[2].target).toBeNull();
  });
});

describe('targetForNewDay', () => {
  it('is the base corrected for the balance so far', () => {
    expect(targetForNewDay(input(1, [ate(0, 3620)]))?.kcal).toBe(3930);
    expect(targetForNewDay(input(0, []))).toEqual(planBase[0]);
  });

  it('ignores a log that already exists for today', () => {
    expect(targetForNewDay(input(1, [ate(0, 3620), ate(1, 100)]))?.kcal).toBe(3930);
  });
});
