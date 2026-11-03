import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { jobRuns, cadenas } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { downloadDailySepaZip } from './sepa-client.js';
import { decompressDailyZip } from './decompress.js';
import { aggregateBundle } from './aggregate.js';
import { upsertPrices } from './upsert.js';
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
      const agg = await aggregateBundle(bundle, cadenaByKey, now);
      if (!agg) continue;
      rowsProcessed += agg.rowCount;
      const { inserted, updated } = await upsertPrices(agg.rows);
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
