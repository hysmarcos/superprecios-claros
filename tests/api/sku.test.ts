import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../src/api/server.js';
import { registerSku } from '../../src/api/routes/sku.js';
import { pool, db } from '../../src/db/client.js';
import { productos, preciosActuales } from '../../src/db/schema.js';
import { sql } from 'drizzle-orm';

describe('GET /v1/sku/:ean', () => {
  beforeAll(async () => {
    await db.execute(sql`TRUNCATE precios_actuales, snapshots, productos RESTART IDENTITY CASCADE`);
    await db.insert(productos).values({
      ean: '7790000000001', nombre: 'TEST PROD', marca: 'TEST',
      cantidadPresentacion: '500', unidadMedida: 'ml',
      firstSeen: '2026-05-20', lastSeen: '2026-05-20',
    });
    await db.insert(preciosActuales).values({
      ean: '7790000000001', cadenaId: 1, region: 'NACIONAL', fecha: '2026-05-20',
      precioLista: '1000', precioEfectivo: '1000', sucursalesCount: 10,
    });
  });
  afterAll(async () => { await pool.end(); });

  it('devuelve 404 para EAN inexistente', async () => {
    const app = createApp(); registerSku(app);
    const res = await app.request('/v1/sku/7790000000099');
    expect(res.status).toBe(404);
  });

  it('devuelve 400 para EAN inválido', async () => {
    const app = createApp(); registerSku(app);
    const res = await app.request('/v1/sku/notanean');
    expect(res.status).toBe(400);
  });

  it('devuelve SKU con producto + precios', async () => {
    const app = createApp(); registerSku(app);
    const res = await app.request('/v1/sku/7790000000001');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ean).toBe('7790000000001');
    expect(body.producto.nombre).toBe('TEST PROD');
    expect(body.precios.length).toBe(1);
  });
});
