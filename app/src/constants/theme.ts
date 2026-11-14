/**
 * Design tokens for the Fieldnotes direction (docs/plans/fieldnotes-and-unplanned.md §3.1).
 *
 * `accent` carries every action: buttons, links, focus, switches and the tab tint. The macro
 * colours (`carb`, `protein`, `fat`) mean only the macro and appear only in the detailed bars.
 * `over` is for errors and destructive actions; going over a target is said in words instead.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#243E31',
    textSecondary: '#5C665B',
    background: '#F8F6EF',
    backgroundElement: '#FFFDF8',
    backgroundSelected: '#E8EDDF',
    line: '#D8DCD0',
    track: '#E6E8DD',
    accent: '#2C5540',
    onAccent: '#FFFDF4',
    planned: '#7F9A74',
    carb: '#9B661F',
    carbSoft: '#E6D7B8',
    protein: '#2C5540',
    proteinSoft: '#C9D8C0',
    fat: '#866B91',
    fatSoft: '#DCD0E1',
    over: '#A8402F',
    warningSoft: '#F1E3C6',
  },
  dark: {
    text: '#F1F0E4',
    textSecondary: '#B2BEAC',
    background: '#17241D',
    backgroundElement: '#213126',
    backgroundSelected: '#2F4332',
    line: '#3B4C3D',
    track: '#2A3A2E',
    accent: '#BED4A6',
    onAccent: '#1C2A20',
    planned: '#7E9B76',
    carb: '#DFB269',
    carbSoft: '#6C5738',
    protein: '#BED4A6',
    proteinSoft: '#526947',
    fat: '#BCA1CA',
    fatSoft: '#64526B',
    over: '#F0907F',
    warningSoft: '#4A3F28',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type Palette = (typeof Colors)['light' | 'dark'];

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Side margin of every screen at standard phone width. */
export const ScreenMargin = 20;

export const Radius = {
  small: 8,
  medium: 12,
  large: 18,
} as const;

/** The iOS system serif (New York). React Native maps "ui-serif" to it; the web build falls back to Georgia. */
export const SerifFont = Platform.select({ ios: 'ui-serif', web: 'ui-serif, "New York", Georgia, serif', default: 'serif' });

/** The web build (development and UI tests only) floats its tab bar over the top of tab screens. */
export const TabScreenTopInset = Platform.OS === 'web' ? 56 : 0;
