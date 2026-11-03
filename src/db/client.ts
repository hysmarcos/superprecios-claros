import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../lib/env.js';
import * as schema from './schema.js';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL es requerida para la API y la ingesta a Postgres');

const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

export const db = drizzle(pool, { schema });
export { pool };
