import { z } from 'zod';

const Env = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SEPA_BASE_URL: z.string().url().default(
    'https://datos.produccion.gob.ar/dataset/6f47ec76-d1ce-4e34-a7e1-621fe9b1d0b5/resource'
  ),
  INGESTA_TMP_DIR: z.string().default('/tmp/sepa'),
});

export const env = Env.parse(process.env);
