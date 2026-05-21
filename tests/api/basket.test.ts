import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../src/api/server.js';
import { registerBasket } from '../../src/api/routes/basket.js';
import { pool, db } from '../../src/db/client.js';
import { productos, preciosActuales } from '../../src/db/schema.js';
import { sql } from 'drizzle-orm';

describe('POST /v1/basket', () => {
  beforeAll(async () => {
    await db.execute(sql`TRUNCATE precios_actuales, snapshots, productos RESTART IDENTITY CASCADE`);
    for (const ean of ['7790000000001', '7790000000002']) {
      await db.insert(productos).values({ ean, nombre: 'P', firstSeen: '2026-05-20', lastSeen: '2026-05-20' });
      await db.insert(preciosActuales).values({
        ean, cadenaId: 1, region: 'NACIONAL', fecha: '2026-05-20',
        precioLista: '1000', precioEfectivo: '1000', sucursalesCount: 5,
      });
    }
  });
  afterAll(async () => { await pool.end(); });

  it('suma canasta por cadena', async () => {
    const app = createApp(); registerBasket(app);
    const res = await app.request('/v1/basket', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eans: ['7790000000001', '7790000000002'], region: 'NACIONAL' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.totales[0].total).toBe(2000);
    expect(body.totales[0].skus_disponibles).toBe(2);
  });
});
