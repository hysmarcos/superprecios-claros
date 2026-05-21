import type { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { cadenas, REGIONES } from '../../db/schema.js';
import { setShortCache } from '../cache-headers.js';

export function registerManifest(app: Hono) {
  app.get('/v1/manifest', async (c) => {
    const lastRun = await db.execute(sql`
      SELECT finished_at FROM job_runs
       WHERE job_name = 'sepa_ingest' AND status = 'success'
       ORDER BY finished_at DESC LIMIT 1
    `);
    const lastRunRow = lastRun.rows[0] as { finished_at: string } | undefined;
    const lastIngestAt = lastRunRow?.finished_at ?? new Date(0).toISOString();
    const versionTag = lastIngestAt.slice(0, 10).replace(/-/g, '');

    const cadenaRows = await db.select().from(cadenas).where(sql`activa = true`);
    const skuCounts = await db.execute(sql`
      SELECT cadena_id, COUNT(DISTINCT ean)::int AS c
        FROM precios_actuales
       WHERE region = 'NACIONAL'
       GROUP BY cadena_id
    `);
    const countsByCadena = new Map<number, number>(
      (skuCounts.rows as Array<{ cadena_id: number; c: number }>).map((r) => [r.cadena_id, r.c])
    );
    const totalSkus = await db.execute(sql`SELECT COUNT(*)::int AS c FROM productos`);

    setShortCache(c);
    return c.json({
      schema_version: 1,
      last_ingest_at: lastIngestAt,
      version_tag: versionTag,
      regiones: REGIONES,
      cadenas: cadenaRows.map((cad) => ({
        id: cad.id, nombre: cad.nombreDisplay, grupo: cad.grupo,
        skus_count: countsByCadena.get(cad.id) ?? 0, logo_url: cad.urlLogo,
      })),
      total_skus: (totalSkus.rows[0] as any).c,
    });
  });
}
