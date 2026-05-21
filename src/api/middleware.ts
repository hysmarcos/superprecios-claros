import type { MiddlewareHandler } from 'hono';
import { randomUUID } from 'node:crypto';
import { logger } from '../lib/logger.js';
import { ApiError } from '../lib/errors.js';

export const requestId: MiddlewareHandler = async (c, next) => {
  const id = c.req.header('x-request-id') ?? randomUUID();
  c.set('requestId', id);
  c.header('X-Request-Id', id);
  await next();
};

export const accessLog: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  await next();
  logger.info({
    method: c.req.method, path: c.req.path, status: c.res.status,
    durationMs: Date.now() - start, requestId: c.get('requestId'),
  }, 'request');
};

export const errorHandler: MiddlewareHandler = async (c, next) => {
  try { await next(); } catch (e) {
    const requestId = c.get('requestId');
    if (e instanceof ApiError) {
      logger.warn({ err: e.message, code: e.code, requestId }, 'api error');
      return c.json({ error: e.code, detail: e.message, request_id: requestId }, e.status as any);
    }
    logger.error({ err: String(e), requestId }, 'unhandled error');
    return c.json({ error: 'INTERNAL', detail: 'Internal server error', request_id: requestId }, 500);
  }
};

export const cors: MiddlewareHandler = async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type');
  c.header('Access-Control-Max-Age', '86400');
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  await next();
};
