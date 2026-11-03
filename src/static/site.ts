import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { REGIONES, type Region } from '../db/schema.js';
import { CADENAS } from '../db/cadenas.js';
import type { PriceRow } from '../ingesta/aggregate.js';
import { computeMetrics, round2, seriesKey, type Historico } from './historico.js';

/** Los listados se parten por los últimos dígitos del EAN para no bajar todo el catálogo. */
export const SHARD_DIGITS = 2;
export const shardOf = (ean: string) => ean.slice(-SHARD_DIGITS);

const cadenaById = new Map(CADENAS.map((c) => [c.id, c]));

interface SiteInput {
  fecha: string;
  generatedAt: Date;
  rows: PriceRow[];
  hist: Historico;
  baseUrl: string;
  /** Solo cuenta bytes y archivos, no escribe nada. */
  dryRun?: boolean;
}

export interface SiteStats { files: number; bytes: number; skus: number }

/**
 * Escribe la API estática. Cada archivo tiene la misma forma que la respuesta
 * del endpoint equivalente de la API en Postgres (src/api/routes).
 */
export async function writeSite(outDir: string, input: SiteInput): Promise<SiteStats> {
  const { fecha, rows, hist } = input;
  const stats: SiteStats = { files: 0, bytes: 0, skus: 0 };
  const pending: Promise<void>[] = [];
  const createdDirs = new Set<string>();

  const emit = async (rel: string, body: string) => {
    stats.files++;
    stats.bytes += Buffer.byteLength(body);
    if (input.dryRun) return;
    const path = join(outDir, rel);
    const dir = dirname(path);
    if (!createdDirs.has(dir)) { createdDirs.add(dir); await mkdir(dir, { recursive: true }); }
    pending.push(writeFile(path, body));
    if (pending.length >= 256) await Promise.all(pending.splice(0));
  };
  const json = (rel: string, data: unknown) => emit(rel, JSON.stringify(data));

  // ean → region → filas de hoy
  const byEan = new Map<string, Map<Region, PriceRow[]>>();
  for (const r of rows) {
    let regions = byEan.get(r.ean);
    if (!regions) { regions = new Map(); byEan.set(r.ean, regions); }
    let list = regions.get(r.region);
    if (!list) { list = []; regions.set(r.region, list); }
    list.push(r);
  }
  stats.skus = byEan.size;

  // region → shard → ean → item slim
  const shards = new Map<string, Map<string, Record<string, unknown>>>();
  const skusPorCadena = new Map<number, number>();

  for (const [ean, regions] of byEan) {
    for (const [region, list] of regions) {
      const first = list[0]!;
      const precios = list
        .map((r) => {
          const series = hist.get(seriesKey(ean, r.cadenaId, region)) ?? [];
          const efectivo = round2(r.price.precioEfectivo);
          const m = computeMetrics(series, fecha, efectivo);
          const cad = cadenaById.get(r.cadenaId)!;
          return {
            cadena: { id: cad.id, nombre: cad.nombreDisplay, grupo: cad.grupo, logo_url: null },
            precio_lista: round2(r.price.precioLista),
            precio_efectivo: efectivo,
            promo: r.price.promoLeyenda
              ? { leyenda: r.price.promoLeyenda, vigencia_fin: r.price.promoVigenciaFin?.toISOString().slice(0, 10) ?? null }
              : null,
            min_90d: m.min90d,
            min_90d_fecha: m.min90dFecha,
            delta_7d_pct: m.delta7dPct,
            is_min_historico: m.isMinHistorico,
            series,
          };
        })
        .sort((a, b) => a.precio_efectivo - b.precio_efectivo);

      const historico: Record<string, Array<Record<string, unknown>>> = {};
      for (const p of precios) {
        historico[p.cadena.id] = p.series.map(([f, lista, ef, promo]) => (
          { fecha: f, precio_lista: lista, precio_efectivo: ef, promo }
        ));
      }

      const producto = { nombre: first.nombre, marca: first.marca };
      await json(`v1/sku/${ean}/${region}.json`, {
        ean,
        producto: { ...producto, cantidad: first.cantidadPresentacion, unidad: first.unidadMedida },
        region,
        fecha,
        precios: precios.map(({ series: _s, ...p }) => p),
        historico,
      });

      const por_cadena: Record<string, unknown> = {};
      for (const p of precios) {
        por_cadena[p.cadena.id] = {
          precio_efectivo: p.precio_efectivo, delta_7d_pct: p.delta_7d_pct,
          is_min_historico: p.is_min_historico, tiene_promo: p.promo !== null,
        };
      }
      const cheapest = precios[0]!;
      const shardKey = `${region}/${shardOf(ean)}`;
      let shard = shards.get(shardKey);
      if (!shard) { shard = new Map(); shards.set(shardKey, shard); }
      shard.set(ean, { producto, por_cadena, cadena_min: { id: cheapest.cadena.id, precio: cheapest.precio_efectivo } });

      if (region === 'NACIONAL') for (const p of precios) skusPorCadena.set(p.cadena.id, (skusPorCadena.get(p.cadena.id) ?? 0) + 1);
    }
  }

  for (const [key, items] of shards) {
    const [region] = key.split('/');
    await json(`v1/skus/${key}.json`, { region, fecha, items: Object.fromEntries(items) });
  }

  const versionTag = fecha.replace(/-/g, '');
  const base = input.baseUrl.replace(/\/$/, '');
  await json('v1/manifest.json', {
    schema_version: 1,
    last_ingest_at: input.generatedAt.toISOString(),
    fecha_datos: fecha,
    version_tag: versionTag,
    regiones: REGIONES,
    cadenas: CADENAS.map((c) => ({
      id: c.id, nombre: c.nombreDisplay, grupo: c.grupo, skus_count: skusPorCadena.get(c.id) ?? 0, logo_url: null,
    })),
    total_skus: byEan.size,
    endpoints: {
      sku: `${base}/v1/sku/{ean}/{region}.json`,
      skus_shard: `${base}/v1/skus/{region}/{shard}.json`,
      shard: `últimos ${SHARD_DIGITS} dígitos del EAN`,
    },
  });
  await json('v1/health.json', { status: 'ok', last_ingest_at: input.generatedAt.toISOString(), fecha_datos: fecha });

  // EAN de ejemplo para la portada: el que más cadenas tienen a nivel nacional
  let ejemplo = { ean: '', cadenas: 0 };
  for (const [ean, regions] of byEan) {
    const n = regions.get('NACIONAL')?.length ?? 0;
    if (n > ejemplo.cadenas) ejemplo = { ean, cadenas: n };
  }
  await emit('index.html', indexHtml(base, fecha, byEan.size, ejemplo.ean));
  await emit('404.html', '<!doctype html><meta charset="utf-8"><title>No encontrado</title>'
    + '<p>404: el EAN o la ruta no existe. Ver <a href="./v1/manifest.json">v1/manifest.json</a>.</p>');

  await Promise.all(pending);
  return stats;
}

