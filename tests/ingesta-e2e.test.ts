import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, pool } from '../src/db/client.js';
import { sql } from 'drizzle-orm';
import { decompressDailyZip } from '../src/ingesta/decompress.js';
import { readSucursales, streamProductos, type ProductoRow } from '../src/ingesta/parser.js';
import { extractEan } from '../src/ingesta/ean-adapter.js';
import { normalizePricesPerGroup } from '../src/ingesta/median.js';
import { upsertPrices, type UpsertRow } from '../src/ingesta/upsert.js';
import { refreshMetrics } from '../src/ingesta/metrics.js';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('ingesta E2E sobre fixture', () => {
  beforeAll(async () => {
    // limpiar tablas en orden FK-safe
    await db.execute(sql`TRUNCATE precios_actuales, snapshots, productos RESTART IDENTITY CASCADE`);
  });
  afterAll(async () => {
    await pool.end();
  });

  it('ingiere fixture Coto y produce filas en precios_actuales', async () => {
    const fixture = join(__dirname, 'fixtures', 'sepa-coto-mini.zip');
    const workDir = mkdtempSync(join(tmpdir(), 'sepa-test-'));

    const bundles = await decompressDailyZip(fixture, workDir);
    expect(bundles.length).toBeGreaterThan(0);

    const bundle = bundles[0]!;
    expect(bundle.comercioId).toBe(12); // Coto

    // No usamos sucursales en este test (regionalización por sucursal queda para T16),
    // pero verificamos que el parser corre sin romper.
    const sucMap = await readSucursales(join(bundle.csvDir, 'sucursales.csv'));
    expect(sucMap.size).toBeGreaterThan(0);

    const today = new Date();

    const groups = new Map<string, { rows: ProductoRow[]; ean: string; first: ProductoRow }>();
    for await (const row of streamProductos(join(bundle.csvDir, 'productos.csv'))) {
      const ean = extractEan(row);
      if (!ean) continue;
      let g = groups.get(ean);
      if (!g) {
        g = { rows: [], ean, first: row };
        groups.set(ean, g);
      }
      g.rows.push(row);
    }
    expect(groups.size).toBeGreaterThan(50);

    const upsertRows: UpsertRow[] = [];
    for (const g of groups.values()) {
      const norm = normalizePricesPerGroup(g.rows, today);
      if (!norm) continue;
      upsertRows.push({
        ean: g.ean,
        cadenaId: 1, // Coto, seed-order
        region: 'NACIONAL',
        fecha: today,
        price: norm,
        nombre: g.first.descripcion,
        marca: g.first.marca,
        cantidadPresentacion: g.first.cantidadPresentacion,
        unidadMedida: g.first.unidadMedida,
      });
    }
    await upsertPrices(upsertRows);
    await refreshMetrics(today);

    const count = await db.execute(sql`SELECT COUNT(*)::int AS c FROM precios_actuales`);
    const c = (count.rows[0] as { c: number }).c;
    expect(c).toBeGreaterThan(50);
  }, 60000);
});
