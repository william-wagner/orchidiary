ALTER TABLE "taxa" DROP CONSTRAINT "taxa_origin_country_ck";--> statement-breakpoint
ALTER TABLE "taxa" ADD COLUMN "origin_country_codes" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
-- o país que já estava gravado vira o primeiro (principal) da lista
UPDATE "taxa" SET "origin_country_codes" = ARRAY["origin_country_code"] WHERE "origin_country_code" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "taxa" DROP COLUMN "origin_country_code";--> statement-breakpoint
ALTER TABLE "taxa" ADD CONSTRAINT "taxa_origin_countries_ck" CHECK (coalesce("taxa"."origin_kind" = 'country', false) = (cardinality("taxa"."origin_country_codes") > 0));
