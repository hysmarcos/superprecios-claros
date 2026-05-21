import type { ProductoRow } from './parser.js';
import { isPromoActive, parsePromoVigencia, type PromoRange } from './promo-parser.js';

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

export interface NormalizedPrice {
  precioLista: number;          // mediana de precio_lista
  precioEfectivo: number;       // min(precioLista, promos vigentes)
  promoLeyenda: string | null;  // si hay promo vigente
  promoVigenciaFin: Date | null;
  sucursalesCount: number;
}

/**
 * Para un grupo de filas (mismo EAN+bandera+región), calcula:
 * - mediana de precio_lista
 * - precio efectivo: mínimo entre lista y promos vigentes (al día `today`)
 * - si hay >=30% de sucursales con promo vigente, considera la promo "representativa"
 */
export function normalizePricesPerGroup(rows: ProductoRow[], today: Date): NormalizedPrice | null {
  if (rows.length === 0) return null;
  const listaValues = rows.map((r) => r.precioLista).filter((v) => v > 0);
  const precioLista = median(listaValues);
  if (precioLista === null) return null;

  // promos activas
  const activePromos: Array<{ price: number; leyenda: string; range: PromoRange }> = [];
  for (const r of rows) {
    for (const [price, leyenda] of [
      [r.precioPromo1, r.leyendaPromo1] as const,
      [r.precioPromo2, r.leyendaPromo2] as const,
    ]) {
      if (price === null || price <= 0 || !leyenda) continue;
      const range = parsePromoVigencia(leyenda);
      if (!range || !isPromoActive(range, today)) continue;
      activePromos.push({ price, leyenda, range });
    }
  }

  if (activePromos.length / rows.length >= 0.3) {
    const promoPrices = activePromos.map((p) => p.price);
    const promoMedian = median(promoPrices)!;
    if (promoMedian < precioLista) {
      // elegir la leyenda más común y su to_date
      const top = activePromos.sort((a, b) => a.price - b.price)[0]!;
      return {
        precioLista,
        precioEfectivo: promoMedian,
        promoLeyenda: top.leyenda,
        promoVigenciaFin: top.range.to,
        sucursalesCount: rows.length,
      };
    }
  }

  return {
    precioLista,
    precioEfectivo: precioLista,
    promoLeyenda: null,
    promoVigenciaFin: null,
    sucursalesCount: rows.length,
  };
}
