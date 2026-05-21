const RANGE_RE = /del\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+al\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i;

export interface PromoRange { from: Date; to: Date; }

export function parsePromoVigencia(leyenda: string | null): PromoRange | null {
  if (!leyenda) return null;
  const m = RANGE_RE.exec(leyenda);
  if (!m) return null;
  const [, d1, m1, y1, d2, m2, y2] = m;
  const from = new Date(`${y1}-${m1!.padStart(2,'0')}-${d1!.padStart(2,'0')}T00:00:00Z`);
  const to   = new Date(`${y2}-${m2!.padStart(2,'0')}-${d2!.padStart(2,'0')}T23:59:59Z`);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return null;
  return { from, to };
}

export function isPromoActive(range: PromoRange, when: Date): boolean {
  return when >= range.from && when <= range.to;
}
