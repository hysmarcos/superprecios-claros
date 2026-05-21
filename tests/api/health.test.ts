import { describe, it, expect, afterAll } from 'vitest';
import { createApp } from '../../src/api/server.js';
import { registerHealth } from '../../src/api/routes/health.js';
import { pool } from '../../src/db/client.js';

describe('GET /v1/health', () => {
  afterAll(async () => { await pool.end(); });
  it('responde ok cuando la DB está arriba', async () => {
    const app = createApp();
    registerHealth(app);
    const res = await app.request('/v1/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', db: 'ok' });
  });
});
