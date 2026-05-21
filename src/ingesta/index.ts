import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { jobRuns, cadenas, type Region } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { downloadDailySepaZip } from './sepa-client.js';
import { decompressDailyZip } from './decompress.js';
import { streamProductos, readSucursales } from './parser.js';
import { extractEan } from './ean-adapter.js';
import { provinciaToRegion } from './region-mapper.js';
import { normalizePricesPerGroup } from './median.js';
import { upsertPrices, type UpsertRow } from './upsert.js';
import { insertDeltaSnapshots, applyRetention } from './snapshots.js';
import { refreshMetrics } from './metrics.js';
import { join, dirname } from 'node:path';
import { rmSync } from 'node:fs';

export async function runIngesta(now: Date = new Date()): Promise<number> {
  const startedAt = new Date();
  const [runRow] = await db.insert(jobRuns)
    .values({ jobName: 'sepa_ingest', startedAt, status: 'running' })
    .returning({ id: jobRuns.id });
  const runId = runRow!.id;
  logger.info({ runId }, 'ingesta started');

  let rowsProcessed = 0, skusNew = 0, skusUpdated = 0;
  try {
    const dl = await downloadDailySepaZip(now);
    const workDir = join(dirname(dl.path), `work-${runId}`);
    const bundles = await decompressDailyZip(dl.path, workDir);
    logger.info({ count: bundles.length }, 'bundles ready');

    // map comercioId → list of cadenas (each row -> picks bandera from id_bandera)
    const cadenaRows = await db.select().from(cadenas);
    const cadenaByKey = new Map(cadenaRows.map((c) => [`${c.comercioId}-${c.banderaId}`, c.id]));

    for (const bundle of bundles) {
      const productosPath = join(bundle.csvDir, 'productos.csv');
      const sucursalesPath = join(bundle.csvDir, 'sucursales.csv');
      let sucursalIndex: Map<number, ReturnType<typeof provinciaToRegion>>;
      try {
        const sucMap = await readSucursales(sucursalesPath);
        sucursalIndex = new Map();
        for (const [id, s] of sucMap) sucursalIndex.set(id, provinciaToRegion(s.provincia));
      } catch (e) {
        logger.warn({ err: String(e), comercioId: bundle.comercioId }, 'sucursales.csv read failed, skip cadena');
        continue;
      }

      // group: key = `${cadenaId}-${region}-${ean}` → ProductoRow[]
      const groups = new Map<string, { rows: any[]; ean: string; cadenaId: number; region: Region; first: any }>();
      const groupsNacional = new Map<string, { rows: any[]; ean: string; cadenaId: number; first: any }>();
      let bundleRowCount = 0;
      for await (const row of streamProductos(productosPath)) {
        bundleRowCount++;
        const cadenaId = cadenaByKey.get(`${row.idComercio}-${row.idBandera}`);
        if (!cadenaId) continue;
        const ean = extractEan(row);
        if (!ean) continue;
        const region = sucursalIndex.get(row.idSucursal) ?? 'CENTRO';

        const k = `${cadenaId}-${region}-${ean}`;
        let g = groups.get(k);
        if (!g) { g = { rows: [], ean, cadenaId, region, first: row }; groups.set(k, g); }
        g.rows.push(row);

        const kn = `${cadenaId}-${ean}`;
        let gn = groupsNacional.get(kn);
        if (!gn) { gn = { rows: [], ean, cadenaId, first: row }; groupsNacional.set(kn, gn); }
        gn.rows.push(row);
      }
      rowsProcessed += bundleRowCount;
      logger.info({ comercioId: bundle.comercioId, bundleRowCount, groups: groups.size + groupsNacional.size }, 'bundle parsed');

      const upsertRows: UpsertRow[] = [];
      for (const g of groups.values()) {
        const norm = normalizePricesPerGroup(g.rows, now);
        if (!norm) continue;
        upsertRows.push({
          ean: g.ean, cadenaId: g.cadenaId, region: g.region, fecha: now, price: norm,
          nombre: g.first.descripcion, marca: g.first.marca,
          cantidadPresentacion: g.first.cantidadPresentacion, unidadMedida: g.first.unidadMedida,
        });
      }
      for (const g of groupsNacional.values()) {
        const norm = normalizePricesPerGroup(g.rows, now);
        if (!norm) continue;
        upsertRows.push({
          ean: g.ean, cadenaId: g.cadenaId, region: 'NACIONAL', fecha: now, price: norm,
          nombre: g.first.descripcion, marca: g.first.marca,
          cantidadPresentacion: g.first.cantidadPresentacion, unidadMedida: g.first.unidadMedida,
        });
      }
      const { inserted, updated } = await upsertPrices(upsertRows);
      skusNew += inserted;
      skusUpdated += updated;
    }

    const deltaCount = await insertDeltaSnapshots(now);
    await applyRetention(now);
    await refreshMetrics(now);

    // cleanup workdir
    try { rmSync(workDir, { recursive: true, force: true }); } catch {}

    await db.update(jobRuns).set({
      finishedAt: new Date(),
      status: 'success',
      rowsProcessed, skusNew, skusUpdated,
      metadata: { zipSizeMb: Math.round(dl.sizeBytes/1024/1024), bundles: bundles.length, deltaSnapshots: deltaCount },
    }).where(sql`id = ${runId}`);
    logger.info({ runId, rowsProcessed, skusNew, skusUpdated, deltaCount }, 'ingesta success');
    return runId;
  } catch (e) {
    await db.update(jobRuns).set({
      finishedAt: new Date(), status: 'failed',
      rowsProcessed, skusNew, skusUpdated, errorMessage: String(e),
    }).where(sql`id = ${runId}`);
    logger.error({ err: String(e) }, 'ingesta failed');
    throw e;
  }
}
