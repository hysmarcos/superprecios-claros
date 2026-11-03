import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip, createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { PriceRow } from '../ingesta/aggregate.js';

/** [fecha YYYY-MM-DD, precio_lista, precio_efectivo, promo_leyenda] */
export type Point = [string, number, number, string | null];

/** key = `${ean}|${cadenaId}|${region}` → puntos ordenados por fecha, delta-only. */
export type Historico = Map<string, Point[]>;

export const seriesKey = (ean: string, cadenaId: number, region: string) => `${ean}|${cadenaId}|${region}`;

const DAY_MS = 24 * 3600 * 1000;
export const shiftIso = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const isMonday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay() === 1;
export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Agrega los precios del día como en `snapshots` de Postgres: solo inserta un punto
 * cuando el precio efectivo cambió respecto del último. Correr dos veces el mismo
 * día da el mismo resultado (el punto de hoy se reemplaza).
 */
export function mergeDay(hist: Historico, rows: PriceRow[], fecha: string): number {
  let deltas = 0;
  for (const r of rows) {
    const k = seriesKey(r.ean, r.cadenaId, r.region);
    let series = hist.get(k);
    if (!series) { series = []; hist.set(k, series); }
    const previoHoy = series.at(-1)?.[0] === fecha ? series.pop() : undefined;
    const last = series.at(-1);
    const efectivo = round2(r.price.precioEfectivo);
    if (last && last[2] === efectivo) continue;
    series.push([fecha, round2(r.price.precioLista), efectivo, r.price.promoLeyenda]);
    if (previoHoy?.[2] !== efectivo) deltas++;
  }
  return deltas;
}

/**
 * Retención: puntos de los últimos 7 días + los lunes hacia atrás (tier weekly).
 * A diferencia de la versión en Postgres, nunca borra el último punto de una serie:
 * así el histórico siempre termina en el último precio conocido.
 */
export function applyRetention(hist: Historico, fecha: string): number {
  const cutoff = shiftIso(fecha, -7);
  let deleted = 0;
  for (const series of hist.values()) {
    const kept = series.filter((p, i) => p[0] >= cutoff || isMonday(p[0]) || i === series.length - 1);
    deleted += series.length - kept.length;
    if (kept.length !== series.length) series.splice(0, series.length, ...kept);
  }
  return deleted;
}

/**
 * Copia del histórico solo con los puntos de las últimas `weeks` semanas (y siempre
 * el último). El estado guardado no se toca: esto es solo lo que se publica.
 */
export function recentView(hist: Historico, fecha: string, weeks: number): Historico {
  const cutoff = shiftIso(fecha, -7 * weeks);
  const view: Historico = new Map();
  for (const [k, series] of hist) {
    view.set(k, series.filter((p, i) => p[0] >= cutoff || i === series.length - 1));
  }
  return view;
}

export interface Metrics {
  min90d: number;
  min90dFecha: string;
  delta7dPct: number | null;
  isMinHistorico: boolean;
}

/** Mismas reglas que `refreshMetrics` en src/ingesta/metrics.ts. */
export function computeMetrics(series: Point[], fecha: string, efectivoHoy: number): Metrics {
  const cutoff90 = shiftIso(fecha, -90);
  const cutoff7 = shiftIso(fecha, -7);
  // empate → la fecha más reciente (ORDER BY precio ASC, fecha DESC)
  let min = { val: round2(efectivoHoy), fecha };
  let ref7: number | null = null;
  for (const [f, , ef] of series) {
    if (f >= cutoff90 && (ef < min.val || (ef === min.val && f > min.fecha))) min = { val: ef, fecha: f };
    if (f <= cutoff7) ref7 = ef;
  }
  return {
    min90d: min.val,
    min90dFecha: min.fecha,
    delta7dPct: ref7 ? round2((efectivoHoy - ref7) / ref7 * 100) : null,
    isMinHistorico: round2(efectivoHoy) <= min.val,
  };
}

/** Estado entre corridas: NDJSON comprimido, una línea por serie. */
export async function loadHistorico(path: string): Promise<Historico> {
  const hist: Historico = new Map();
  if (!existsSync(path)) return hist;
  const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    const { k, p } = JSON.parse(line) as { k: string; p: Point[] };
    hist.set(k, p);
  }
  return hist;
}

export async function saveHistorico(hist: Historico, path: string): Promise<void> {
  function* lines() {
    for (const [k, p] of hist) if (p.length) yield JSON.stringify({ k, p }) + '\n';
  }
  await pipeline(Readable.from(lines()), createGzip(), createWriteStream(path));
}
