import { StyleSheet, Text, type TextProps } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'subtitle' | 'small' | 'smallBold' | 'eyebrow';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const color = theme[themeColor ?? (type === 'eyebrow' ? 'textSecondary' : 'text')];
  return <Text style={[{ color }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  default: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  title: { fontSize: 32, lineHeight: 36, fontWeight: '700' },
  subtitle: { fontSize: 20, lineHeight: 26, fontWeight: '600' },
  small: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  smallBold: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
});
