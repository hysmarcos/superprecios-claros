import type { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { REGIONES } from '../../db/schema.js';
import { ApiError } from '../../lib/errors.js';
import { setImmutableCache } from '../cache-headers.js';

const MAX_EANS = 50;
const QuerySchema = z.object({
  eans: z.string().min(1),
  region: z.enum(REGIONES).default('NACIONAL'),
  v: z.string().optional(),
});

export function registerSkus(app: Hono) {
  app.get('/v1/skus', async (c) => {
    const parsed = QuerySchema.safeParse({
      eans: c.req.query('eans'), region: c.req.query('region'), v: c.req.query('v'),
    });
    if (!parsed.success) throw new ApiError('INVALID_INPUT', parsed.error.message, 400);
    const eans = parsed.data.eans.split(',').map((s) => s.trim()).filter(Boolean);
    if (eans.length === 0) throw new ApiError('INVALID_INPUT', 'eans vacío', 400);
    if (eans.length > MAX_EANS) throw new ApiError('INVALID_INPUT', `max ${MAX_EANS} eans`, 400);
    if (eans.some((e) => !/^\d{8,14}$/.test(e))) throw new ApiError('INVALID_INPUT', 'EAN inválido', 400);

    const region = parsed.data.region;
    const q = await db.execute(sql`
      SELECT pa.ean, pa.cadena_id, pa.precio_efectivo, pa.delta_7d_pct,
             pa.is_min_historico, pa.promo_leyenda IS NOT NULL AS tiene_promo,
             p.nombre, p.marca, pa.fecha
        FROM precios_actuales pa
        JOIN productos p ON p.ean = pa.ean
       WHERE pa.ean IN (${sql.join(eans.map((e) => sql`${e}`), sql`, `)}) AND pa.region = ${region}
    `);

    type Row = { ean: string; cadena_id: number; precio_efectivo: string; delta_7d_pct: string|null;
                 is_min_historico: boolean; tiene_promo: boolean; nombre: string; marca: string|null; fecha: string };

    const itemsMap = new Map<string, { ean: string; producto: any; por_cadena: Record<string, any>; cadena_min: any; fecha: string }>();
    for (const r of q.rows as Row[]) {
      let item = itemsMap.get(r.ean);
      if (!item) {
        item = { ean: r.ean, producto: { nombre: r.nombre, marca: r.marca }, por_cadena: {}, cadena_min: null, fecha: r.fecha };
        itemsMap.set(r.ean, item);
      }
      const precio = Number(r.precio_efectivo);
      item.por_cadena[r.cadena_id] = {
        precio_efectivo: precio,
        delta_7d_pct: r.delta_7d_pct === null ? null : Number(r.delta_7d_pct),
        is_min_historico: r.is_min_historico,
        tiene_promo: r.tiene_promo,
      };
      if (!item.cadena_min || precio < item.cadena_min.precio) {
        item.cadena_min = { id: r.cadena_id, precio };
      }
    }

    const items = Array.from(itemsMap.values());
    const found = new Set(items.map((i) => i.ean));
    const missing = eans.filter((e) => !found.has(e));

    if (parsed.data.v) setImmutableCache(c, `${parsed.data.v}-${region}-${eans.join(',')}`);

    return c.json({ region, fecha: items[0]?.fecha ?? null, items, missing });
  });
}
