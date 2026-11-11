import { describe, expect, it } from '@jest/globals';

import { defaultRefAmount, formatAmount, formatKcal, formatNumber, parseNumber, quantityStep } from '@/lib/format';

describe('parseNumber', () => {
  it('accepts points and decimal commas', () => {
    expect(parseNumber('120')).toBe(120);
    expect(parseNumber('1.5')).toBe(1.5);
    expect(parseNumber('1,5')).toBe(1.5);
    expect(parseNumber(' 2 500 ')).toBe(2500);
    expect(parseNumber('.5')).toBe(0.5);
    expect(parseNumber('3.')).toBe(3);
    expect(parseNumber('0')).toBe(0);
  });

  it('rejects empty, negative and malformed input', () => {
    for (const bad of ['', '  ', '-5', 'abc', '1,2,3', '1.2.3', '12g', ',']) expect(parseNumber(bad)).toBeNull();
  });
});

describe('formatting', () => {
  it('formats numbers, kcal and amounts', () => {
    expect(formatNumber(12)).toBe('12');
    expect(formatNumber(12.34)).toBe('12.3');
    expect(formatKcal(3499.6)).toBe('3,500');
    expect(formatAmount(120, 'g')).toBe('120 g');
    expect(formatAmount(1, 'piece')).toBe('1 piece');
    expect(formatAmount(2, 'slice')).toBe('2 slices');
    expect(formatAmount(0.5, 'serving')).toBe('0.5 servings');
  });

  it('picks reference amounts and steps per unit', () => {
    expect(defaultRefAmount('g')).toBe(100);
    expect(defaultRefAmount('piece')).toBe(1);
    expect(quantityStep('g', 100)).toBe(10);
    expect(quantityStep('g', 15)).toBe(5);
    expect(quantityStep('piece', 1)).toBe(1);
    expect(quantityStep('serving', 1)).toBe(0.5);
  });
});
