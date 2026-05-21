import type { Context } from 'hono';

export function setImmutableCache(c: Context, etag: string) {
  c.header('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable');
  c.header('ETag', `W/"${etag}"`);
}
export function setShortCache(c: Context) {
  c.header('Cache-Control', 'public, max-age=300, s-maxage=300');
}
export function setNoCache(c: Context) {
  c.header('Cache-Control', 'no-store');
}
