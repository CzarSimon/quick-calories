/**
 * Colour tokens, matching docs/mockups/index.html. Carbs are the "fuel" accent.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#13202B',
    textSecondary: '#5A6A79',
    background: '#E9EDF1',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#F4F6F8',
    line: '#D5DCE3',
    carb: '#D9800F',
    carbSoft: '#F6DDB8',
    protein: '#237A86',
    proteinSoft: '#C3E3E7',
    fat: '#8E62A8',
    fatSoft: '#E3D4EC',
    ok: '#2C7D52',
    over: '#BE3B33',
    onAccent: '#1A1205',
  },
  dark: {
    text: '#E6ECF1',
    textSecondary: '#93A3B1',
    background: '#0D1318',
    backgroundElement: '#162029',
    backgroundSelected: '#1C2833',
    line: '#273541',
    carb: '#F0A040',
    carbSoft: '#4A3417',
    protein: '#52B5C1',
    proteinSoft: '#173B41',
    fat: '#B993CF',
    fatSoft: '#352841',
    ok: '#55B583',
    over: '#E96B62',
    onAccent: '#1A1205',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** The web build (development and UI tests only) floats its tab bar over the top of tab screens. */
export const TabScreenTopInset = Platform.OS === 'web' ? 56 : 0;
