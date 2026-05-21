import type { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { REGIONES } from '../../db/schema.js';
import { ApiError } from '../../lib/errors.js';
import { setNoCache } from '../cache-headers.js';

const BodySchema = z.object({
  eans: z.array(z.string().regex(/^\d{8,14}$/)).min(1).max(200),
  region: z.enum(REGIONES).default('NACIONAL'),
});

export function registerBasket(app: Hono) {
  app.post('/v1/basket', async (c) => {
    let body: unknown;
    try { body = await c.req.json(); } catch { throw new ApiError('INVALID_INPUT', 'JSON inválido', 400); }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new ApiError('INVALID_INPUT', parsed.error.message, 400);
    const { eans, region } = parsed.data;

    const q = await db.execute(sql`
      SELECT c.id AS cadena_id, c.nombre_display AS cadena, c.grupo,
             SUM(pa.precio_efectivo)::numeric AS total,
             COUNT(*)::int AS skus_disponibles
        FROM precios_actuales pa
        JOIN cadenas c ON c.id = pa.cadena_id
       WHERE pa.ean IN (${sql.join(eans.map((e) => sql`${e}`), sql`, `)}) AND pa.region = ${region}
       GROUP BY c.id, c.nombre_display, c.grupo
       ORDER BY total ASC
    `);

    const totales = (q.rows as Array<any>).map((r) => ({
      cadena_id: r.cadena_id, cadena: r.cadena, grupo: r.grupo,
      total: Number(r.total), skus_disponibles: r.skus_disponibles,
      skus_faltantes: eans.length - r.skus_disponibles,
    }));

    const cobertura = totales.filter((t) => t.skus_faltantes === 0);
    const cadenaMin = totales[0] ?? null;
    let stats: any = null;
    if (cadenaMin && cobertura.length > 0) {
      const promedio = cobertura.reduce((s, t) => s + t.total, 0) / cobertura.length;
      const maxTotal = Math.max(...cobertura.map((t) => t.total));
      stats = {
        cadena_id: cadenaMin.cadena_id,
        ahorro_pct_vs_promedio: Math.round((1 - cadenaMin.total / promedio) * 1000) / 10,
        ahorro_abs_vs_mas_cara: Math.round((maxTotal - cadenaMin.total) * 100) / 100,
      };
    }

    setNoCache(c);
    return c.json({
      fecha: new Date().toISOString().slice(0, 10),
      region, totales,
      cadena_mas_barata: stats,
    });
  });
}
