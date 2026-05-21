# SEPA proxy (Cloudflare Worker)

Proxy mínimo para bypassear el bloqueo de IPs de Railway por parte del CloudFront WAF de `datos.produccion.gob.ar`. Streamea el ZIP diario (~322 MB) sin bufferearlo en memoria.

## Deploy

```bash
cd proxy
npm install
npx wrangler login   # OAuth en browser, una sola vez
npx wrangler deploy
```

La URL queda tipo `https://superprecios-sepa-proxy.<account>.workers.dev`.

Después, en Railway, actualizar:

```
SEPA_BASE_URL=https://superprecios-sepa-proxy.<account>.workers.dev/dataset/6f47ec76-d1ce-4e34-a7e1-621fe9b1d0b5/resource
```

## Allowlist

Solo proxiea paths bajo `/dataset/`. No es un open proxy.
