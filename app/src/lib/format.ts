/** Number parsing and formatting shared by forms and lists. */

import type { FoodUnit } from '@/lib/types';

/**
 * Parse what a person typed into a numeric field. Accepts a decimal comma (Swedish keyboards)
 * as well as a point. Returns null for empty or invalid input and for negative numbers.
 */
export function parseNumber(text: string): number | null {
  const cleaned = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Up to one decimal, without a trailing ".0". */
export function formatNumber(value: number): string {
  return String(Math.round(value * 10) / 10);
}

export function formatKcal(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

const UNIT_LABELS: Record<FoodUnit, [string, string]> = {
  g: ['g', 'g'],
  ml: ['ml', 'ml'],
  piece: ['piece', 'pieces'],
  slice: ['slice', 'slices'],
  serving: ['serving', 'servings'],
};

/** "120 g", "1 piece", "2 slices". */
export function formatAmount(quantity: number, unit: FoodUnit): string {
  const [one, many] = UNIT_LABELS[unit];
  return `${formatNumber(quantity)} ${quantity === 1 ? one : many}`;
}

/** Sensible reference amount when a unit is picked: per 100 g/ml, otherwise per 1. */
export function defaultRefAmount(unit: FoodUnit): number {
  return unit === 'g' || unit === 'ml' ? 100 : 1;
}

/** Step used by the quantity − / + buttons for a unit. */
export function quantityStep(unit: FoodUnit, refAmount: number): number {
  if (unit === 'g' || unit === 'ml') return refAmount >= 100 ? 10 : 5;
  return unit === 'serving' ? 0.5 : 1;
}
