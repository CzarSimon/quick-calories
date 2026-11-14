import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useOnline } from '@/lib/connectivity';
import { macroKcalHint, quickEntryDraft, quickEntryMacroKcal, type EntryDraft, type QuickEntryInput } from '@/lib/daylog-model';
import { formatKcal, parseNumber } from '@/lib/format';
import { errorMessage, useSaveFood } from '@/lib/library';

/**
 * Log a dish by typing its calories and macros: a restaurant meal you will not eat again. The
 * item needs no library food. Saving it to the library is optional, as one serving.
 */
export function QuickEntryForm({ onAdd, onCancel }: { onAdd: (draft: EntryDraft) => void; onCancel: () => void }) {
  const colors = useTheme();
  const online = useOnline();
  const saveFood = useSaveFood();
  const [input, setInput] = useState<QuickEntryInput>({ name: '', kcal: '', carbs: '', protein: '', fat: '' });
  const [saveToLibrary, setSaveToLibrary] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const result = quickEntryDraft(input);
  const errors = showErrors && result.errors ? result.errors : {};
  const typedKcal = input.kcal.trim() === '' ? null : parseNumber(input.kcal);
  const fromMacros = quickEntryMacroKcal(input);
  // With kcal empty it is filled from the macros; only hint when a typed value looks off.
  const hint = typedKcal === null ? null : macroKcalHint(typedKcal, fromMacros);
  const set = (key: keyof QuickEntryInput) => (text: string) => setInput((current) => ({ ...current, [key]: text }));

  const add = async () => {
    setShowErrors(true);
    if (!result.draft) return;
    const draft = result.draft;
    if (!saveToLibrary) return onAdd(draft);
    const food = await saveFood
      .mutateAsync({
        input: { name: draft.name, unit: 'serving', ref_amount: 1, kcal: draft.kcal, carbs_g: draft.carbs_g, protein_g: draft.protein_g, fat_g: draft.fat_g },
      })
      .catch(() => null);
    if (food) onAdd({ ...draft, food: food.id });
  };

  return (
    <View style={styles.form}>
      <Field label="Name" value={input.name} onChangeText={set('name')} placeholder="Carbonara, Trattoria" error={errors.name} autoFocus testID="quick-name" />
      <Card>
        <ThemedText type="eyebrow">One portion</ThemedText>
        <Field
          label="Calories"
          suffix="kcal"
          keyboardType="decimal-pad"
          value={input.kcal}
          onChangeText={set('kcal')}
          placeholder={fromMacros !== null ? formatKcal(fromMacros) : ''}
          error={errors.kcal}
          testID="quick-kcal"
        />
        <View style={styles.macros}>
          <Field label="Carbs" suffix="g" keyboardType="decimal-pad" value={input.carbs} onChangeText={set('carbs')} placeholder="0" error={errors.carbs} style={styles.grow} testID="quick-carbs" />
          <Field label="Protein" suffix="g" keyboardType="decimal-pad" value={input.protein} onChangeText={set('protein')} placeholder="0" error={errors.protein} style={styles.grow} testID="quick-protein" />
          <Field label="Fat" suffix="g" keyboardType="decimal-pad" value={input.fat} onChangeText={set('fat')} placeholder="0" error={errors.fat} style={styles.grow} testID="quick-fat" />
        </View>
        {hint !== null ? (
          <View style={styles.hint}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.grow}>
              These macros add up to about {formatKcal(hint)} kcal.
            </ThemedText>
            <Button label={`Use ${formatKcal(hint)}`} compact onPress={() => set('kcal')(String(hint))} />
          </View>
        ) : null}
        {input.kcal.trim() === '' && fromMacros !== null ? (
          <ThemedText type="caption" themeColor="textSecondary">
            Left empty, calories are worked out from the macros.
          </ThemedText>
        ) : null}
      </Card>

      <View style={styles.toggle}>
        <View style={styles.grow}>
          <ThemedText type="defaultBold">Also save to my library</ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            {online ? 'As a food measured in servings, so you can log it again.' : 'Saving to the library needs a connection.'}
          </ThemedText>
        </View>
        <Switch
          accessibilityLabel="Also save to my library"
          value={saveToLibrary && online}
          disabled={!online}
          onValueChange={setSaveToLibrary}
          trackColor={{ true: colors.accent, false: colors.line }}
          testID="quick-save-library"
        />
      </View>

      {saveFood.error ? (
        <ThemedText type="small" themeColor="over">
          Not saved to the library. {errorMessage(saveFood.error)} You can also add it without saving it.
        </ThemedText>
      ) : null}

      <Button label="Add" variant="primary" busy={saveFood.isPending} onPress={add} testID="quick-add" />
      <Button label="Back to the library" variant="text" onPress={onCancel} style={styles.center} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.three },
  macros: { flexDirection: 'row', gap: Spacing.two },
  hint: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  grow: { flex: 1, minWidth: 0 },
  center: { alignSelf: 'center' },
});
