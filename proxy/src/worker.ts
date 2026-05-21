/**
 * SEPA proxy — Cloudflare Worker.
 *
 * Existe porque CloudFront de datos.produccion.gob.ar bloquea los rangos de IP
 * de Railway (US-east). Routeando vía este Worker, la request final a SEPA sale
 * de un IP de Cloudflare (no bloqueado) y pasamos.
 *
 * URL del worker: https://superprecios-sepa-proxy.<account>.workers.dev
 *
 * Uso:
 *   GET https://<worker>/dataset/<...>/resource/<id>/download/<filename>
 * proxiea a:
 *   https://datos.produccion.gob.ar/dataset/<...>/resource/<id>/download/<filename>
 *
 * Streams el response body sin bufferear en memoria — soporta los ZIPs de ~322MB.
 */

const ORIGIN = 'https://datos.produccion.gob.ar';
const ALLOWED_PREFIX = '/dataset/';

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Solo permitimos paths bajo /dataset/ — evita usar el Worker como open proxy
    if (!url.pathname.startsWith(ALLOWED_PREFIX)) {
      return new Response('Not Found', { status: 404 });
    }

    // Solo GET
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { 'Allow': 'GET, HEAD' } });
    }

    const target = `${ORIGIN}${url.pathname}${url.search}`;

    const upstream = await fetch(target, {
      method: request.method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'es-AR,es;q=0.9',
        'Accept-Encoding': 'identity',
      },
      // CF auto-streams the body
    });

    // Pasamos el body directo (streaming), preservamos status y content-type/length
    const responseHeaders = new Headers();
    const passthrough = ['content-type', 'content-length', 'content-disposition', 'last-modified', 'etag'];
    for (const h of passthrough) {
      const v = upstream.headers.get(h);
      if (v) responseHeaders.set(h, v);
    }
    responseHeaders.set('X-Proxy', 'superprecios-sepa-proxy');

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  },
};
