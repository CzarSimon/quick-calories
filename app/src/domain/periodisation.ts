/**
 * Periodisation vocabulary and date math. v1 only uses microcycles; mesocycles and macrocycles
 * are placeholders so they can be added later without renaming anything.
 *
 * Dates are local calendar dates as "YYYY-MM-DD" strings; the math below never touches time zones.
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
const MS_PER_DAY = 86_400_000;

function toUtc(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The local calendar date of a JS Date as "YYYY-MM-DD". */
export function toIsoDate(date: Date): IsoDate {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtc(toUtc(date) + days * MS_PER_DAY);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to) - toUtc(from)) / MS_PER_DAY);
}

/** True for a date that falls on a Monday. */
export function isMonday(date: IsoDate): boolean {
  return new Date(toUtc(date)).getUTCDay() === 1;
}

/** The microcycle containing `date`, given any anchor start date and a length. Works before the anchor too. */
export function microcycleFor(date: IsoDate, anchorDate: IsoDate, length: number): Microcycle & { dayIndex: number } {
  const offset = daysBetween(anchorDate, date);
  const dayIndex = ((offset % length) + length) % length;
  return { startDate: addDays(date, -dayIndex), length, dayIndex };
}

export function previousMicrocycle(microcycle: Microcycle): Microcycle {
  return { startDate: addDays(microcycle.startDate, -microcycle.length), length: microcycle.length };
}

export function nextMicrocycle(microcycle: Microcycle): Microcycle {
  return { startDate: addDays(microcycle.startDate, microcycle.length), length: microcycle.length };
}

/** Every date of a microcycle, in order. */
export function microcycleDates(microcycle: Microcycle): IsoDate[] {
  return Array.from({ length: microcycle.length }, (_, i) => addDays(microcycle.startDate, i));
}

/** Weekday names for a Monday-anchored 7-day microcycle, otherwise "Day 1" … "Day N". */
export function microcycleDayLabel(microcycle: Microcycle, dayIndex: number): string {
  if (microcycle.length === 7 && isMonday(microcycle.startDate)) return WEEKDAYS[dayIndex];
  return `Day ${dayIndex + 1}`;
}
