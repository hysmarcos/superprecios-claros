import { describe, it, expect } from 'vitest';
import { provinciaToRegion } from '../src/ingesta/region-mapper.js';

describe('provinciaToRegion', () => {
  it('AR-C (CABA) → AMBA', () => expect(provinciaToRegion('AR-C')).toBe('AMBA'));
  it('AR-B (Buenos Aires) → CENTRO (gba se distingue por sucursal, default CENTRO)', () => {
    expect(provinciaToRegion('AR-B')).toBe('CENTRO');
  });
  it('AR-M (Mendoza) → CUYO', () => expect(provinciaToRegion('AR-M')).toBe('CUYO'));
  it('AR-N (Misiones) → NEA', () => expect(provinciaToRegion('AR-N')).toBe('NEA'));
  it('AR-T (Tucumán) → NOA', () => expect(provinciaToRegion('AR-T')).toBe('NOA'));
  it('AR-V (Tierra del Fuego) → PATAGONIA', () => expect(provinciaToRegion('AR-V')).toBe('PATAGONIA'));
  it('código desconocido → CENTRO (fallback conservador)', () => expect(provinciaToRegion('AR-XX')).toBe('CENTRO'));
});
