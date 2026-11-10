import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Nutrition } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { formatKcal, formatNumber } from '@/lib/format';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.backgroundElement, borderColor: colors.line }, style]}>{children}</View>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  compact?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, variant = 'secondary', disabled, busy, compact, testID, style }: ButtonProps) {
  const colors = useTheme();
  const primary = variant === 'primary';
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      testID={testID}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        primary
          ? { backgroundColor: colors.carb, borderColor: colors.carb }
          : { backgroundColor: colors.backgroundElement, borderColor: colors.line },
        { opacity: inactive ? 0.5 : pressed ? 0.75 : 1 },
        style,
      ]}>
      {busy ? (
        <ActivityIndicator color={primary ? colors.onAccent : colors.text} />
      ) : (
        <ThemedText type="smallBold" themeColor={primary ? 'onAccent' : variant === 'danger' ? 'over' : 'text'}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

type FieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  suffix?: string;
  error?: string | null;
  style?: StyleProp<ViewStyle>;
};

export function Field({ label, suffix, error, style, ...input }: FieldProps) {
  const colors = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, style]}>
      <ThemedText type="eyebrow">{label}</ThemedText>
      <View
        style={[
          styles.inputRow,
          { backgroundColor: colors.backgroundElement, borderColor: error ? colors.over : focused ? colors.carb : colors.line },
        ]}>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.textSecondary}
          {...input}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          style={[styles.input, { color: colors.text }]}
        />
        {suffix ? (
          <ThemedText type="small" themeColor="textSecondary">
            {suffix}
          </ThemedText>
        ) : null}
      </View>
      {error ? (
        <ThemedText type="small" themeColor="over">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

type SegmentedProps<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  const colors = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: colors.backgroundElement, borderColor: colors.line }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && { backgroundColor: colors.backgroundSelected }]}>
            <ThemedText type="smallBold" themeColor={selected ? 'text' : 'textSecondary'}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** "C 60 · P 13 · F 7" in the macro colours. */
export function MacroLine({ nutrition }: { nutrition: Nutrition }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.tabular}>
      <ThemedText type="smallBold" themeColor="carb">
        C {formatNumber(nutrition.carbs_g)}
      </ThemedText>
      {' · '}
      <ThemedText type="smallBold" themeColor="protein">
        P {formatNumber(nutrition.protein_g)}
      </ThemedText>
      {' · '}
      <ThemedText type="smallBold" themeColor="fat">
        F {formatNumber(nutrition.fat_g)}
      </ThemedText>
    </ThemedText>
  );
}

/** Kcal plus the three macros as a row of tiles. */
export function NutritionSummary({ nutrition, title }: { nutrition: Nutrition; title: string }) {
  const colors = useTheme();
  const tiles = [
    { label: 'Carbs', value: nutrition.carbs_g, color: 'carb' as const },
    { label: 'Protein', value: nutrition.protein_g, color: 'protein' as const },
    { label: 'Fat', value: nutrition.fat_g, color: 'fat' as const },
  ];
  return (
    <Card>
      <ThemedText type="eyebrow">{title}</ThemedText>
      <ThemedText type="title" style={styles.tabular}>
        {formatKcal(nutrition.kcal)}
        <ThemedText themeColor="textSecondary"> kcal</ThemedText>
      </ThemedText>
      <View style={styles.tiles}>
        {tiles.map((tile) => (
          <View key={tile.label} style={[styles.tile, { backgroundColor: colors.backgroundSelected }]}>
            <ThemedText type="small" themeColor={tile.color}>
              {tile.label}
            </ThemedText>
            <ThemedText type="subtitle" style={styles.tabular}>
              {formatNumber(tile.value)} g
            </ThemedText>
          </View>
        ))}
      </View>
    </Card>
  );
}

/** A destructive action that asks for confirmation in place (system alerts don't exist on every platform). */
export function ConfirmButton({
  label,
  confirmLabel,
  question,
  onConfirm,
  busy,
}: {
  label: string;
  confirmLabel: string;
  question: string;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <Button label={label} variant="danger" onPress={() => setAsking(true)} />;
  return (
    <Card>
      <ThemedText type="small">{question}</ThemedText>
      <View style={styles.confirmRow}>
        <Button label="Cancel" onPress={() => setAsking(false)} style={styles.grow} />
        <Button label={confirmLabel} variant="danger" busy={busy} onPress={onConfirm} style={styles.grow} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.three, gap: Spacing.two },
  button: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  buttonCompact: { paddingVertical: 8, minHeight: 36, paddingHorizontal: 12 },
  field: { gap: Spacing.one },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    gap: Spacing.two,
  },
  input: { flex: 1, minWidth: 0, paddingVertical: 12, fontSize: 16 },
  segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 3, gap: 2 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9 },
  tabular: { fontVariant: ['tabular-nums'] },
  tiles: { flexDirection: 'row', gap: Spacing.two },
  tile: { flex: 1, borderRadius: 10, paddingVertical: Spacing.two, paddingHorizontal: 10 },
  confirmRow: { flexDirection: 'row', gap: Spacing.two },
  grow: { flex: 1 },
});
