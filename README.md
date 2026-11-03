# superprecios-claros

API pública con histórico de precios de supermercados argentinos. Toma los datos oficiales de **[SEPA](https://datos.produccion.gob.ar/dataset/sepa-precios)** (Sistema Electrónico de Publicidad de Precios Argentinos), los normaliza por SKU × cadena × región y los publica como archivos JSON para extensiones de navegador, bots y dashboards que comparan precios entre cadenas.

- **Sin auth, sin servidor, costo $0.** Un workflow de GitHub Actions arma los JSON una vez por día y GitHub Pages los sirve.
- **Cobertura**: Coto, Carrefour (Hiper / Market / Express / Maxi), Cencosud (Jumbo / Disco / Vea), DIA, La Anónima / Topsy / Bomba, Cooperativa Obrera, Libertad, Toledo (15 cadenas configuradas; el manifest dice cuáles trajo SEPA hoy).
- **Histórico**: últimos 7 días con resolución diaria + 1 punto por semana (lunes) hacia atrás.
- **Regiones**: NACIONAL, AMBA, CENTRO, CUYO, NEA, NOA, PATAGONIA.

> **Estado**: en línea en **https://hysmarcos.github.io/superprecios-claros/**, como API estática. Se actualiza todos los días a las 17:30 (hora argentina). El histórico empezó de cero el 2026-11-02: el de la época de Railway no se guardó.

---

## Para consumidores del API

Base URL: `https://hysmarcos.github.io/superprecios-claros`

Son archivos estáticos: cada "endpoint" es una URL fija que termina en `.json`. No hay query params.

### Quick start

```bash
# 1. Manifest: fecha de los datos, version_tag, cadenas y regiones
curl https://hysmarcos.github.io/superprecios-claros/v1/manifest.json

# 2. Un SKU con precios por cadena e histórico
curl https://hysmarcos.github.io/superprecios-claros/v1/sku/7790139101169/NACIONAL.json

# 3. Listado liviano: todos los EAN que terminan en "69", sin histórico
curl https://hysmarcos.github.io/superprecios-claros/v1/skus/NACIONAL/69.json
```

### Endpoints

| Path | Equivale a (API con servidor) | Descripción |
|---|---|---|
| `/v1/manifest.json` | `GET /v1/manifest` | `version_tag`, fecha de los datos, cadenas con cantidad de SKUs, regiones |
| `/v1/sku/{ean}/{region}.json` | `GET /v1/sku/:ean?region=` | SKU completo: precios por cadena + histórico delta-only |
| `/v1/skus/{region}/{shard}.json` | `GET /v1/skus?eans=` | Listado slim de los EAN que terminan en `{shard}` (2 dígitos, `00`–`99`) |
| `/v1/health.json` | `GET /v1/health` | Fecha de la última actualización |
| — | `POST /v1/basket` | No existe en la versión estática: se calcula en el cliente (ver abajo) |

`{region}` va en mayúsculas: `NACIONAL`, `AMBA`, `CENTRO`, `CUYO`, `NEA`, `NOA` o `PATAGONIA`.

### Formato — `/v1/sku/{ean}/{region}.json`

Valores ilustrativos (para ver uno real, abrí la URL del Quick start):

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
  "fecha": "2026-11-02",
  "precios": [
    {
      "cadena": { "id": 1, "nombre": "Coto", "grupo": "Coto", "logo_url": null },
      "precio_lista": 1873,
      "precio_efectivo": 1873,
      "promo": null,
      "min_90d": 1650,
      "min_90d_fecha": "2026-10-15",
      "delta_7d_pct": 2.3,
      "is_min_historico": false
    }
  ],
  "historico": {
    "1": [
      { "fecha": "2026-10-15", "precio_lista": 1650, "precio_efectivo": 1650, "promo": null },
      { "fecha": "2026-10-28", "precio_lista": 1820, "precio_efectivo": 1690, "promo": "DEL 27/10/2026 AL 02/11/2026" }
    ]
  }
}
```

`precios` viene ordenado del más barato al más caro. El histórico es **delta-only**: solo aparecen los días donde el precio efectivo cambió. Para dibujar un gráfico continuo, el cliente hace forward-fill (step chart) entre puntos.

### Formato — `/v1/skus/{region}/{shard}.json`

Versión slim sin histórico, para listados con muchos productos. `items` es un objeto con el EAN como clave (valores ilustrativos):

```json
{
  "region": "NACIONAL",
  "fecha": "2026-11-02",
  "items": {
    "7790139101169": {
      "producto": { "nombre": "VINAGRE DE VINO FAVINCO 500ML", "marca": "FAVINCO" },
      "por_cadena": {
        "1": { "precio_efectivo": 1873, "delta_7d_pct": 2.3, "is_min_historico": false, "tiene_promo": false },
        "2": { "precio_efectivo": 1720, "delta_7d_pct": -1.5, "is_min_historico": true, "tiene_promo": true }
      },
      "cadena_min": { "id": 2, "precio": 1720 }
    }
  }
}
```

Para buscar varios EAN: agrupalos por sus últimos 2 dígitos y bajá un archivo por grupo. Un EAN que no está en `items` no tiene precio hoy en esa región.

### Canasta (`/v1/basket`) en el cliente

Una página estática no puede recibir un `POST`. La canasta se calcula con los listados:

```js
const BASE = 'https://hysmarcos.github.io/superprecios-claros';

