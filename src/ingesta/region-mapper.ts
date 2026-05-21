import type { Region } from '../db/schema.js';

const MAP: Record<string, Exclude<Region, 'NACIONAL'>> = {
  'AR-C': 'AMBA',     // CABA
  'AR-B': 'CENTRO',   // Buenos Aires (todo el resto fuera GBA — GBA real requeriría parser de localidad, ver nota)
  'AR-S': 'CENTRO',   // Santa Fe
  'AR-X': 'CENTRO',   // Córdoba
  'AR-E': 'CENTRO',   // Entre Ríos
  'AR-L': 'CENTRO',   // La Pampa
  'AR-M': 'CUYO',     // Mendoza
  'AR-J': 'CUYO',     // San Juan
  'AR-D': 'CUYO',     // San Luis
  'AR-H': 'NEA',      // Chaco
  'AR-W': 'NEA',      // Corrientes
  'AR-P': 'NEA',      // Formosa
  'AR-N': 'NEA',      // Misiones
  'AR-K': 'NOA',      // Catamarca
  'AR-Y': 'NOA',      // Jujuy
  'AR-F': 'NOA',      // La Rioja
  'AR-A': 'NOA',      // Salta
  'AR-G': 'NOA',      // Santiago del Estero
  'AR-T': 'NOA',      // Tucumán
  'AR-U': 'PATAGONIA',// Chubut
  'AR-Q': 'PATAGONIA',// Neuquén
  'AR-R': 'PATAGONIA',// Río Negro
  'AR-Z': 'PATAGONIA',// Santa Cruz
  'AR-V': 'PATAGONIA',// Tierra del Fuego
};

export function provinciaToRegion(code: string): Exclude<Region, 'NACIONAL'> {
  return MAP[code] ?? 'CENTRO';
}

/**
 * NOTA: AR-B (Buenos Aires) cubre tanto GBA (= AMBA) como resto-provincia (CENTRO).
 * Para distinguir GBA real haría falta parsear `sucursales_localidad` o usar lat/long.
 * MVP simplificado: AR-B = CENTRO. La sucursal AMBA queda bajo AR-C únicamente.
 * En la práctica esto subestima AMBA — aceptable para MVP, refinable en v1.1.
 */
