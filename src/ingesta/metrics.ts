import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { logger } from '../lib/logger.js';

export async function refreshMetrics(today: Date): Promise<void> {
  const todayIso = today.toISOString().slice(0, 10);
  const min90dCutoff = new Date(today.getTime() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const cutoff7d = new Date(today.getTime() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  // min_90d + min_90d_fecha + is_min_historico
  await db.execute(sql`
    WITH mins AS (
      SELECT ean, cadena_id, region,
             MIN(precio_efectivo) AS min_val,
             (ARRAY_AGG(fecha ORDER BY precio_efectivo ASC, fecha DESC))[1] AS min_fecha
      FROM (
        SELECT ean, cadena_id, region, fecha, precio_efectivo FROM snapshots
         WHERE fecha >= ${min90dCutoff}::date
        UNION ALL
        SELECT ean, cadena_id, region, fecha, precio_efectivo FROM precios_actuales
         WHERE fecha = ${todayIso}::date
      ) all_points
      GROUP BY ean, cadena_id, region
    )
    UPDATE precios_actuales pa
       SET min_90d = m.min_val,
           min_90d_fecha = m.min_fecha,
           is_min_historico = (pa.precio_efectivo <= m.min_val)
      FROM mins m
     WHERE pa.ean = m.ean AND pa.cadena_id = m.cadena_id AND pa.region = m.region
  `);

  // delta_7d_pct
  await db.execute(sql`
    WITH ref AS (
      SELECT DISTINCT ON (ean, cadena_id, region)
        ean, cadena_id, region, precio_efectivo AS p7d
      FROM snapshots
      WHERE fecha <= ${cutoff7d}::date
      ORDER BY ean, cadena_id, region, fecha DESC
    )
    UPDATE precios_actuales pa
       SET delta_7d_pct = CASE
             WHEN r.p7d IS NULL OR r.p7d = 0 THEN NULL
             ELSE ROUND(((pa.precio_efectivo - r.p7d) / r.p7d * 100)::numeric, 2)
           END
      FROM ref r
     WHERE pa.ean = r.ean AND pa.cadena_id = r.cadena_id AND pa.region = r.region
  `);

  logger.info('metrics refreshed (min_90d, delta_7d_pct, is_min_historico)');
}
