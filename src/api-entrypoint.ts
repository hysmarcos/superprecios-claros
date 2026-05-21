import { serve } from '@hono/node-server';
import { createApp } from './api/server.js';
import { registerHealth } from './api/routes/health.js';
import { registerManifest } from './api/routes/manifest.js';
import { registerSku } from './api/routes/sku.js';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';

const app = createApp();
registerHealth(app);
registerManifest(app);
registerSku(app);

serve({ fetch: app.fetch, port: env.PORT }, ({ port }) => {
  logger.info({ port }, 'API listening');
});
