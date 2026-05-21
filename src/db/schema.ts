import {
  pgTable, varchar, text, numeric, integer, boolean, date, timestamp,
  serial, jsonb, primaryKey, unique, index, check
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const productos = pgTable('productos', {
  ean: varchar('ean', { length: 20 }).primaryKey(),
  nombre: text('nombre').notNull(),
  marca: text('marca'),
  cantidadPresentacion: numeric('cantidad_presentacion', { precision: 10, scale: 3 }),
  unidadMedida: varchar('unidad_medida', { length: 10 }),
  firstSeen: date('first_seen').notNull(),
  lastSeen: date('last_seen').notNull(),
}, (t) => ({
  nombreFts: index('idx_productos_nombre_fts').using(
    'gin',
    sql`to_tsvector('spanish', ${t.nombre} || ' ' || COALESCE(${t.marca},''))`
  ),
}));

export const cadenas = pgTable('cadenas', {
  id: serial('id').primaryKey(),
  comercioId: integer('comercio_id').notNull(),
  banderaId: integer('bandera_id').notNull(),
  nombreDisplay: text('nombre_display').notNull(),
  grupo: text('grupo'),
  razonSocial: text('razon_social'),
  cuit: varchar('cuit', { length: 15 }),
  urlSitio: text('url_sitio'),
  urlLogo: text('url_logo'),
  activa: boolean('activa').default(true),
}, (t) => ({
  uniq: unique('cadenas_comercio_bandera_uniq').on(t.comercioId, t.banderaId),
}));

export const REGIONES = ['NACIONAL','AMBA','CENTRO','CUYO','NEA','NOA','PATAGONIA'] as const;
export type Region = (typeof REGIONES)[number];

export const preciosActuales = pgTable('precios_actuales', {
  ean: varchar('ean', { length: 20 }).notNull().references(() => productos.ean),
  cadenaId: integer('cadena_id').notNull().references(() => cadenas.id),
  region: varchar('region', { length: 15 }).notNull(),
  fecha: date('fecha').notNull(),
  precioLista: numeric('precio_lista', { precision: 12, scale: 2 }).notNull(),
  precioEfectivo: numeric('precio_efectivo', { precision: 12, scale: 2 }).notNull(),
  promoLeyenda: text('promo_leyenda'),
  promoVigenciaFin: date('promo_vigencia_fin'),
  sucursalesCount: integer('sucursales_count').notNull(),
  min90d: numeric('min_90d', { precision: 12, scale: 2 }),
  min90dFecha: date('min_90d_fecha'),
  delta7dPct: numeric('delta_7d_pct', { precision: 6, scale: 2 }),
  isMinHistorico: boolean('is_min_historico').default(false),
}, (t) => ({
  pk: primaryKey({ columns: [t.ean, t.cadenaId, t.region] }),
  regionCheck: check('region_valid', sql`${t.region} IN ('NACIONAL','AMBA','CENTRO','CUYO','NEA','NOA','PATAGONIA')`),
}));

export const snapshots = pgTable('snapshots', {
  ean: varchar('ean', { length: 20 }).notNull().references(() => productos.ean),
  cadenaId: integer('cadena_id').notNull().references(() => cadenas.id),
  region: varchar('region', { length: 15 }).notNull(),
  fecha: date('fecha').notNull(),
  tier: varchar('tier', { length: 10 }).notNull(),
  precioLista: numeric('precio_lista', { precision: 12, scale: 2 }).notNull(),
  precioEfectivo: numeric('precio_efectivo', { precision: 12, scale: 2 }).notNull(),
  promoLeyenda: text('promo_leyenda'),
}, (t) => ({
  pk: primaryKey({ columns: [t.ean, t.cadenaId, t.region, t.fecha] }),
  tierCheck: check('tier_valid', sql`${t.tier} IN ('daily','weekly')`),
  lookup: index('idx_snapshots_lookup').on(t.ean, t.region, t.fecha),
}));

export const jobRuns = pgTable('job_runs', {
  id: serial('id').primaryKey(),
  jobName: text('job_name').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  status: text('status').notNull(),
  rowsProcessed: integer('rows_processed'),
  skusNew: integer('skus_new'),
  skusUpdated: integer('skus_updated'),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata'),
}, (t) => ({
  recent: index('idx_job_runs_recent').on(t.startedAt),
}));
