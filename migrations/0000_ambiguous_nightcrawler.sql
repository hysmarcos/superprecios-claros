CREATE TABLE IF NOT EXISTS "cadenas" (
	"id" serial PRIMARY KEY NOT NULL,
	"comercio_id" integer NOT NULL,
	"bandera_id" integer NOT NULL,
	"nombre_display" text NOT NULL,
	"grupo" text,
	"razon_social" text,
	"cuit" varchar(15),
	"url_sitio" text,
	"url_logo" text,
	"activa" boolean DEFAULT true,
	CONSTRAINT "cadenas_comercio_bandera_uniq" UNIQUE("comercio_id","bandera_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"rows_processed" integer,
	"skus_new" integer,
	"skus_updated" integer,
	"error_message" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "precios_actuales" (
	"ean" varchar(20) NOT NULL,
	"cadena_id" integer NOT NULL,
	"region" varchar(15) NOT NULL,
	"fecha" date NOT NULL,
	"precio_lista" numeric(12, 2) NOT NULL,
	"precio_efectivo" numeric(12, 2) NOT NULL,
	"promo_leyenda" text,
	"promo_vigencia_fin" date,
	"sucursales_count" integer NOT NULL,
	"min_90d" numeric(12, 2),
	"min_90d_fecha" date,
	"delta_7d_pct" numeric(6, 2),
	"is_min_historico" boolean DEFAULT false,
	CONSTRAINT "precios_actuales_ean_cadena_id_region_pk" PRIMARY KEY("ean","cadena_id","region"),
	CONSTRAINT "region_valid" CHECK ("precios_actuales"."region" IN ('NACIONAL','AMBA','CENTRO','CUYO','NEA','NOA','PATAGONIA'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "productos" (
	"ean" varchar(20) PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"marca" text,
	"cantidad_presentacion" numeric(10, 3),
	"unidad_medida" varchar(10),
	"first_seen" date NOT NULL,
	"last_seen" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "snapshots" (
	"ean" varchar(20) NOT NULL,
	"cadena_id" integer NOT NULL,
	"region" varchar(15) NOT NULL,
	"fecha" date NOT NULL,
	"tier" varchar(10) NOT NULL,
	"precio_lista" numeric(12, 2) NOT NULL,
	"precio_efectivo" numeric(12, 2) NOT NULL,
	"promo_leyenda" text,
	CONSTRAINT "snapshots_ean_cadena_id_region_fecha_pk" PRIMARY KEY("ean","cadena_id","region","fecha"),
	CONSTRAINT "tier_valid" CHECK ("snapshots"."tier" IN ('daily','weekly'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "precios_actuales" ADD CONSTRAINT "precios_actuales_ean_productos_ean_fk" FOREIGN KEY ("ean") REFERENCES "public"."productos"("ean") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "precios_actuales" ADD CONSTRAINT "precios_actuales_cadena_id_cadenas_id_fk" FOREIGN KEY ("cadena_id") REFERENCES "public"."cadenas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_ean_productos_ean_fk" FOREIGN KEY ("ean") REFERENCES "public"."productos"("ean") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_cadena_id_cadenas_id_fk" FOREIGN KEY ("cadena_id") REFERENCES "public"."cadenas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_job_runs_recent" ON "job_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_productos_nombre_fts" ON "productos" USING gin (to_tsvector('spanish', "nombre" || ' ' || COALESCE("marca",'')));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_snapshots_lookup" ON "snapshots" USING btree ("ean","region","fecha");