import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { CADENAS } from '../src/db/cadenas.js';
import { decompressDailyZip } from '../src/ingesta/decompress.js';
import { aggregateBundle, type PriceRow } from '../src/ingesta/aggregate.js';
import { mergeDay, type Historico } from '../src/static/historico.js';
import { writeSite, shardOf } from '../src/static/site.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

// Fixture: 1 cadena (Coto), ~100 filas. Sin base de datos.
describe('build estático sobre fixture', () => {
  let out: string;
  let rows: PriceRow[];
  const fecha = '2026-05-20';

  beforeAll(async () => {
    const work = mkdtempSync(join(tmpdir(), 'static-test-'));
    const bundles = await decompressDailyZip(join(__dirname, 'fixtures', 'sepa-coto-mini.zip'), join(work, 'zip'));
    const cadenaByKey = new Map(CADENAS.map((c) => [`${c.comercioId}-${c.banderaId}`, c.id]));
    rows = [];
    for (const b of bundles) rows.push(...(await aggregateBundle(b, cadenaByKey, new Date(`${fecha}T12:00:00Z`)))!.rows);
    const hist: Historico = new Map();
    mergeDay(hist, rows, fecha);
    out = join(work, 'site');
    await writeSite(out, { fecha, generatedAt: new Date(), rows, hist, baseUrl: 'https://example.test/api' });
  });

  it('manifest con version_tag, cadenas y plantillas de URL', () => {
    const m = readJson(join(out, 'v1', 'manifest.json'));
    expect(m.schema_version).toBe(1);
    expect(m.version_tag).toBe('20260520');
    expect(m.total_skus).toBeGreaterThan(0);
    expect(m.cadenas.find((c: any) => c.nombre === 'Coto').skus_count).toBe(m.total_skus);
    expect(m.endpoints.sku).toBe('https://example.test/api/v1/sku/{ean}/{region}.json');
  });

  it('un archivo por EAN y región, con precios e histórico', () => {
    const ean = rows[0]!.ean;
    const sku = readJson(join(out, 'v1', 'sku', ean, 'NACIONAL.json'));
    expect(sku.ean).toBe(ean);
    expect(sku.fecha).toBe(fecha);
    expect(sku.precios[0].cadena.nombre).toBe('Coto');
    expect(sku.precios[0].is_min_historico).toBe(true);
    expect(sku.historico['1']).toHaveLength(1);
    expect(readdirSync(join(out, 'v1', 'sku', ean))).toContain('NACIONAL.json');
  });

  it('listados partidos por los últimos dígitos del EAN', () => {
    const ean = rows[0]!.ean;
    const shard = readJson(join(out, 'v1', 'skus', 'NACIONAL', `${shardOf(ean)}.json`));
    const item = shard.items[ean];
    expect(item.cadena_min.id).toBe(1);
    expect(item.por_cadena['1'].precio_efectivo).toBe(item.cadena_min.precio);
  });

  it('health y página de inicio', () => {
    expect(readJson(join(out, 'v1', 'health.json')).status).toBe('ok');
    expect(existsSync(join(out, 'index.html'))).toBe(true);
  });
});
