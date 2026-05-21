import { describe, it, expect } from 'vitest';
import { parsePromoVigencia, isPromoActive } from '../src/ingesta/promo-parser.js';

describe('parsePromoVigencia', () => {
  it('parsea "DEL 18/05/2026 AL 24/05/2026"', () => {
    expect(parsePromoVigencia('DEL 18/05/2026 AL 24/05/2026')).toEqual({
      from: new Date('2026-05-18T00:00:00Z'),
      to: new Date('2026-05-24T23:59:59Z'),
    });
  });
  it('vacío → null', () => expect(parsePromoVigencia('')).toBeNull());
  it('formato raro → null', () => expect(parsePromoVigencia('Combo Familiar')).toBeNull());
  it('case insensitive', () => {
    expect(parsePromoVigencia('del 01/01/2026 al 31/01/2026')).not.toBeNull();
  });
});

describe('isPromoActive', () => {
  it('fecha dentro del rango', () => {
    const r = parsePromoVigencia('DEL 18/05/2026 AL 24/05/2026')!;
    expect(isPromoActive(r, new Date('2026-05-20T12:00:00Z'))).toBe(true);
  });
  it('fecha fuera del rango', () => {
    const r = parsePromoVigencia('DEL 18/05/2026 AL 24/05/2026')!;
    expect(isPromoActive(r, new Date('2026-05-25T12:00:00Z'))).toBe(false);
  });
});
