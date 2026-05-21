import type { ProductoRow } from './parser.js';

const COTO_COMERCIO_ID = 12;
const EAN_RE = /^\d{8,14}$/;

function isValidEan(s: string): boolean {
  return EAN_RE.test(s) && s !== '0'.repeat(s.length) && Number(s) > 1;
}

export function extractEan(row: Pick<ProductoRow, 'idComercio' | 'idProducto' | 'productosEan'>): string | null {
  const primary = row.idComercio === COTO_COMERCIO_ID ? row.idProducto : row.productosEan;
  if (isValidEan(primary)) return primary;
  const fallback = row.idComercio === COTO_COMERCIO_ID ? row.productosEan : row.idProducto;
  if (isValidEan(fallback)) return fallback;
  return null;
}
