import { describe, it, expect } from 'vitest';
import { median, normalizePricesPerGroup } from '../src/ingesta/median.js';

describe('median', () => {
  it('valores impares', () => expect(median([1, 3, 2])).toBe(2));
  it('valores pares (promedio de los dos medios)', () => expect(median([1, 2, 3, 4])).toBe(2.5));
  it('vacío → null', () => expect(median([])).toBeNull());
  it('un valor', () => expect(median([42])).toBe(42));
  it('robusto a outliers', () => expect(median([1, 1, 1, 1, 999999])).toBe(1));
});
