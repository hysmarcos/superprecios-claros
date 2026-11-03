import { join } from 'node:path';
import type { Region } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import type { InnerChainBundle } from './decompress.js';
import { streamProductos, readSucursales, type ProductoRow } from './parser.js';
import { extractEan } from './ean-adapter.js';
import { provinciaToRegion } from './region-mapper.js';
import { normalizePricesPerGroup, type NormalizedPrice } from './median.js';

/** Precio normalizado de un EAN en una cadena y región, más los datos de catálogo. */
export interface PriceRow {
  ean: string;
  cadenaId: number;
  region: Region;
  fecha: Date;
  price: NormalizedPrice;
  nombre: string;
  marca: string | null;
  cantidadPresentacion: number | null;
  unidadMedida: string | null;
}

interface Group { rows: ProductoRow[]; ean: string; cadenaId: number; region: Region; first: ProductoRow }

/**
 * Lee los CSV de una cadena y devuelve un precio por (EAN, cadena, región),
 * más la fila NACIONAL que junta todas las sucursales. No toca la base:
 * lo usan la ingesta a Postgres y el build estático.
 * Devuelve null si falta sucursales.csv.
 */
export async function aggregateBundle(
  bundle: InnerChainBundle,
  cadenaByKey: Map<string, number>,
  now: Date,
): Promise<{ rows: PriceRow[]; rowCount: number } | null> {
  const productosPath = join(bundle.csvDir, 'productos.csv');
  const sucursalesPath = join(bundle.csvDir, 'sucursales.csv');
  const sucursalIndex = new Map<number, Exclude<Region, 'NACIONAL'>>();
  try {
    const sucMap = await readSucursales(sucursalesPath);
    for (const [id, s] of sucMap) sucursalIndex.set(id, provinciaToRegion(s.provincia));
  } catch (e) {
    logger.warn({ err: String(e), comercioId: bundle.comercioId }, 'sucursales.csv read failed, skip cadena');
    return null;
  }

  // key = `${cadenaId}-${region}-${ean}`; NACIONAL se agrupa aparte con todas las sucursales
  const groups = new Map<string, Group>();
  const add = (k: string, row: ProductoRow, ean: string, cadenaId: number, region: Region) => {
    let g = groups.get(k);
    if (!g) { g = { rows: [], ean, cadenaId, region, first: row }; groups.set(k, g); }
    g.rows.push(row);
  };

  let rowCount = 0;
  for await (const row of streamProductos(productosPath)) {
    rowCount++;
    const cadenaId = cadenaByKey.get(`${row.idComercio}-${row.idBandera}`);
    if (!cadenaId) continue;
    const ean = extractEan(row);
    if (!ean) continue;
    const region = sucursalIndex.get(row.idSucursal) ?? 'CENTRO';
    add(`${cadenaId}-${region}-${ean}`, row, ean, cadenaId, region);
    add(`${cadenaId}-NACIONAL-${ean}`, row, ean, cadenaId, 'NACIONAL');
  }
  logger.info({ comercioId: bundle.comercioId, rowCount, groups: groups.size }, 'bundle parsed');

  const rows: PriceRow[] = [];
  for (const g of groups.values()) {
    const price = normalizePricesPerGroup(g.rows, now);
    if (!price) continue;
    rows.push({
      ean: g.ean, cadenaId: g.cadenaId, region: g.region, fecha: now, price,
      nombre: g.first.descripcion, marca: g.first.marca,
      cantidadPresentacion: g.first.cantidadPresentacion, unidadMedida: g.first.unidadMedida,
    });
  }
  return { rows, rowCount };
}
