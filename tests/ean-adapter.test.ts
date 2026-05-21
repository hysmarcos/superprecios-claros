import { describe, it, expect } from 'vitest';
import { extractEan } from '../src/ingesta/ean-adapter.js';

describe('extractEan', () => {
  it('Coto pone EAN en idProducto y "1" en productosEan', () => {
    expect(extractEan({ idComercio: 12, idProducto: '7790139101169', productosEan: '1' } as any))
      .toBe('7790139101169');
  });
  it('Cencosud/Carrefour usan productosEan', () => {
    expect(extractEan({ idComercio: 9, idProducto: 'SKU-X', productosEan: '7790000000001' } as any))
      .toBe('7790000000001');
    expect(extractEan({ idComercio: 10, idProducto: 'X', productosEan: '7790000000002' } as any))
      .toBe('7790000000002');
  });
  it('rechaza EANs claramente inválidos (vacío, 0, 1)', () => {
    expect(extractEan({ idComercio: 15, idProducto: '', productosEan: '' } as any)).toBeNull();
    expect(extractEan({ idComercio: 15, idProducto: '0', productosEan: '0' } as any)).toBeNull();
    expect(extractEan({ idComercio: 15, idProducto: '1', productosEan: '1' } as any)).toBeNull();
  });
  it('acepta EAN-8 también (8 dígitos)', () => {
    expect(extractEan({ idComercio: 9, idProducto: 'X', productosEan: '12345678' } as any))
      .toBe('12345678');
  });
});
