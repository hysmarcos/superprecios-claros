import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { PriceRow } from '../src/ingesta/aggregate.js';
import {
  applyRetention, computeMetrics, loadHistorico, mergeDay, recentView, saveHistorico, seriesKey, type Historico,
} from '../src/static/historico.js';

const row = (efectivo: number, lista = efectivo, promo: string | null = null): PriceRow => ({
  ean: '7790139101169', cadenaId: 1, region: 'NACIONAL', fecha: new Date(),
  price: { precioLista: lista, precioEfectivo: efectivo, promoLeyenda: promo, promoVigenciaFin: null, sucursalesCount: 3 },
  nombre: 'VINAGRE', marca: 'FAVINCO', cantidadPresentacion: 500, unidadMedida: 'ml',
});
const K = seriesKey('7790139101169', 1, 'NACIONAL');

describe('mergeDay (delta-only)', () => {
  it('agrega un punto solo cuando cambia el precio efectivo', () => {
    const h: Historico = new Map();
    expect(mergeDay(h, [row(100)], '2026-11-02')).toBe(1);
    expect(mergeDay(h, [row(100)], '2026-11-03')).toBe(0);
    expect(mergeDay(h, [row(90)], '2026-11-04')).toBe(1);
    expect(h.get(K)!.map((p) => p[0])).toEqual(['2026-11-02', '2026-11-04']);
  });

  it('correr dos veces el mismo día reemplaza el punto de hoy', () => {
    const h: Historico = new Map();
    mergeDay(h, [row(100)], '2026-11-02');
    mergeDay(h, [row(90)], '2026-11-03');
    mergeDay(h, [row(100)], '2026-11-03');
    expect(h.get(K)).toEqual([['2026-11-02', 100, 100, null]]);
  });

  it('redondea a 2 decimales como numeric(12,2)', () => {
    const h: Historico = new Map();
    mergeDay(h, [row(99.999, 120.004)], '2026-11-02');
    expect(h.get(K)![0]).toEqual(['2026-11-02', 120, 100, null]);
  });
});

describe('applyRetention', () => {
  it('deja 7 días, los lunes y el último punto', () => {
    const h: Historico = new Map([[K, [
      ['2026-10-05', 1, 1, null],  // lunes viejo → queda
      ['2026-10-07', 2, 2, null],  // miércoles viejo → se borra
      ['2026-10-14', 3, 3, null],  // miércoles viejo, pero es el último antes de la ventana → se borra
      ['2026-10-30', 4, 4, null],  // dentro de los 7 días → queda
    ]]]);
    expect(applyRetention(h, '2026-11-02')).toBe(2);
    expect(h.get(K)!.map((p) => p[0])).toEqual(['2026-10-05', '2026-10-30']);
  });

  it('nunca borra el último punto de la serie', () => {
    const h: Historico = new Map([[K, [['2026-10-07', 2, 2, null]]]]);
    applyRetention(h, '2026-11-02');
    expect(h.get(K)).toHaveLength(1);
  });
});

describe('computeMetrics', () => {
  it('min_90d, delta_7d y mínimo histórico', () => {
    const series = [
      ['2026-07-01', 50, 50, null],   // fuera de 90 días
      ['2026-10-01', 80, 80, null],
      ['2026-10-20', 100, 100, null], // último punto con fecha <= hoy-7 → referencia del delta
      ['2026-10-30', 110, 110, null],
    ] as const;
    const m = computeMetrics(series.map((p) => [...p]), '2026-11-02', 110);
    expect(m).toEqual({ min90d: 80, min90dFecha: '2026-10-01', delta7dPct: 10, isMinHistorico: false });
  });

  it('si hoy es el mínimo, la fecha es hoy', () => {
    const m = computeMetrics([['2026-10-01', 80, 80, null]], '2026-11-02', 80);
    expect(m.min90dFecha).toBe('2026-11-02');
    expect(m.isMinHistorico).toBe(true);
    expect(m.delta7dPct).toBe(0);
  });

  it('sin referencia de 7 días → delta null', () => {
    expect(computeMetrics([], '2026-11-02', 80).delta7dPct).toBeNull();
  });
});

describe('estado entre corridas', () => {
  it('guarda y vuelve a leer el histórico', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'hist-')), 'historico.ndjson.gz');
    const h: Historico = new Map([[K, [['2026-11-02', 120, 100, 'DEL 01/11/2026 AL 07/11/2026']]]]);
    await saveHistorico(h, path);
    expect(await loadHistorico(path)).toEqual(h);
  });

  it('sin archivo previo arranca vacío', async () => {
    expect((await loadHistorico(join(tmpdir(), 'no-existe.ndjson.gz'))).size).toBe(0);
  });
});

describe('recentView', () => {
  it('publica solo las últimas semanas, sin tocar el estado', () => {
    const h: Historico = new Map([[K, [
      ['2026-01-05', 1, 1, null],
      ['2026-10-26', 2, 2, null],
      ['2026-11-02', 3, 3, null],
    ]]]);
    expect(recentView(h, '2026-11-02', 4).get(K)!.map((p) => p[0])).toEqual(['2026-10-26', '2026-11-02']);
    expect(h.get(K)).toHaveLength(3);
  });
});
