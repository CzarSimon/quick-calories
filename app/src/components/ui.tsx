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
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import type { Nutrition } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { formatKcal, formatNumber } from '@/lib/format';

/** A bounded surface. Used sparingly: for the current action and for forms, not to box every list. */
export function Card({ children, style, tone = 'element' }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'element' | 'selected' }) {
  const colors = useTheme();
  return (
    <View
      style={[
        styles.card,
        tone === 'selected' ? { backgroundColor: colors.backgroundSelected } : { backgroundColor: colors.backgroundElement, borderColor: colors.line, borderWidth: StyleSheet.hairlineWidth },
        style,
      ]}>
      {children}
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  /**
   * - primary: the one main action on a screen (filled, accent)
   * - secondary: a tonal button for other actions
   * - text: an accent-coloured label with no surface, for light actions next to other content
   * - danger: red label, for destructive actions
   */
  variant?: 'primary' | 'secondary' | 'text' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  compact?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, variant = 'secondary', disabled, busy, compact, testID, accessibilityLabel, style }: ButtonProps) {
  const colors = useTheme();
  const inactive = disabled || busy;
  const surface =
    variant === 'primary'
      ? { backgroundColor: colors.accent }
      : variant === 'secondary' || variant === 'danger'
        ? { backgroundColor: colors.backgroundSelected }
        : null;
  const labelColor: ThemeColor = variant === 'primary' ? 'onAccent' : variant === 'text' ? 'accent' : variant === 'danger' ? 'over' : 'text';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      testID={testID}
      disabled={inactive}
      onPress={onPress}
      hitSlop={variant === 'text' ? 4 : undefined}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        variant === 'text' && styles.buttonText,
        surface,
        { opacity: inactive ? 0.45 : pressed ? 0.7 : 1 },
        style,
      ]}>
      {busy ? (
        <ActivityIndicator color={colors[labelColor]} />
      ) : (
        <ThemedText type={compact || variant === 'text' ? 'smallBold' : 'defaultBold'} themeColor={labelColor}>
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
          { backgroundColor: colors.backgroundElement, borderColor: error ? colors.over : focused ? colors.accent : colors.line },
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
  /** "pill" for choices inside a form; "underline" for switching what a screen lists. */
  variant?: 'pill' | 'underline';
};

export function Segmented<T extends string>({ options, value, onChange, variant = 'pill' }: SegmentedProps<T>) {
  const colors = useTheme();
  const underline = variant === 'underline';
  return (
    <View
      accessibilityRole="tablist"
      style={underline ? [styles.underlineBar, { borderBottomColor: colors.line }] : [styles.segmented, { backgroundColor: colors.backgroundElement, borderColor: colors.line }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole={underline ? 'tab' : 'button'}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[
              underline ? styles.underlineSegment : styles.segment,
              underline
                ? { borderBottomColor: selected ? colors.text : 'transparent' }
                : selected && { backgroundColor: colors.backgroundSelected },
            ]}>
            <ThemedText type={selected ? 'smallBold' : 'small'} themeColor={selected ? 'text' : 'textSecondary'}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A small toggle: filled when selected. */
export function Chip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      testID={testID}
      onPress={onPress}
      style={[
        styles.chip,
        selected ? { backgroundColor: colors.accent, borderColor: colors.accent } : { backgroundColor: colors.backgroundElement, borderColor: colors.line },
      ]}>
      <ThemedText type="smallBold" themeColor={selected ? 'onAccent' : 'textSecondary'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** A tinted box for warnings and things that need a decision. */
export function Notice({ children, tone = 'warning' }: { children: ReactNode; tone?: 'warning' | 'info' }) {
  const colors = useTheme();
  return (
    <View style={[styles.notice, { backgroundColor: tone === 'warning' ? colors.warningSoft : colors.backgroundSelected }]}>{children}</View>
  );
}

/** "C 60 · P 13 · F 7", in neutral text. */
export function MacroLine({ nutrition }: { nutrition: Nutrition }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" tabular>
      C {formatNumber(nutrition.carbs_g)} · P {formatNumber(nutrition.protein_g)} · F {formatNumber(nutrition.fat_g)}
    </ThemedText>
  );
}

export type MacroColumn = { label: string; value: string; unit?: string };

/** Three labelled numbers side by side: "Carbs / 306 g left". */
export function MacroColumns({ columns, testID }: { columns: MacroColumn[]; testID?: string }) {
  return (
    <View style={styles.columns} testID={testID}>
      {columns.map((column) => (
        <View key={column.label} style={styles.column} accessible accessibilityLabel={`${column.label} ${column.value} ${column.unit ?? ''}`}>
          <ThemedText type="caption" themeColor="textSecondary">
            {column.label}
          </ThemedText>
          <ThemedText type="subtitle" tabular>
            {column.value}
            {column.unit ? (
              <ThemedText type="caption" themeColor="textSecondary">
                {' '}
                {column.unit}
              </ThemedText>
            ) : null}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

/** A total in kcal with the three macros underneath. */
export function NutritionSummary({ nutrition, title, testID }: { nutrition: Nutrition; title: string; testID?: string }) {
  return (
    <View style={styles.summary} testID={testID}>
      <ThemedText type="eyebrow">{title}</ThemedText>
      <ThemedText style={styles.figure} tabular>
        {formatKcal(nutrition.kcal)}
        <ThemedText themeColor="textSecondary"> kcal</ThemedText>
      </ThemedText>
      <MacroColumns
        columns={[
          { label: 'Carbs', value: formatNumber(nutrition.carbs_g), unit: 'g' },
          { label: 'Protein', value: formatNumber(nutrition.protein_g), unit: 'g' },
          { label: 'Fat', value: formatNumber(nutrition.fat_g), unit: 'g' },
        ]}
      />
    </View>
  );
}

/** A heading for a block of content, with an optional action or note on the right. */
export function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <ThemedText type="defaultBold" accessibilityRole="header" style={styles.grow}>
        {title}
      </ThemedText>
      {typeof right === 'string' ? (
        <ThemedText type="caption" themeColor="textSecondary">
          {right}
        </ThemedText>
      ) : (
        right
      )}
    </View>
  );
}

type ListRowProps = {
  title: string;
  subtitle?: string;
  /** A time or short label in the left margin. */
  leading?: string;
  /** A short state or value on the right. */
  trailing?: string;
  trailingColor?: ThemeColor;
  trailingBold?: boolean;
  /** Strike the title through (a skipped meal). */
  struck?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
  first?: boolean;
};

/** A flat row with a hairline under it. The whole row is one tap target. */
export function ListRow({ title, subtitle, leading, trailing, trailingColor, trailingBold, struck, onPress, accessibilityLabel, testID, first }: ListRowProps) {
  const colors = useTheme();
  const content = (
    <>
      {leading !== undefined ? (
        <ThemedText type="caption" themeColor="textSecondary" tabular style={styles.leading}>
          {leading}
        </ThemedText>
      ) : null}
      <View style={styles.grow}>
        <ThemedText type="defaultBold" style={struck ? styles.struck : undefined} numberOfLines={2}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="caption" themeColor="textSecondary" tabular numberOfLines={2}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {trailing ? (
        <ThemedText type={trailingBold ? 'smallBold' : 'caption'} themeColor={trailingColor ?? 'textSecondary'} tabular style={styles.trailing}>
          {trailing}
        </ThemedText>
      ) : null}
      {onPress ? (
        <ThemedText type="default" themeColor="textSecondary" accessible={false} importantForAccessibility="no">
          ›
        </ThemedText>
      ) : null}
    </>
  );
  const rowStyle = [styles.row, { borderBottomColor: colors.line }, first && { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth }];
  if (!onPress) {
    return (
      <View style={rowStyle} testID={testID} accessible accessibilityLabel={accessibilityLabel}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [rowStyle, pressed && { backgroundColor: colors.backgroundSelected }]}>
      {content}
    </Pressable>
  );
}

/** A row that shows or hides the content under it. */
export function Disclosure({ label, children, testID, initiallyOpen = false }: { label: string; children: ReactNode; testID?: string; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        testID={testID}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [styles.disclosure, { opacity: pressed ? 0.6 : 1 }]}>
        <ThemedText type="small" themeColor="textSecondary" accessible={false}>
          {open ? '▾' : '▸'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      </Pressable>
      {open ? <View style={styles.disclosureBody}>{children}</View> : null}
    </View>
  );
}

/** A destructive action that asks for confirmation in place (system alerts don't exist on every platform). */
export function ConfirmButton({
  label,
  confirmLabel,
  question,
  onConfirm,
  busy,
  variant = 'danger',
  testID,
}: {
  label: string;
  confirmLabel: string;
  question: string;
  onConfirm: () => void;
  busy?: boolean;
  variant?: 'danger' | 'text';
  testID?: string;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return variant === 'text' ? (
      <Pressable accessibilityRole="button" testID={testID} onPress={() => setAsking(true)} style={styles.textAction} hitSlop={4}>
        <ThemedText type="smallBold" themeColor="over">
          {label}
        </ThemedText>
      </Pressable>
    ) : (
      <Button label={label} variant="danger" testID={testID} onPress={() => setAsking(true)} />
    );
  }
  return (
    <Card>
      <ThemedText type="small">{question}</ThemedText>
      <View style={styles.confirmRow}>
        <Button label="Cancel" onPress={() => setAsking(false)} style={styles.grow} />
        <Button label={confirmLabel} variant="danger" busy={busy} onPress={onConfirm} testID={testID ? `${testID}-confirm` : undefined} style={styles.grow} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.large, padding: Spacing.three, gap: Spacing.two },
  button: {
    borderRadius: Radius.large,
    paddingVertical: 12,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonCompact: { paddingVertical: 8, minHeight: 44, paddingHorizontal: 14 },
  buttonText: { paddingHorizontal: Spacing.two, minHeight: 44, minWidth: 44, borderRadius: Radius.small },
  field: { gap: Spacing.one },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: 14,
    gap: Spacing.two,
  },
  // The focus border shows focus; the web build's own outline would draw a second box inside it.
  input: { flex: 1, minWidth: 0, paddingVertical: 12, fontSize: 16, outlineWidth: 0 },
  segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: Radius.medium, padding: 3, gap: 2 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 40, borderRadius: 9 },
  underlineBar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  underlineSegment: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderBottomWidth: 2 },
  columns: { flexDirection: 'row', gap: Spacing.two },
  column: { flex: 1, minWidth: 0 },
  summary: { gap: Spacing.two },
  figure: { fontSize: 34, lineHeight: 40, fontWeight: '600', letterSpacing: -0.5 },
  confirmRow: { flexDirection: 'row', gap: Spacing.two },
  grow: { flex: 1, minWidth: 0 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, minHeight: 36, justifyContent: 'center', minWidth: 48, alignItems: 'center' },
  notice: { borderRadius: Radius.medium, padding: 12, gap: Spacing.two },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 44 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  leading: { width: 44 },
  trailing: { textAlign: 'right', flexShrink: 0, maxWidth: '40%' },
  struck: { textDecorationLine: 'line-through' },
  disclosure: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 44 },
  disclosureBody: { gap: Spacing.three, paddingBottom: Spacing.two },
  textAction: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
