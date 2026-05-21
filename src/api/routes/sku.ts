import type { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { REGIONES } from '../../db/schema.js';
import { ApiError } from '../../lib/errors.js';
import { setImmutableCache } from '../cache-headers.js';

const QuerySchema = z.object({
  region: z.enum(REGIONES).default('NACIONAL'),
  v: z.string().optional(),
});

export function registerSku(app: Hono) {
  app.get('/v1/sku/:ean', async (c) => {
    const ean = c.req.param('ean');
    if (!/^\d{8,14}$/.test(ean)) throw new ApiError('INVALID_INPUT', 'EAN debe ser 8-14 dígitos', 400);
    const parsed = QuerySchema.safeParse({ region: c.req.query('region'), v: c.req.query('v') });
    if (!parsed.success) throw new ApiError('INVALID_INPUT', parsed.error.message, 400);
    const { region, v } = parsed.data;

    const productoQ = await db.execute(sql`
      SELECT ean, nombre, marca, cantidad_presentacion, unidad_medida
        FROM productos WHERE ean = ${ean} LIMIT 1
    `);
    const producto = productoQ.rows[0] as any;
    if (!producto) throw new ApiError('SKU_NOT_FOUND', `EAN ${ean} no encontrado`, 404);

    const preciosQ = await db.execute(sql`
      SELECT pa.cadena_id, c.nombre_display, c.grupo, c.url_logo, pa.fecha,
             pa.precio_lista, pa.precio_efectivo, pa.promo_leyenda, pa.promo_vigencia_fin,
             pa.min_90d, pa.min_90d_fecha, pa.delta_7d_pct, pa.is_min_historico
        FROM precios_actuales pa
        JOIN cadenas c ON c.id = pa.cadena_id
       WHERE pa.ean = ${ean} AND pa.region = ${region}
       ORDER BY pa.precio_efectivo ASC
    `);

    const historicoQ = await db.execute(sql`
      SELECT cadena_id, fecha, precio_lista, precio_efectivo, promo_leyenda
        FROM snapshots
       WHERE ean = ${ean} AND region = ${region}
       ORDER BY cadena_id, fecha ASC
    `);

    const historico: Record<string, Array<any>> = {};
    for (const r of historicoQ.rows as Array<any>) {
      const k = String(r.cadena_id);
      (historico[k] ||= []).push({
        fecha: r.fecha, precio_lista: Number(r.precio_lista),
        precio_efectivo: Number(r.precio_efectivo), promo: r.promo_leyenda,
      });
    }

    if (v) setImmutableCache(c, `${v}-${ean}-${region}`);

    return c.json({
      ean,
      producto: {
        nombre: producto.nombre, marca: producto.marca,
        cantidad: producto.cantidad_presentacion === null ? null : Number(producto.cantidad_presentacion),
        unidad: producto.unidad_medida,
      },
      region,
      fecha: (preciosQ.rows[0] as any)?.fecha ?? null,
      precios: (preciosQ.rows as Array<any>).map((r) => ({
        cadena: { id: r.cadena_id, nombre: r.nombre_display, grupo: r.grupo, logo_url: r.url_logo },
        precio_lista: Number(r.precio_lista),
        precio_efectivo: Number(r.precio_efectivo),
        promo: r.promo_leyenda ? { leyenda: r.promo_leyenda, vigencia_fin: r.promo_vigencia_fin } : null,
        min_90d: r.min_90d === null ? null : Number(r.min_90d),
        min_90d_fecha: r.min_90d_fecha,
        delta_7d_pct: r.delta_7d_pct === null ? null : Number(r.delta_7d_pct),
        is_min_historico: r.is_min_historico,
      })),
      historico,
    });
  });
}
