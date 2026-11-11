/** The user's settings record (one per user) and the body weight used for macro derivation. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { currentUserId, pb } from '@/lib/pocketbase';
import type { MicrocycleRecord, SettingsRecord } from '@/lib/types';

export type SettingsValues = Omit<SettingsRecord, 'id' | 'user' | 'created' | 'updated'>;

/** Defaults from the PRD, used until the user saves their own. */
export const DEFAULT_SETTINGS: SettingsValues = {
  protein_target_gkg: 2.0,
  protein_floor_gkg: 1.6,
  fat_target_gkg: 0.8,
  fat_floor_gkg: 0.8,
  carb_floor_gkg: 4.0,
  max_daily_change_pct: 15,
  fallback_weight_kg: 0,
  microcycle_length_days: 7,
  microcycle_anchor_date: '2026-11-02', // a Monday
  nudge_evening_time: '21:00',
  nudge_morning_time: '08:00',
};

const SETTINGS_KEY = ['settings'] as const;
const LATEST_MICROCYCLE_KEY = ['microcycles', 'latest'] as const;

export function useSettings() {
  const query = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async () => (await pb.collection('settings').getList<SettingsRecord>(1, 1)).items[0] ?? null,
  });
  const record = query.data ?? null;
  return {
    settings: (record ?? DEFAULT_SETTINGS) as SettingsValues,
    record,
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: Partial<SettingsValues>) => {
      const existing = (await pb.collection('settings').getList<SettingsRecord>(1, 1)).items[0];
      return existing
        ? pb.collection('settings').update<SettingsRecord>(existing.id, values)
        : pb.collection('settings').create<SettingsRecord>({ ...DEFAULT_SETTINGS, ...values, user: currentUserId() });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

/**
 * Body weight for macro derivation: the weight locked on the latest microcycle, else the manual
 * fallback from settings. Null when neither exists yet. `source` says which one it is, in the
 * terms a new microcycle records it with.
 */
export function useBodyWeight(): { bwKg: number | null; source: 'previous' | 'manual' | null; isLoading: boolean } {
  const { settings, isLoading: settingsLoading } = useSettings();
  const latest = useQuery({
    queryKey: LATEST_MICROCYCLE_KEY,
    queryFn: async () =>
      (await pb.collection('microcycles').getList<MicrocycleRecord>(1, 1, { sort: '-start_date' })).items[0] ?? null,
  });
  const fromMicrocycle = latest.data?.bw_kg && latest.data.bw_kg > 0 ? latest.data.bw_kg : null;
  const fallback = settings.fallback_weight_kg > 0 ? settings.fallback_weight_kg : null;
  return {
    bwKg: fromMicrocycle ?? fallback,
    source: fromMicrocycle ? 'previous' : fallback ? 'manual' : null,
    isLoading: settingsLoading || latest.isLoading,
  };
}
