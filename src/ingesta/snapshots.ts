import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { snapshots } from '../db/schema.js';
import { logger } from '../lib/logger.js';

export async function insertDeltaSnapshots(today: Date): Promise<number> {
  const todayIso = today.toISOString().slice(0, 10);

  // Insertar solo (ean, cadena, region) cuyo precio_efectivo de hoy difiere del último snapshot
  const result = await db.execute(sql`
    WITH ultimos AS (
      SELECT DISTINCT ON (ean, cadena_id, region)
        ean, cadena_id, region, precio_efectivo
      FROM snapshots
      WHERE fecha < ${todayIso}::date
      ORDER BY ean, cadena_id, region, fecha DESC
    )
    INSERT INTO snapshots (ean, cadena_id, region, fecha, tier, precio_lista, precio_efectivo, promo_leyenda)
    SELECT pa.ean, pa.cadena_id, pa.region, ${todayIso}::date, 'daily',
           pa.precio_lista, pa.precio_efectivo, pa.promo_leyenda
    FROM precios_actuales pa
    LEFT JOIN ultimos u
      ON u.ean = pa.ean AND u.cadena_id = pa.cadena_id AND u.region = pa.region
    WHERE pa.fecha = ${todayIso}::date
      AND (u.precio_efectivo IS NULL OR u.precio_efectivo <> pa.precio_efectivo)
    ON CONFLICT (ean, cadena_id, region, fecha) DO NOTHING
    RETURNING 1
  `);
  const count = result.rows.length;
  logger.info({ count }, 'delta snapshots inserted');
  return count;
}

export async function applyRetention(today: Date): Promise<{ deleted: number; promoted: number }> {
  const cutoffIso = new Date(today.getTime() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  // 1) Promover lunes a weekly antes de borrar (EXTRACT(DOW) = 1 → lunes)
  const promoted = await db.execute(sql`
    UPDATE snapshots
       SET tier = 'weekly'
     WHERE tier = 'daily'
       AND fecha < ${cutoffIso}::date
       AND EXTRACT(DOW FROM fecha) = 1
    RETURNING 1
  `);

  // 2) Borrar daily de fechas viejas que no sean lunes
  const deleted = await db.execute(sql`
    DELETE FROM snapshots
     WHERE tier = 'daily'
       AND fecha < ${cutoffIso}::date
       AND EXTRACT(DOW FROM fecha) <> 1
    RETURNING 1
  `);

  logger.info({ promoted: promoted.rows.length, deleted: deleted.rows.length }, 'retention done');
  return { promoted: promoted.rows.length, deleted: deleted.rows.length };
}
