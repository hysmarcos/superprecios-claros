import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../src/api/server.js';
import { registerSkus } from '../../src/api/routes/skus.js';
import { pool, db } from '../../src/db/client.js';
import { productos, preciosActuales } from '../../src/db/schema.js';
import { sql } from 'drizzle-orm';

describe('GET /v1/skus', () => {
  beforeAll(async () => {
    await db.execute(sql`TRUNCATE precios_actuales, snapshots, productos RESTART IDENTITY CASCADE`);
    for (const ean of ['7790000000001', '7790000000002']) {
      await db.insert(productos).values({
        ean, nombre: 'P', marca: 'M', firstSeen: '2026-05-20', lastSeen: '2026-05-20',
      });
      await db.insert(preciosActuales).values({
        ean, cadenaId: 1, region: 'NACIONAL', fecha: '2026-05-20',
        precioLista: '1000', precioEfectivo: '1000', sucursalesCount: 5,
      });
    }
  });
  afterAll(async () => { await pool.end(); });

  it('devuelve items + missing', async () => {
    const app = createApp(); registerSkus(app);
    const res = await app.request('/v1/skus?eans=7790000000001,7790000000002,7790000000099');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.items.length).toBe(2);
    expect(body.missing).toEqual(['7790000000099']);
  });

  it('rechaza más de 50 EANs', async () => {
    const app = createApp(); registerSkus(app);
    const eans = Array.from({length: 51}, (_,i) => '779000000' + String(i).padStart(4,'0')).join(',');
    const res = await app.request(`/v1/skus?eans=${eans}`);
    expect(res.status).toBe(400);
  });
});
