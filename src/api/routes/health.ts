import type { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '../../db/client.js';

export function registerHealth(app: Hono) {
  app.get('/v1/health', async (c) => {
    try {
      await db.execute(sql`SELECT 1`);
      return c.json({ status: 'ok', db: 'ok' });
    } catch (e) {
      return c.json({ status: 'degraded', db: 'down' }, 503);
    }
  });
}
