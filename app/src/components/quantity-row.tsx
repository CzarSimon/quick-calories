import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, MacroLine } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { Nutrition } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { formatKcal, formatNumber, parseNumber } from '@/lib/format';

type Props = {
  name: string;
  nutrition: Nutrition;
  /** The quantity as typed. */
  quantity: string;
  unit: string;
  step: number;
  onChange: (quantity: string) => void;
  onRemove: () => void;
  /** Show the "enter a quantity" error when the value is not a number above 0. */
  showError: boolean;
};

/** One item in a meal or slot: name, nutrition, a typed or stepped quantity, and Remove. */
export function QuantityRow({ name, nutrition, quantity, unit, step, onChange, onRemove, showError }: Props) {
  const colors = useTheme();
  const parsed = parseNumber(quantity);
  const bad = showError && (parsed === null || parsed <= 0);
  const bump = (direction: 1 | -1) => onChange(formatNumber(Math.max(step, (parsed ?? 0) + direction * step)));

  return (
    <View style={[styles.item, { borderTopColor: colors.line }]}>
      <View style={styles.head}>
        <View style={styles.grow}>
          <ThemedText type="smallBold">{name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.tabular}>
            {formatKcal(nutrition.kcal)} kcal · <MacroLine nutrition={nutrition} />
          </ThemedText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${name}`} hitSlop={8} onPress={onRemove}>
          <ThemedText type="smallBold" themeColor="over">
            Remove
          </ThemedText>
        </Pressable>
      </View>
      <View style={styles.quantityRow}>
        <Button label="−" compact onPress={() => bump(-1)} style={styles.stepButton} />
        <View style={[styles.box, { borderColor: bad ? colors.over : colors.line, backgroundColor: colors.backgroundSelected }]}>
          <TextInput
            accessibilityLabel={`Quantity of ${name}`}
            value={quantity}
            onChangeText={onChange}
            keyboardType="decimal-pad"
            selectTextOnFocus
            style={[styles.input, { color: colors.text }]}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {unit}
          </ThemedText>
        </View>
        <Button label="+" compact onPress={() => bump(1)} style={styles.stepButton} />
      </View>
      {bad ? (
        <ThemedText type="small" themeColor="over">
          Enter a quantity above 0.
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  tabular: { fontVariant: ['tabular-nums'] },
  item: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two, gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stepButton: { width: 44 },
  box: { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, gap: Spacing.one },
  input: { flex: 1, minWidth: 0, paddingVertical: 8, fontSize: 16, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
