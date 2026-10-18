CREATE TYPE "public"."taxon_origin_kind" AS ENUM('country', 'cross');--> statement-breakpoint
ALTER TABLE "taxa" ADD COLUMN "origin_kind" "taxon_origin_kind";--> statement-breakpoint
ALTER TABLE "taxa" ADD COLUMN "origin_country_code" text;--> statement-breakpoint
ALTER TABLE "taxa" ADD CONSTRAINT "taxa_origin_country_ck" CHECK (coalesce("taxa"."origin_kind" = 'country', false) = ("taxa"."origin_country_code" is not null));--> statement-breakpoint
-- híbridos registrados e gêneros híbridos já cadastrados são cruzamentos, sem lugar de origem
UPDATE "taxa" SET "origin_kind" = 'cross' WHERE "rank" IN ('hybrid', 'nothogenus');