function indexHtml(base: string, fecha: string, totalSkus: number, ean: string): string {
  const sku = `${base}/v1/sku/${ean}/NACIONAL.json`;
  const shard = `${base}/v1/skus/NACIONAL/${shardOf(ean)}.json`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>superprecios-claros API</title>
<style>
  :root { color-scheme: light dark; --fg: #1b1b1b; --bg: #fafafa; --muted: #5c5c5c; --code: #ececec; }
  @media (prefers-color-scheme: dark) { :root { --fg: #ececec; --bg: #161616; --muted: #a8a8a8; --code: #262626; } }
  body { font: 16px/1.55 system-ui, sans-serif; color: var(--fg); background: var(--bg); max-width: 46rem; margin: 2.5rem auto; padding: 0 16px; }
  code { background: var(--code); padding: .1em .35em; border-radius: 4px; overflow-wrap: anywhere; }
  p.muted { color: var(--muted); }
  a { color: inherit; }
</style>
</head>
<body>
<h1>superprecios-claros</h1>
<p>Precios de supermercados argentinos, tomados de <a href="https://datos.produccion.gob.ar/dataset/sepa-precios">SEPA</a> (CC-BY).
Son archivos JSON estáticos: se generan una vez por día con GitHub Actions y se sirven desde GitHub Pages.</p>
<p class="muted">Datos del ${fecha} · ${totalSkus.toLocaleString('es-AR')} productos.</p>
<h2>Endpoints</h2>
<ul>
  <li><a href="${base}/v1/manifest.json"><code>/v1/manifest.json</code></a>: fecha, cadenas, regiones.</li>
  <li><a href="${sku}"><code>/v1/sku/{ean}/{region}.json</code></a>: precios por cadena e histórico de un producto.</li>
  <li><a href="${shard}"><code>/v1/skus/{region}/{shard}.json</code></a>: listado liviano. <code>shard</code> = últimos ${SHARD_DIGITS} dígitos del EAN.</li>
  <li><a href="${base}/v1/health.json"><code>/v1/health.json</code></a>: última actualización.</li>
</ul>
<p>Documentación y código: <a href="https://github.com/hysmarcos/superprecios-claros">github.com/hysmarcos/superprecios-claros</a>.</p>
</body>
</html>
`;
}
