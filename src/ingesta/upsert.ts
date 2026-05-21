import { sql } from 'drizzle-orm';
import { db, pool } from '../db/client.js';
import { preciosActuales, productos } from '../db/schema.js';
import type { Region } from '../db/schema.js';
import type { NormalizedPrice } from './median.js';
import { logger } from '../lib/logger.js';

export interface UpsertRow {
  ean: string;
  cadenaId: number;
  region: Region;
  fecha: Date;
  price: NormalizedPrice;
  // catálogo
  nombre: string;
  marca: string | null;
  cantidadPresentacion: number | null;
  unidadMedida: string | null;
}

const BATCH = 1000;

export async function upsertPrices(rows: UpsertRow[]): Promise<{ inserted: number; updated: number }> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };

  const todayIso = rows[0]!.fecha.toISOString().slice(0, 10);

  // 1) Upsert productos (catálogo) — uno por EAN único
  const productosByEan = new Map<string, UpsertRow>();
  for (const r of rows) if (!productosByEan.has(r.ean)) productosByEan.set(r.ean, r);
  const productosArr = Array.from(productosByEan.values());

  for (let i = 0; i < productosArr.length; i += BATCH) {
    const slice = productosArr.slice(i, i + BATCH);
    await db.insert(productos)
      .values(slice.map((r) => ({
        ean: r.ean, nombre: r.nombre, marca: r.marca,
        cantidadPresentacion: r.cantidadPresentacion?.toString() ?? null,
        unidadMedida: r.unidadMedida, firstSeen: todayIso, lastSeen: todayIso,
      })))
      .onConflictDoUpdate({
        target: productos.ean,
        set: {
          nombre: sql`EXCLUDED.nombre`,
          marca: sql`EXCLUDED.marca`,
          cantidadPresentacion: sql`EXCLUDED.cantidad_presentacion`,
          unidadMedida: sql`EXCLUDED.unidad_medida`,
          lastSeen: sql`EXCLUDED.last_seen`,
        },
      });
  }

  // 2) Upsert precios_actuales
  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const result = await db.execute(sql`
      INSERT INTO precios_actuales
        (ean, cadena_id, region, fecha, precio_lista, precio_efectivo,
         promo_leyenda, promo_vigencia_fin, sucursales_count)
      VALUES ${sql.join(
        slice.map((r) => sql`(
          ${r.ean}, ${r.cadenaId}, ${r.region}, ${todayIso},
          ${r.price.precioLista}, ${r.price.precioEfectivo},
          ${r.price.promoLeyenda}, ${r.price.promoVigenciaFin?.toISOString().slice(0,10) ?? null},
          ${r.price.sucursalesCount}
        )`),
        sql`, `
      )}
      ON CONFLICT (ean, cadena_id, region) DO UPDATE SET
        fecha = EXCLUDED.fecha,
        precio_lista = EXCLUDED.precio_lista,
        precio_efectivo = EXCLUDED.precio_efectivo,
        promo_leyenda = EXCLUDED.promo_leyenda,
        promo_vigencia_fin = EXCLUDED.promo_vigencia_fin,
        sucursales_count = EXCLUDED.sucursales_count
      RETURNING (xmax = 0) AS inserted
    `);
    const rowsAffected = result.rows as Array<{ inserted: boolean }>;
    for (const row of rowsAffected) row.inserted ? inserted++ : updated++;
  }

  logger.info({ inserted, updated, total: rows.length }, 'precios_actuales upsert done');
  return { inserted, updated };
}