async function canasta(eans, region = 'NACIONAL') {
  const shards = [...new Set(eans.map((e) => e.slice(-2)))];
  const archivos = await Promise.all(
    shards.map((s) => fetch(`${BASE}/v1/skus/${region}/${s}.json`).then((r) => r.json())),
  );
  const items = Object.assign({}, ...archivos.map((a) => a.items));
  const totales = {};
  for (const ean of eans) {
    for (const [cadena, p] of Object.entries(items[ean]?.por_cadena ?? {})) {
      totales[cadena] ??= { cadena_id: Number(cadena), total: 0, skus_disponibles: 0 };
      totales[cadena].total += p.precio_efectivo;
      totales[cadena].skus_disponibles++;
    }
  }
  // Solo comparan bien las cadenas que tienen todos los productos
  return Object.values(totales)
    .map((t) => ({ ...t, skus_faltantes: eans.length - t.skus_disponibles }))
    .sort((a, b) => a.skus_faltantes - b.skus_faltantes || a.total - b.total);
}
```

Los nombres de las cadenas están en `manifest.json` → `cadenas`.

### Cache y version_tag

GitHub Pages manda `Cache-Control: max-age=600` en todos los archivos (10 minutos) y no deja cambiarlo. También manda `Access-Control-Allow-Origin: *`, así que se puede leer desde cualquier página o extensión. Los datos cambian una vez por día, así que alcanza. Si querés forzar datos nuevos, leé `version_tag` del manifest y agregalo como `?v=<version_tag>` a las URLs: Pages ignora el parámetro, pero el cache del navegador o de tu CDN lo toma como otra URL.

### Errores

| Status | Significado |
|---|---|
| 404 | El EAN no tiene precio hoy en esa región, o la ruta no existe. El cuerpo es HTML, no JSON: mirá el status. |
| 200 | Todo bien. |

No hay errores de validación: si el EAN está mal formado, la respuesta es 404.

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

El listado vivo está en `manifest.json`. Una cadena con `skus_count: 0` no vino en el archivo de SEPA de ese día. Para sumar una cadena nueva hay que agregarla al final de `src/db/cadenas.ts`.

### Licencia de datos

Los precios provienen de [SEPA](https://datos.produccion.gob.ar/dataset/sepa-precios), publicados por el Ministerio de Economía bajo licencia **CC-BY**. Esta API los re-sirve sin transformaciones sustanciales: solo agregaciones estadísticas (mediana por región, delta, mínimo de 90 días). Si construís algo encima, citá la fuente.

---

## Para contribuir al repo

### Stack

- **Node 22** + **TypeScript 5** (ESM)
- **Hono** + **@hono/node-server** — servidor HTTP
- **Drizzle ORM** + **drizzle-kit** — schema + migraciones
- **pg** (`node-postgres`) — driver Postgres
- **Pino** — logging estructurado
- **Zod** — validación de input
- **`unzip`** del sistema — descompresión ZIP (los archivos SEPA pesan ~322 MB)
- **Vitest** — tests
- **Docker Compose** — Postgres local (solo para el modo servidor)
- **GitHub Actions + GitHub Pages** — build diario y hosting de la API estática

### Armar la API estática en local

Prerrequisitos: Node 22, `unzip`, git. No hace falta Postgres.

```bash
git clone https://github.com/hysmarcos/superprecios-claros.git
cd superprecios-claros
npm install
npm run build

# Baja el ZIP del día (~322 MB) y escribe los JSON en ./site.
# El histórico queda en ./state y se reutiliza en la corrida siguiente.
NODE_OPTIONS=--max-old-space-size=12288 npm run build:static -- --out site --state state

