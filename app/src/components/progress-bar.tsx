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
};

/**
 * Eaten (solid) and projected (soft) against a target (the marker). The scale runs a little past
 * the target, or past the projection when that is higher, so going over stays visible.
 */
export function ProgressBar({ consumed, projected, target, color, softColor, height = 12 }: Props) {
  const colors = useTheme();
  const max = Math.max(target, projected, consumed, 1) * 1.08;
  const pct = (value: number) => `${Math.min(100, Math.max(0, (value / max) * 100))}%` as const;
  const over = projected > target && target > 0;

  return (
    <View style={[styles.track, { height, borderRadius: height / 2, backgroundColor: colors.backgroundSelected }]}>
      <View style={[styles.fill, { width: pct(projected), borderRadius: height / 2, backgroundColor: over ? colors.over : colors[softColor], opacity: over ? 0.45 : 1 }]} />
      <View style={[styles.fill, { width: pct(consumed), borderRadius: height / 2, backgroundColor: colors[color] }]} />
      {target > 0 ? <View style={[styles.marker, { left: pct(target), backgroundColor: colors.text }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  marker: { position: 'absolute', top: 0, bottom: 0, width: 2 },
});
