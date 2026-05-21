import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../src/api/server.js';
import { registerManifest } from '../../src/api/routes/manifest.js';
import { pool, db } from '../../src/db/client.js';
import { jobRuns } from '../../src/db/schema.js';

describe('GET /v1/manifest', () => {
  beforeAll(async () => {
    await db.insert(jobRuns).values({
      jobName: 'sepa_ingest', startedAt: new Date(), finishedAt: new Date(), status: 'success',
    });
  });
  afterAll(async () => { await pool.end(); });
  it('devuelve schema_version, version_tag y cadenas activas', async () => {
    const app = createApp();
    registerManifest(app);
    const res = await app.request('/v1/manifest');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.schema_version).toBe(1);
    expect(body.version_tag).toMatch(/^\d{8}$/);
    expect(body.regiones).toContain('NACIONAL');
    expect(Array.isArray(body.cadenas)).toBe(true);
  });
});
