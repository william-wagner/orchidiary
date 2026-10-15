CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."taxon_rank" AS ENUM('family', 'subfamily', 'tribe', 'subtribe', 'genus', 'nothogenus', 'species', 'subspecies', 'variety', 'form', 'hybrid', 'cultivar');--> statement-breakpoint
CREATE TABLE "taxa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"rank" "taxon_rank" NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"search_text" text NOT NULL,
	"common_names" text[] DEFAULT '{}'::text[] NOT NULL,
	"temp_day_min" real,
	"temp_day_max" real,
	"temp_night_min" real,
	"temp_night_max" real,
	"humidity_min" real,
	"humidity_max" real,
	"light" text,
	"watering" text,
	"fertilizing" text,
	"substrate" text,
	"bloom_months" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"rest_period" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "taxa_parent_rank_name_uq" UNIQUE NULLS NOT DISTINCT("parent_id","rank","name")
);
--> statement-breakpoint
ALTER TABLE "plants" ADD COLUMN "taxon_id" uuid;--> statement-breakpoint
ALTER TABLE "taxa" ADD CONSTRAINT "taxa_parent_id_taxa_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."taxa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "taxa_parent_idx" ON "taxa" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "taxa_higher_name_uq" ON "taxa" USING btree ("rank","name") WHERE "taxa"."rank" in ('family', 'subfamily', 'tribe', 'subtribe', 'genus', 'nothogenus');--> statement-breakpoint
CREATE INDEX "taxa_search_trgm_idx" ON "taxa" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "plants" ADD CONSTRAINT "plants_taxon_id_taxa_id_fk" FOREIGN KEY ("taxon_id") REFERENCES "public"."taxa"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plants_taxon_idx" ON "plants" USING btree ("taxon_id");--> statement-breakpoint
-- Dados: cada ficha antiga vira um táxon. Os gêneros nascem soltos; o seed os
-- encaixa na árvore e recalcula full_name/search_text com a regra do shared.
INSERT INTO "taxa" ("rank", "name", "full_name", "search_text")
SELECT DISTINCT 'genus'::taxon_rank, "genus", "genus", lower("genus") FROM "species"
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Fichas sem epíteto ("Vanda (híbridos)") eram do gênero: a ficha passa para ele
UPDATE "taxa" t SET
  "common_names" = s."common_names",
  "temp_day_min" = s."temp_day_min", "temp_day_max" = s."temp_day_max",
  "temp_night_min" = s."temp_night_min", "temp_night_max" = s."temp_night_max",
  "humidity_min" = s."humidity_min", "humidity_max" = s."humidity_max",
  "light" = s."light", "watering" = s."watering", "fertilizing" = s."fertilizing",
  "substrate" = s."substrate", "bloom_months" = s."bloom_months",
  "rest_period" = s."rest_period", "notes" = s."notes"
FROM "species" s
WHERE s."epithet" IS NULL AND t."rank" = 'genus' AND t."name" = s."genus";--> statement-breakpoint
INSERT INTO "taxa" (
  "parent_id", "rank", "name", "full_name", "search_text", "common_names",
  "temp_day_min", "temp_day_max", "temp_night_min", "temp_night_max", "humidity_min", "humidity_max",
  "light", "watering", "fertilizing", "substrate", "bloom_months", "rest_period", "notes"
)
SELECT g."id", 'species', s."epithet", s."genus" || ' ' || s."epithet", lower(s."genus" || ' ' || s."epithet"), s."common_names",
  s."temp_day_min", s."temp_day_max", s."temp_night_min", s."temp_night_max", s."humidity_min", s."humidity_max",
  s."light", s."watering", s."fertilizing", s."substrate", s."bloom_months", s."rest_period", s."notes"
FROM "species" s
JOIN "taxa" g ON g."rank" = 'genus' AND g."name" = s."genus"
WHERE s."epithet" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Plantas passam a apontar para o táxon; o nome livre fica só para quem não tem táxon
UPDATE "plants" p SET "taxon_id" = coalesce(sp."id", g."id"), "taxon_text" = NULL
FROM "species" s
JOIN "taxa" g ON g."rank" = 'genus' AND g."name" = s."genus"
LEFT JOIN "taxa" sp ON sp."parent_id" = g."id" AND sp."rank" = 'species' AND sp."name" = s."epithet"
WHERE p."species_id" = s."id";
