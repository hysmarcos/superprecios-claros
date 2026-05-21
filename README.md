# superprecios-claros

API pública con histórico de precios de supermercados argentinos. Ingiere diariamente los datos oficiales de **[SEPA](https://datos.produccion.gob.ar/dataset/sepa-precios)** (Sistema Electrónico de Publicidad de Precios Argentinos), los normaliza por SKU × cadena × región, y los expone vía HTTP a extensiones de navegador, bots y dashboards que comparen precios entre cadenas.

- **Sin auth, sin rate-limits artificiales.** Datos públicos del gobierno (CC-BY) re-servidos a todo el que quiera enchufarse.
- **Cobertura**: Coto, Carrefour (Hiper / Market / Express / Maxi), Cencosud (Jumbo / Disco / Vea), DIA, La Anónima / Topsy / Bomba, Cooperativa Obrera, Libertad, Toledo, y más (~15 cadenas).
- **Histórico**: últimos 7 días con resolución diaria + 1 snapshot semanal hacia atrás indefinidamente.
- **Regiones**: NACIONAL, AMBA, CENTRO, CUYO, NEA, NOA, PATAGONIA.

> **Estado**: producción. El job de ingesta corre diariamente y la API es estable.

---

## Para consumidores del API

Base URL: `https://superprecios-claros.up.railway.app` *(o el subdominio asignado por Railway)*

### Quick start

```bash
# 1. Leer el manifest (cachear ~1h, contiene version_tag para cache busting)
curl https://superprecios-claros.up.railway.app/v1/manifest

# 2. Info completa de un SKU con histórico
curl "https://superprecios-claros.up.railway.app/v1/sku/7790139101169?region=NACIONAL&v=20260520"

# 3. Batch de hasta 50 EANs (sin histórico, para listados)
curl "https://superprecios-claros.up.railway.app/v1/skus?eans=7790139101169,7793360129957&region=NACIONAL&v=20260520"

# 4. Comparar canasta entre cadenas
curl -X POST https://superprecios-claros.up.railway.app/v1/basket \
  -H "content-type: application/json" \
  -d '{"eans":["7790139101169","7793360129957"],"region":"NACIONAL"}'
```

### Endpoints

| Método | Path | Descripción |
|---|---|---|
| GET | `/v1/manifest` | Metadata: `version_tag`, cadenas activas con SKU counts, regiones |
| GET | `/v1/sku/:ean?region=…&v=…` | SKU completo: precios por cadena + histórico delta-only |
| GET | `/v1/skus?eans=…&region=…&v=…` | Batch slim (≤50 EANs), sin histórico, ideal para grids |
| POST | `/v1/basket` | Comparador de canasta: total por cadena + cadena más barata |
| GET | `/v1/health` | Healthcheck con estado de DB |

### Cache busting

Las URLs de datos (`/v1/sku/:ean`, `/v1/skus`) llevan `?v=<version_tag>` con `Cache-Control: immutable`. El flujo correcto en el cliente:

1. Al iniciar, hacer `GET /v1/manifest`, leer `version_tag` (formato `YYYYMMDD`), guardarlo localmente.
2. Usar ese `version_tag` en todas las consultas hasta el próximo `manifest`.
3. Re-fetchear el manifest cada ~1 hora. Cuando cambia, todas las URLs son nuevas → cache miss controlado, datos frescos.

### Formato de respuesta — `GET /v1/sku/:ean`

```json
{
  "ean": "7790139101169",
  "producto": {
    "nombre": "VINAGRE DE VINO FAVINCO 500ML",
    "marca": "FAVINCO",
    "cantidad": 500,
    "unidad": "ml"
  },
  "region": "NACIONAL",
  "fecha": "2026-05-20",
  "precios": [
    {
      "cadena": { "id": 1, "nombre": "Coto", "grupo": "Coto", "logo_url": null },
      "precio_lista": 1873,
      "precio_efectivo": 1873,
      "promo": null,
      "min_90d": 1650,
      "min_90d_fecha": "2026-04-15",
      "delta_7d_pct": 2.3,
      "is_min_historico": false
    }
  ],
  "historico": {
    "1": [
      { "fecha": "2026-04-15", "precio_lista": 1650, "precio_efectivo": 1650 },
      { "fecha": "2026-05-13", "precio_lista": 1820, "precio_efectivo": 1690, "promo": "DEL 11/05 AL 17/05" }
    ]
  }
}
```

El histórico es **delta-only**: solo aparecen los días donde el precio cambió. Para dibujar un gráfico continuo, el cliente hace forward-fill (step chart) entre puntos.

### Formato — `GET /v1/skus?eans=...`

Versión slim sin histórico, pensada para listados con muchos productos:

```json
{
  "region": "NACIONAL",
  "fecha": "2026-05-20",
  "items": [
    {
      "ean": "7790139101169",
      "producto": { "nombre": "VINAGRE DE VINO FAVINCO 500ML", "marca": "FAVINCO" },
      "por_cadena": {
        "1": { "precio_efectivo": 1873, "delta_7d_pct": 2.3, "is_min_historico": false, "tiene_promo": false },
        "2": { "precio_efectivo": 1720, "delta_7d_pct": -1.5, "is_min_historico": true, "tiene_promo": true }
      },
      "cadena_min": { "id": 2, "precio": 1720 }
    }
  ],
  "missing": ["7790000000099"]
}
```

`cadena_min` viene pre-calculado para que el cliente arme directo un chip "X% más barato en Y" sin recorrer todas las cadenas.

### Errores

Status uniformes con body JSON:

```json
{ "error": "SKU_NOT_FOUND", "detail": "EAN 7790000000099 no encontrado", "request_id": "abc-123" }
```

| Código | Status | Significado |
|---|---|---|
| `SKU_NOT_FOUND` | 404 | El EAN no está en la base |
| `INVALID_INPUT` | 400 | Validación falló (EAN mal formado, región inválida, batch >50, etc.) |
| `INTERNAL` | 500 | Bug nuestro — incluye `request_id` para reportar |

Cada response incluye un header `X-Request-Id` (UUID) que loguea el server para troubleshooting.

### Cobertura por cadena

| Cadena | Grupo | `cadena_id` |
|---|---|---|
| Coto | Coto | 1 |
| Vea, Disco, Jumbo | Cencosud | 2, 3, 4 |
| Hiper Carrefour, Carrefour Market/Express/Maxi | Carrefour | 5–8 |
| DIA | DIA | 9 |
| La Anónima, Topsy, Bomba | La Anónima | 10–12 |
| Cooperativa Obrera | — | 13 |
| Hipermercado Libertad | Libertad | 14 |
| Toledo | — | 15 |

El listado vivo está siempre en `GET /v1/manifest`. Cualquier cadena obligada por la Ley de Góndolas que aparezca en SEPA se incorpora automáticamente al pipeline.

### Licencia de datos

Los precios provienen de [SEPA](https://datos.produccion.gob.ar/dataset/sepa-precios), publicados por el Ministerio de Economía bajo licencia **CC-BY**. Esta API los re-sirve sin transformaciones sustanciales — solo agregaciones estadísticas (mediana por región/sucursal, delta, mínimo histórico). Si construís algo encima, citá la fuente.

---

## Para contribuir al repo

### Stack

- **Node 22** + **TypeScript 5** (ESM)
- **Hono** + **@hono/node-server** — servidor HTTP
- **Drizzle ORM** + **drizzle-kit** — schema + migraciones
- **pg** (`node-postgres`) — driver Postgres
- **Pino** — logging estructurado
- **Zod** — validación de input
- **yauzl** — descompresión ZIP (los archivos SEPA pesan ~322 MB)
- **Vitest** — tests
- **Docker Compose** — Postgres local

### Setup en local

Prerrequisitos: Node 22, Docker, git.

```bash
git clone https://github.com/hysmarcos/superprecios-claros.git
cd superprecios-claros
npm install

# Levantar Postgres local (puerto 15432 para no chocar con un Postgres nativo)
docker compose up -d postgres

cp .env.example .env

# Aplicar migraciones + seed de cadenas
npm run db:migrate
npx tsx src/db/seed.ts

# Correr la API
npm run dev:api
# → http://localhost:3000/v1/health
```

### Correr la ingesta diaria local (descarga ~322 MB)

```bash
npm run dev:ingesta
```

Esto descarga el ZIP del día actual de SEPA, descomprime las ~21 cadenas, parsea cada `productos.csv`, normaliza y persiste. Tarda ~5-7 minutos. El resultado queda en `precios_actuales` (foto de hoy) + `snapshots` (deltas históricos).

### Tests

```bash
npm test          # corre todo (~5s)
npm run test:watch
```

El test E2E (`tests/ingesta-e2e.test.ts`) corre el pipeline contra un fixture chico (Coto, ~2000 filas / 300+ EANs) y verifica que la integración full descarga → parse → normalize → upsert → métricas funciona.

### Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│  SEPA (datos.produccion.gob.ar) — ZIP diario ~322 MB        │
└──────────────────────────────┬──────────────────────────────┘
                               │ 1 GET/día
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Cron service "ingesta" (Railway, 09:00 ART)                │
│  download → unzip → CSV stream → normalize → upsert         │
│           → delta snapshots → retención → métricas           │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Postgres                                                   │
│  productos · cadenas · precios_actuales · snapshots · …     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Web service "api" (Hono, always-on)                        │
│  /v1/manifest · /v1/sku/:ean · /v1/skus · /v1/basket        │
└──────────────────────────────┬──────────────────────────────┘
                               │ DNS proxy
                               ▼
                  Cloudflare CDN (cache /sku, /skus)
                               │
                               ▼
                  Consumidores (extensiones, bots, web)
```

### Estructura del repo

```
src/
├── api/                      # HTTP
│   ├── server.ts             # Hono app + middleware base
│   ├── middleware.ts         # cors, request-id, error handler, logging
│   ├── cache-headers.ts      # helpers de Cache-Control
│   └── routes/
│       ├── health.ts
│       ├── manifest.ts
│       ├── sku.ts
│       ├── skus.ts
│       └── basket.ts
├── ingesta/                  # Pipeline diario SEPA → DB
│   ├── index.ts              # Orquestador end-to-end
│   ├── sepa-client.ts        # Descarga del ZIP del día (7 resource IDs)
│   ├── decompress.ts         # ZIP outer → ZIPs inner por cadena → CSVs
│   ├── parser.ts             # Streaming CSV parser (productos + sucursales)
│   ├── ean-adapter.ts        # Extracción EAN con quirks por cadena (Coto)
│   ├── region-mapper.ts      # Provincia AR-X → región (AMBA, NOA, etc.)
│   ├── promo-parser.ts       # "DEL 18/05/2026 AL 24/05/2026" → fechas
│   ├── median.ts             # Mediana + precio representativo + promo
│   ├── upsert.ts             # Batch UPSERT a productos + precios_actuales
│   ├── snapshots.ts          # Delta-only INSERT + retención daily/weekly
│   └── metrics.ts            # min_90d, delta_7d_pct, is_min_historico
├── db/
│   ├── schema.ts             # Drizzle schema completo
│   ├── client.ts             # pg pool + drizzle handle
│   └── seed.ts               # Seed inicial de cadenas
├── lib/
│   ├── env.ts                # Validación de env vars (Zod)
│   ├── logger.ts             # Pino
│   └── errors.ts             # ApiError + códigos
├── api-entrypoint.ts         # bin para el web service
└── ingesta-entrypoint.ts     # bin para el cron service

migrations/                   # Migraciones Drizzle generadas
tests/
├── fixtures/                 # ZIP chico de SEPA para E2E
└── ingesta-e2e.test.ts       # Pipeline E2E
```

### Decisiones de diseño

- **Precio representativo = mediana, no promedio.** SEPA tiene errores de carga ocasionales ($0.30 o $13M en alguna sucursal); la mediana los ignora.
- **Cada bandera es una cadena.** Jumbo, Disco y Vea son del mismo grupo (Cencosud) pero los precios difieren entre banderas — los tratamos como cadenas separadas con `cadena_id` único.
- **Histórico delta-only.** Solo se inserta una fila en `snapshots` cuando el precio cambió respecto al último snapshot. Reduce escrituras ~80%. El cliente reconstruye la serie continua con forward-fill.
- **Retención**: snapshots `daily` mayores a 7 días se promueven a `weekly` si caen en lunes; el resto se borran. Cubre últimos 7 días + 1 snapshot semanal hacia atrás indefinidamente.
- **Métricas pre-computadas** en `precios_actuales` (`min_90d`, `delta_7d_pct`, `is_min_historico`) → la API responde con un `SELECT *` simple, sin agregaciones por request.
- **EAN canónico.** Coto pone el EAN en `id_producto` y `"1"` en `productos_ean` — `ean-adapter.ts` resuelve el quirk. Otras cadenas usan el campo correcto.

### Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `DATABASE_URL` | — | Postgres connection string (requerida) |
| `PORT` | `3000` | Puerto del web service |
| `NODE_ENV` | `development` | `development` activa pino-pretty |
| `LOG_LEVEL` | `info` | `fatal`/`error`/`warn`/`info`/`debug`/`trace` |
| `SEPA_BASE_URL` | URL oficial | Override para mirror/staging |
| `INGESTA_TMP_DIR` | `/tmp/sepa` | Dónde extraer el ZIP durante la ingesta |

### Convenciones

- TypeScript strict + `noUncheckedIndexedAccess`. Si TS se queja, no lo silencies con `!` salvo que sea verdaderamente imposible llegar ahí.
- Tests en serie (`fileParallelism: false` en `vitest.config.ts`) porque comparten DB. Si agregás un test que toca DB, asegurate de hacer `TRUNCATE ... RESTART IDENTITY CASCADE` en el `beforeAll`.
- ESM-only. Imports terminan en `.js` aunque el archivo sea `.ts` (resuelve para tsx + tsc).
- Logs son JSON estructurado (Pino). No usar `console.log` en código de producción.

### Roadmap

- [ ] Selector de región basado en geolocalización del cliente (el backend ya guarda las 6 regiones)
- [ ] Snapshots crudos archivados en object storage (resiliencia ante caída de SEPA)
- [ ] Detector de "fake discount" (cadena que sube precio antes de "ofrecer descuento")
- [ ] Notificaciones de bajada de precio sobre SKUs favoritos
- [ ] Fallback a APIs públicas de VTEX si SEPA queda fuera de servicio
- [ ] Endpoint `/v1/search` con full-text sobre nombre + marca (índice GIN ya existe)

## Contribuir

Issues y PRs bienvenidos. Si vas a tocar el schema o agregar cadenas nuevas, abrí un issue antes para alinear.

## Licencia

MIT (código). Los datos servidos siguen la licencia CC-BY de SEPA.