# Con un ZIP ya descargado:
npm run build:static -- --zip sepa_lunes.zip --out site --state state
```

Es lo mismo que corre el workflow [`publicar.yml`](.github/workflows/publicar.yml) todos los días.

### Modo servidor (Postgres + Hono, opcional)

La API original con base de datos sigue en el repo. Sirve para desarrollo o para alojarla con un servidor propio. Prerrequisitos: Node 22, Docker, `unzip`, git.

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

Ingesta a Postgres (descarga ~322 MB):

```bash
npm run dev:ingesta
```

Descarga el ZIP del día de SEPA, descomprime las cadenas, parsea cada `productos.csv`, normaliza y guarda en `precios_actuales` (foto de hoy) + `snapshots` (deltas históricos).

### Tests

```bash
npm test          # corre todo (~5s; los tests de API y el E2E necesitan Postgres)
npm run test:watch

# Solo los que no usan base de datos
npx vitest run tests/static-historico.test.ts tests/static-site.test.ts tests/median.test.ts tests/parser.test.ts
```

`tests/static-site.test.ts` arma la API estática con el fixture y revisa el manifest, un SKU y un listado. El test E2E (`tests/ingesta-e2e.test.ts`) corre el pipeline contra un fixture chico (Coto, ~2000 filas / 300+ EANs) y verifica que la integración full descarga → parse → normalize → upsert → métricas funciona.

### Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│  SEPA (datos.produccion.gob.ar) — ZIP diario ~322 MB        │
└──────────────────────────────┬──────────────────────────────┘
                               │ 1 GET/día
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  GitHub Actions · publicar.yml (cron 17:30 ART)             │
│  download → unzip → CSV stream → mediana por región         │
│           → histórico delta-only → retención → métricas      │
│           → JSON: manifest · sku/{ean}/{region} · skus/…     │
└───────────────┬─────────────────────────────┬───────────────┘
                │ histórico (ndjson.gz)       │ artifact
                ▼                             ▼
┌───────────────────────────────┐ ┌───────────────────────────┐
│  Release "estado"             │ │  GitHub Pages (CDN)       │
│  se baja y se sube cada día   │ │  hysmarcos.github.io/…    │
└───────────────────────────────┘ └─────────────┬─────────────┘
                                                │
                                                ▼
                               Consumidores (extensiones, bots, web)
```

Por qué así:

- **Costo $0.** Actions es gratis en repos públicos y Pages también. No hay servidor ni base que pagar o mantener despierta.
- **El histórico vive en un asset de release**, no en git: reemplazarlo cada día no hace crecer el repo.
- **Pages no ejecuta código.** Por eso no hay `POST /v1/basket` ni filtros por query: la canasta se calcula en el cliente con los listados.

Límites a vigilar (medidos con los datos del 2026-11-02):

| Límite | Valor | Hoy |
|---|---|---|
| Tamaño del sitio en Pages | 1 GB | 358 MB en 286.031 archivos |
| Ancho de banda de Pages | 100 GB/mes (límite blando) | — |
| Deploy en Pages | 10 min | — |
| Cron en repos públicos | GitHub lo apaga tras 60 días sin actividad | el workflow lo vuelve a habilitar en cada corrida |

El sitio crece con el histórico. Si un día pasa de 900 MB, el build publica menos semanas de histórico (52 → 39 → 26 → 13 → 4) hasta que entre. El estado en el release guarda todo igual.

El modo servidor (Postgres + Hono) usa el mismo código de parseo y normalización (`src/ingesta/aggregate.ts`). Solo cambia dónde se guarda el resultado.

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
│   ├── aggregate.ts          # CSV → un precio por EAN × cadena × región (sin DB)
│   ├── parser.ts             # Streaming CSV parser (productos + sucursales)
│   ├── ean-adapter.ts        # Extracción EAN con quirks por cadena (Coto)
│   ├── region-mapper.ts      # Provincia AR-X → región (AMBA, NOA, etc.)
│   ├── promo-parser.ts       # "DEL 18/05/2026 AL 24/05/2026" → fechas
│   ├── median.ts             # Mediana + precio representativo + promo
│   ├── upsert.ts             # Batch UPSERT a productos + precios_actuales
│   ├── snapshots.ts          # Delta-only INSERT + retención daily/weekly
│   └── metrics.ts            # min_90d, delta_7d_pct, is_min_historico
├── static/                   # API estática (GitHub Pages)
│   ├── historico.ts          # Histórico delta-only, retención y métricas sin DB
│   └── site.ts               # Escribe manifest, sku/, skus/, index.html
├── db/
│   ├── schema.ts             # Drizzle schema completo
│   ├── cadenas.ts            # Catálogo de cadenas (orden = cadena_id)
│   ├── client.ts             # pg pool + drizzle handle
│   └── seed.ts               # Seed inicial de cadenas
├── lib/
│   ├── env.ts                # Validación de env vars (Zod)
│   ├── logger.ts             # Pino
│   └── errors.ts             # ApiError + códigos
├── api-entrypoint.ts         # bin para el web service
├── ingesta-entrypoint.ts     # bin para la ingesta a Postgres
└── static-entrypoint.ts      # bin para el build estático

