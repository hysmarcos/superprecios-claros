import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

export interface ProductoRow {
  idComercio: number;
  idBandera: number;
  idSucursal: number;
  idProducto: string;
  productosEan: string;
  descripcion: string;
  cantidadPresentacion: number | null;
  unidadMedida: string | null;
  marca: string | null;
  precioLista: number;
  precioReferencia: number | null;
  cantidadReferencia: number | null;
  unidadMedidaReferencia: string | null;
  precioPromo1: number | null;
  leyendaPromo1: string | null;
  precioPromo2: number | null;
  leyendaPromo2: string | null;
}

export interface SucursalRow {
  idComercio: number;
  idBandera: number;
  idSucursal: number;
  provincia: string;  // formato 'AR-X'
}

const num = (s: string): number | null => {
  if (!s) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const str = (s: string): string | null => (s.length ? s : null);

export function parseProductosCsvLine(line: string): ProductoRow {
  const cleaned = line.replace(/\r$/, '');
  const f = cleaned.split('|');
  return {
    idComercio: Number(f[0]),
    idBandera: Number(f[1]),
    idSucursal: Number(f[2]),
    idProducto: f[3] ?? '',
    productosEan: f[4] ?? '',
    descripcion: f[5] ?? '',
    cantidadPresentacion: num(f[6] ?? ''),
    unidadMedida: str(f[7] ?? ''),
    marca: str(f[8] ?? ''),
    precioLista: num(f[9] ?? '') ?? 0,
    precioReferencia: num(f[10] ?? ''),
    cantidadReferencia: num(f[11] ?? ''),
    unidadMedidaReferencia: str(f[12] ?? ''),
    precioPromo1: num(f[13] ?? ''),
    leyendaPromo1: str(f[14] ?? ''),
    precioPromo2: num(f[15] ?? ''),
    leyendaPromo2: str(f[16] ?? ''),
  };
}

export function parseSucursalesCsvLine(line: string): SucursalRow {
  const cleaned = line.replace(/\r$/, '');
  const f = cleaned.split('|');
  return {
    idComercio: Number(f[0]),
    idBandera: Number(f[1]),
    idSucursal: Number(f[2]),
    provincia: (f[13] ?? '').trim(),  // sucursales_provincia
  };
}

export async function* streamProductos(path: string): AsyncGenerator<ProductoRow> {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let isHeader = true;
  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    if (!line.trim()) continue;
    if (line.startsWith('Ultim') || line.startsWith('Últim') || line.startsWith('Ãltim')) continue; // footers
    try {
      yield parseProductosCsvLine(line);
    } catch { /* skip malformed */ }
  }
}

export async function readSucursales(path: string): Promise<Map<number, SucursalRow>> {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  const out = new Map<number, SucursalRow>();
  let isHeader = true;
  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    if (!line.trim()) continue;
    if (line.startsWith('Ultim') || line.startsWith('Últim')) continue;
    try {
      const row = parseSucursalesCsvLine(line);
      out.set(row.idSucursal, row);
    } catch { /* skip */ }
  }
  return out;
}
