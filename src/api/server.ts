import { Hono } from 'hono';
import { requestId, accessLog, errorHandler, cors } from './middleware.js';

export function createApp() {
  const app = new Hono();
  app.use('*', cors);
  app.use('*', requestId);
  app.use('*', accessLog);
  app.use('*', errorHandler);
  return app;
}
