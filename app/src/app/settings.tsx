import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FormScreen } from '@/components/form-screen';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { formatNumber, normalizeTime, parseNumber } from '@/lib/format';
import { errorMessage } from '@/lib/library';
import { PB_URL } from '@/lib/pocketbase';
import { useSaveSettings, useSettings, type SettingsValues } from '@/lib/settings';

export default function SettingsScreen() {
  const { email, signOut } = useAuth();
  const { settings, record, isLoading } = useSettings();

  return (
    <FormScreen state={isLoading ? 'loading' : 'ready'}>
      <SettingsForm key={record?.id ?? 'defaults'} settings={settings} />
      <Card>
        <ThemedText type="eyebrow">Account</ThemedText>
        <ThemedText>{email ?? 'Signed in'}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Server: {PB_URL}
        </ThemedText>
        <Button label="Sign out" variant="danger" onPress={signOut} />
      </Card>
    </FormScreen>
  );
}

type NumberKey =
  | 'protein_target_gkg'
  | 'protein_floor_gkg'
  | 'fat_target_gkg'
  | 'fat_floor_gkg'
  | 'carb_floor_gkg'
  | 'max_daily_change_pct'
  | 'fallback_weight_kg';

function SettingsForm({ settings }: { settings: SettingsValues }) {
  const save = useSaveSettings();
  const [text, setText] = useState<Record<NumberKey, string>>({
    protein_target_gkg: formatNumber(settings.protein_target_gkg),
    protein_floor_gkg: formatNumber(settings.protein_floor_gkg),
    fat_target_gkg: formatNumber(settings.fat_target_gkg),
    fat_floor_gkg: formatNumber(settings.fat_floor_gkg),
    carb_floor_gkg: formatNumber(settings.carb_floor_gkg),
    max_daily_change_pct: formatNumber(settings.max_daily_change_pct),
    fallback_weight_kg: settings.fallback_weight_kg > 0 ? formatNumber(settings.fallback_weight_kg) : '',
  });
  const [evening, setEvening] = useState(settings.nudge_evening_time);
  const [morning, setMorning] = useState(settings.nudge_morning_time);
  const [showErrors, setShowErrors] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (key: NumberKey) => (value: string) => {
    setSaved(false);
    setText((current) => ({ ...current, [key]: value }));
  };
  const num = (key: NumberKey) => parseNumber(text[key]);

  const errors: Partial<Record<NumberKey | 'evening' | 'morning', string>> = {};
  for (const key of ['protein_target_gkg', 'fat_target_gkg'] as const) {
    const value = num(key);
    if (value === null || value <= 0) errors[key] = 'Enter a number above 0.';
  }
  for (const key of ['protein_floor_gkg', 'fat_floor_gkg', 'carb_floor_gkg'] as const) {
    if (num(key) === null) errors[key] = 'Enter a number (0 for no floor).';
  }
  if (!errors.protein_floor_gkg && !errors.protein_target_gkg && num('protein_floor_gkg')! > num('protein_target_gkg')!) {
    errors.protein_floor_gkg = 'The floor can’t be above the target.';
  }
  if (!errors.fat_floor_gkg && !errors.fat_target_gkg && num('fat_floor_gkg')! > num('fat_target_gkg')!) {
    errors.fat_floor_gkg = 'The floor can’t be above the target.';
  }
  const pct = num('max_daily_change_pct');
  if (pct === null || pct > 100) errors.max_daily_change_pct = 'Enter a percentage from 0 to 100.';
  if (text.fallback_weight_kg.trim() && !(num('fallback_weight_kg')! > 0)) errors.fallback_weight_kg = 'Enter your weight in kg, or leave it empty.';
  if (!normalizeTime(evening)) errors.evening = 'Enter a time like 21:00.';
  if (!normalizeTime(morning)) errors.morning = 'Enter a time like 08:00.';
  const valid = Object.keys(errors).length === 0;
  const shown = (key: keyof typeof errors) => (showErrors ? (errors[key] ?? null) : null);

  const submit = () => {
    setShowErrors(true);
    if (!valid) return;
    save.mutate(
      {
        protein_target_gkg: num('protein_target_gkg')!,
        protein_floor_gkg: num('protein_floor_gkg')!,
        fat_target_gkg: num('fat_target_gkg')!,
        fat_floor_gkg: num('fat_floor_gkg')!,
        carb_floor_gkg: num('carb_floor_gkg')!,
        max_daily_change_pct: pct!,
        fallback_weight_kg: num('fallback_weight_kg') ?? 0,
        nudge_evening_time: normalizeTime(evening)!,
        nudge_morning_time: normalizeTime(morning)!,
      },
      { onSuccess: () => setSaved(true) },
    );
  };

  const pair = (label: string, targetKey: NumberKey, floorKey: NumberKey) => (
    <View style={styles.row}>
      <Field label={`${label} target`} value={text[targetKey]} onChangeText={set(targetKey)} keyboardType="decimal-pad" suffix="g/kg" error={shown(targetKey)} style={styles.grow} />
      <Field label={`${label} floor`} value={text[floorKey]} onChangeText={set(floorKey)} keyboardType="decimal-pad" suffix="g/kg" error={shown(floorKey)} style={styles.grow} />
    </View>
  );

  return (
    <>
      <Card>
        <ThemedText type="eyebrow">Macros</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Per kg of body weight. Targets set a day’s protein and fat; carbs fill the remaining calories. Floors are the lowest a
          deficit or a correction may push a macro.
        </ThemedText>
        {pair('Protein', 'protein_target_gkg', 'protein_floor_gkg')}
        {pair('Fat', 'fat_target_gkg', 'fat_floor_gkg')}
        <Field label="Carb floor" value={text.carb_floor_gkg} onChangeText={set('carb_floor_gkg')} keyboardType="decimal-pad" suffix="g/kg" error={shown('carb_floor_gkg')} />
      </Card>

      <Card>
        <ThemedText type="eyebrow">Corrections</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          When you eat over or under, the remaining days adjust. No day changes by more than this share of its calories.
        </ThemedText>
        <Field label="Largest daily change" value={text.max_daily_change_pct} onChangeText={set('max_daily_change_pct')} keyboardType="decimal-pad" suffix="%" error={shown('max_daily_change_pct')} />
      </Card>

      <Card>
        <ThemedText type="eyebrow">Body weight</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Used until Apple Health provides a weekly average, and whenever a week has no weigh-ins.
        </ThemedText>
        <Field label="Fallback weight" value={text.fallback_weight_kg} onChangeText={set('fallback_weight_kg')} keyboardType="decimal-pad" suffix="kg" placeholder="82" error={shown('fallback_weight_kg')} />
      </Card>

      <Card>
        <ThemedText type="eyebrow">Reminders for unconfirmed meals</ThemedText>
        <View style={styles.row}>
          <Field label="Evening" value={evening} onChangeText={(v) => (setSaved(false), setEvening(v))} keyboardType="numbers-and-punctuation" error={shown('evening')} style={styles.grow} />
          <Field label="Next morning" value={morning} onChangeText={(v) => (setSaved(false), setMorning(v))} keyboardType="numbers-and-punctuation" error={shown('morning')} style={styles.grow} />
        </View>
      </Card>

      {save.error ? (
        <ThemedText type="small" themeColor="over">
          {errorMessage(save.error)}
        </ThemedText>
      ) : null}
      <Button label={saved ? 'Saved' : 'Save settings'} variant="primary" busy={save.isPending} onPress={submit} testID="settings-save" />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.two },
  grow: { flex: 1, minWidth: 0 },
});
