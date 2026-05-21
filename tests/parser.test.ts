import { describe, it, expect } from 'vitest';
import { parseProductosCsvLine } from '../src/ingesta/parser.js';

describe('parseProductosCsvLine', () => {
  it('parses una fila de Coto con campos esperados', () => {
    const line = '12|1|179|7790139101169|1|VINAGRE DE VINO FAVINCO BOT 500 ML|500|ml|FAVINCO|1873|3746|1|ltr||||';
    const row = parseProductosCsvLine(line);
    expect(row).toEqual({
      idComercio: 12, idBandera: 1, idSucursal: 179,
      idProducto: '7790139101169', productosEan: '1',
      descripcion: 'VINAGRE DE VINO FAVINCO BOT 500 ML',
      cantidadPresentacion: 500, unidadMedida: 'ml', marca: 'FAVINCO',
      precioLista: 1873, precioReferencia: 3746,
      cantidadReferencia: 1, unidadMedidaReferencia: 'ltr',
      precioPromo1: null, leyendaPromo1: null,
      precioPromo2: null, leyendaPromo2: null,
    });
  });
  it('parses una fila con promo activa', () => {
    const line = '12|1|179|2003831200005|1|YERBA TARAGUI 500G|500|grm|TARAGUI|16999|33998|1|kgm|12990|DEL 18/05/2026 AL 24/05/2026||';
    const row = parseProductosCsvLine(line);
    expect(row.precioPromo1).toBe(12990);
    expect(row.leyendaPromo1).toBe('DEL 18/05/2026 AL 24/05/2026');
  });
  it('limpia CR finales', () => {
    const line = '12|1|179|7790|1|X|500|ml|M|100|200|1|ltr||||\r';
    const row = parseProductosCsvLine(line);
    expect(row.leyendaPromo2).toBeNull();
  });
});
