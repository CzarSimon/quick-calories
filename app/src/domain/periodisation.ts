/**
 * Periodisation vocabulary. v1 only uses microcycles; mesocycles and macrocycles are
 * placeholders so they can be added later without renaming anything.
 */

import type { IsoDate } from '@/lib/types';

/** The planning unit (default 7 days, Monday-anchored). */
export type Microcycle = {
  startDate: IsoDate;
  length: number;
};

/** Future: a block of microcycles with a shared goal (e.g. a cut or a build). Not used in v1. */
export type Mesocycle = {
  name: string;
  startDate: IsoDate;
  endDate: IsoDate;
};

/** Future: a season-level plan made of mesocycles. Not used in v1. */
export type Macrocycle = {
  name: string;
  startDate: IsoDate;
  endDate: IsoDate;
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** True for a "YYYY-MM-DD" date that falls on a Monday. */
export function isMonday(date: IsoDate): boolean {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1;
}

/** Weekday names for a Monday-anchored 7-day microcycle, otherwise "Day 1" … "Day N". */
export function microcycleDayLabel(microcycle: Microcycle, dayIndex: number): string {
  if (microcycle.length === 7 && isMonday(microcycle.startDate)) return WEEKDAYS[dayIndex];
  return `Day ${dayIndex + 1}`;
}
