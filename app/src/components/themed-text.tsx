import { StyleSheet, Text, type TextProps } from 'react-native';

import { SerifFont, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextType =
  | 'display'
  | 'title'
  | 'subtitle'
  | 'default'
  | 'defaultBold'
  | 'small'
  | 'smallBold'
  | 'caption'
  | 'eyebrow';

export type ThemedTextProps = TextProps & {
  type?: TextType;
  themeColor?: ThemeColor;
  /** Tabular figures, so numbers line up and don't shift as they change. */
  tabular?: boolean;
};

/** The serif sizes are large already; let them grow with Dynamic Type, but not so far that they push actions off screen. */
const SERIF_MAX_SCALE = 1.3;

export function ThemedText({ style, type = 'default', themeColor, tabular, maxFontSizeMultiplier, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const color = theme[themeColor ?? (type === 'eyebrow' ? 'textSecondary' : 'text')];
  const serif = type === 'display' || type === 'title';
  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? (serif ? SERIF_MAX_SCALE : undefined)}
      style={[{ color }, styles[type], tabular && styles.tabular, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  display: { fontFamily: SerifFont, fontSize: 44, lineHeight: 50, fontWeight: '500', letterSpacing: -1 },
  title: { fontFamily: SerifFont, fontSize: 32, lineHeight: 38, fontWeight: '500', letterSpacing: -0.5 },
  subtitle: { fontSize: 20, lineHeight: 26, fontWeight: '600' },
  default: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  defaultBold: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  small: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  smallBold: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  tabular: { fontVariant: ['tabular-nums'] },
});
