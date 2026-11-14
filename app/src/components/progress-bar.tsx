import { StyleSheet, View } from 'react-native';

import type { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  consumed: number;
  projected: number;
  target: number;
  color: ThemeColor;
  softColor: ThemeColor;
  height?: number;
  accessibilityLabel?: string;
};

/**
 * Eaten (solid) and still planned (soft) against a target (the marker). The scale runs a little
 * past the target, or past the projection when that is higher, so going over stays visible.
 * Going over is said in the text next to the bar, not with colour.
 */
export function ProgressBar({ consumed, projected, target, color, softColor, height = 8, accessibilityLabel }: Props) {
  const colors = useTheme();
  const max = Math.max(target, projected, consumed, 1) * 1.04;
  const pct = (value: number) => `${Math.min(100, Math.max(0, (value / max) * 100))}%` as const;

  return (
    <View
      style={[styles.wrap, { height: height + MARKER_OVERHANG * 2 }]}
      accessible={!!accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}>
      <View style={[styles.track, { height, borderRadius: height / 2, backgroundColor: colors.track }]}>
        <View style={[styles.fill, { width: pct(projected), backgroundColor: colors[softColor] }]} />
        <View style={[styles.fill, { width: pct(consumed), backgroundColor: colors[color] }]} />
      </View>
      {target > 0 ? <View style={[styles.marker, { left: pct(target), backgroundColor: colors.text }]} /> : null}
    </View>
  );
}

type SegmentedBarProps = { eaten: number; planned: number; target: number; accessibilityLabel: string; testID?: string };

/** The day's kcal: eaten, then still planned, then what is left, side by side. */
export function SegmentedBar({ eaten, planned, target, accessibilityLabel, testID }: SegmentedBarProps) {
  const colors = useTheme();
  const total = Math.max(target, eaten + planned, 1);
  const pct = (value: number) => `${Math.min(100, Math.max(0, (value / total) * 100))}%` as const;
  return (
    <View
      style={[styles.segmented, { backgroundColor: colors.track }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      testID={testID}>
      <View style={{ width: pct(eaten), backgroundColor: colors.text }} />
      <View style={{ width: pct(planned), backgroundColor: colors.planned }} />
    </View>
  );
}

const MARKER_OVERHANG = 3;

const styles = StyleSheet.create({
  wrap: { justifyContent: 'center' },
  track: { overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  marker: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, borderRadius: 1 },
  segmented: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden' },
});
