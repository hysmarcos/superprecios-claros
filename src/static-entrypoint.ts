import { parseArgs } from 'node:util';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { CADENAS } from './db/cadenas.js';
import { logger } from './lib/logger.js';
import { downloadDailySepaZip } from './ingesta/sepa-client.js';
import { decompressDailyZip } from './ingesta/decompress.js';
import { aggregateBundle, type PriceRow } from './ingesta/aggregate.js';
import { applyRetention, loadHistorico, mergeDay, recentView, saveHistorico } from './static/historico.js';
import { writeSite } from './static/site.js';

/**
 * Build de la API estática (GitHub Pages): SEPA → JSON en --out.
 * El histórico vive en --state entre corridas (en CI, un asset de un release).
 */
const { values: args } = parseArgs({
  options: {
    zip: { type: 'string' },                       // ZIP ya descargado (si no, se baja el del día)
    out: { type: 'string', default: 'site' },
    state: { type: 'string', default: 'state' },  // carpeta con historico.ndjson.gz + estado.json
    work: { type: 'string' },                      // dónde descomprimir (default: junto al ZIP)
    'base-url': { type: 'string', default: 'https://hysmarcos.github.io/superprecios-claros' },
  },
});

interface Estado { ultima_fecha: string | null }

// GitHub Pages admite sitios de hasta 1 GB. Dejamos margen.
const SITE_BUDGET_BYTES = 900 * 1024 * 1024;
// Semanas de histórico a publicar, de más a menos. Se usa la primera que entra.
const WEEKS_OPTIONS = [52, 39, 26, 13, 4];

async function main() {
  const startedAt = new Date();
  const stateDir = resolve(args.state!);
  const histPath = join(stateDir, 'historico.ndjson.gz');
  const estadoPath = join(stateDir, 'estado.json');
  const estado: Estado = existsSync(estadoPath)
    ? JSON.parse(readFileSync(estadoPath, 'utf8'))
    : { ultima_fecha: null };

  const zipPath = args.zip ? resolve(args.zip) : (await downloadDailySepaZip(startedAt)).path;
  const workDir = resolve(args.work ?? join(dirname(zipPath), `sepa-work-${process.pid}`));
  const bundles = await decompressDailyZip(zipPath, workDir);

  // La fecha de los datos sale del nombre de los archivos, no del reloj.
  const fechas = bundles.map((b) => b.fechaArchivo).filter((f): f is string => f !== null).sort();
  const fecha = fechas.at(-1);
  if (!fecha) throw new Error('No se pudo leer la fecha de los archivos de SEPA');
  if (estado.ultima_fecha && fecha < estado.ultima_fecha) {
    throw new Error(`SEPA trae datos del ${fecha}, más viejos que la última corrida (${estado.ultima_fecha})`);
  }
  logger.info({ fecha, bundles: bundles.length }, 'SEPA listo');

  const now = new Date(`${fecha}T12:00:00Z`);
  const cadenaByKey = new Map(CADENAS.map((c) => [`${c.comercioId}-${c.banderaId}`, c.id]));
  const rows: PriceRow[] = [];
  let rowsProcessed = 0;
  for (const bundle of bundles) {
    const agg = await aggregateBundle(bundle, cadenaByKey, now);
    if (!agg) continue;
    rowsProcessed += agg.rowCount;
    for (const r of agg.rows) rows.push(r);
  }
  rmSync(workDir, { recursive: true, force: true });
  if (rows.length === 0) throw new Error('SEPA no trajo precios de ninguna cadena conocida');

  const hist = await loadHistorico(histPath);
  const seriesAntes = hist.size;
  const deltas = mergeDay(hist, rows, fecha);
  const borrados = applyRetention(hist, fecha);

  // El histórico publicado se recorta si el sitio no entra en Pages; el estado guarda todo.
  const outDir = resolve(args.out!);
  const siteInput = { fecha, generatedAt: new Date(), rows, baseUrl: args['base-url']! };
  let semanas = WEEKS_OPTIONS.at(-1)!;
  for (const w of WEEKS_OPTIONS) {
    const dry = await writeSite(outDir, { ...siteInput, hist: recentView(hist, fecha, w), dryRun: true });
    if (dry.bytes <= SITE_BUDGET_BYTES) { semanas = w; break; }
    logger.warn({ semanas: w, mb: Math.round(dry.bytes / 1024 / 1024) }, 'sitio demasiado grande, recorto histórico');
  }
  rmSync(outDir, { recursive: true, force: true });
  const stats = await writeSite(outDir, { ...siteInput, hist: recentView(hist, fecha, semanas) });
  if (stats.bytes > SITE_BUDGET_BYTES) throw new Error(`El sitio pesa ${Math.round(stats.bytes / 1024 / 1024)} MB y no entra en Pages`);

  mkdirSync(stateDir, { recursive: true });
  await saveHistorico(hist, histPath);
  writeFileSync(estadoPath, JSON.stringify({ ultima_fecha: fecha } satisfies Estado, null, 2));

  logger.info({
    fecha, rowsProcessed, precios: rows.length, seriesAntes, series: hist.size, deltas, borrados,
    archivos: stats.files, mb: Math.round(stats.bytes / 1024 / 1024), skus: stats.skus, semanas,
    segundos: Math.round((Date.now() - startedAt.getTime()) / 1000),
  }, 'build estático listo');
}

main().catch((e) => {
  logger.error({ err: String(e) }, 'build estático falló');
  process.exit(1);
});