migrations/                   # Migraciones Drizzle generadas
tests/
├── fixtures/                 # ZIP chico de SEPA para E2E
├── static-*.test.ts          # Build estático (sin DB)
└── ingesta-e2e.test.ts       # Pipeline E2E con Postgres
.github/workflows/
└── publicar.yml              # Build diario + deploy a Pages
```

### Decisiones de diseño

- **Precio representativo = mediana, no promedio.** SEPA tiene errores de carga ocasionales ($0.30 o $13M en alguna sucursal); la mediana los ignora.
- **Cada bandera es una cadena.** Jumbo, Disco y Vea son del mismo grupo (Cencosud) pero los precios difieren entre banderas — los tratamos como cadenas separadas con `cadena_id` único.
- **Histórico delta-only.** Solo se inserta una fila en `snapshots` cuando el precio cambió respecto al último snapshot. Reduce escrituras ~80%. El cliente reconstruye la serie continua con forward-fill.
- **Retención**: snapshots `daily` mayores a 7 días se promueven a `weekly` si caen en lunes; el resto se borran. Cubre últimos 7 días + 1 snapshot semanal hacia atrás indefinidamente. En la versión estática nunca se borra el último punto de una serie, para que el histórico siempre termine en el último precio conocido.
- **La fecha de los datos sale del archivo, no del reloj.** SEPA pone la fecha en el nombre de cada ZIP de cadena. Si un día no actualiza, el build no presenta datos viejos como nuevos.
- **Métricas pre-computadas** (`min_90d`, `delta_7d_pct`, `is_min_historico`): en Postgres viven en `precios_actuales`; en la versión estática se calculan al escribir cada JSON. Nadie agrega datos por request.
- **EAN canónico.** Coto pone el EAN en `id_producto` y `"1"` en `productos_ean` — `ean-adapter.ts` resuelve el quirk. Otras cadenas usan el campo correcto.

### Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `DATABASE_URL` | — | Postgres connection string. La usan la API y la ingesta a Postgres; el build estático no |
| `PORT` | `3000` | Puerto del web service |
| `NODE_ENV` | `development` | `development` activa pino-pretty |
| `LOG_LEVEL` | `info` | `fatal`/`error`/`warn`/`info`/`debug`/`trace` |
| `SEPA_BASE_URL` | URL oficial | Override para mirror/staging |
| `INGESTA_TMP_DIR` | `/tmp/sepa` | Dónde bajar y extraer el ZIP |

### Convenciones

- TypeScript strict + `noUncheckedIndexedAccess`. Si TS se queja, no lo silencies con `!` salvo que sea verdaderamente imposible llegar ahí.
- Tests en serie (`fileParallelism: false` en `vitest.config.ts`) porque comparten DB. Si agregás un test que toca DB, asegurate de hacer `TRUNCATE ... RESTART IDENTITY CASCADE` en el `beforeAll`.
- ESM-only. Imports terminan en `.js` aunque el archivo sea `.ts` (resuelve para tsx + tsc).
- Logs son JSON estructurado (Pino). No usar `console.log` en código de producción.

### Roadmap

- [ ] Selector de región basado en geolocalización del cliente (el backend ya guarda las 6 regiones)
- [ ] Índice de búsqueda por nombre para la versión estática (hoy hay que conocer el EAN)
- [ ] Detector de "fake discount" (cadena que sube precio antes de "ofrecer descuento")
- [ ] Notificaciones de bajada de precio sobre SKUs favoritos
- [ ] Fallback a APIs públicas de VTEX si SEPA queda fuera de servicio
- [ ] Endpoint `/v1/search` con full-text sobre nombre + marca en modo servidor (índice GIN ya existe)

## Contribuir

Issues y PRs bienvenidos. Si vas a tocar el schema o agregar cadenas nuevas, abrí un issue antes para alinear.

## Licencia

MIT (código). Los datos servidos siguen la licencia CC-BY de SEPA.
