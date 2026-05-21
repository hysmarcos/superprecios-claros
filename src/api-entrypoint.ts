import { serve } from '@hono/node-server';
import { createApp } from './api/server.js';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';

const app = createApp();
app.get('/', (c) => c.text('superprecios-claros API'));

serve({ fetch: app.fetch, port: env.PORT }, ({ port }) => {
  logger.info({ port }, 'API listening');
});
