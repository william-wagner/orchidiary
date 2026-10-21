-- Localização e ambiente passam a ser do LUGAR.
--
-- A migração de dados vai junto, intercalada, porque as colunas novas são NOT NULL e os
-- checks não passariam com as linhas antigas. Premissa combinada: as plantas de um mesmo
-- lugar estão na mesma localização, então a coordenada do período mais recente de cada
-- lugar vira a coordenada dele, valendo desde o início do histórico daquele lugar.
CREATE TABLE "place_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"city" text,
	"state" text,
	"state_code" text,
	"country" text,
	"country_code" text,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "place_locations" ADD CONSTRAINT "place_locations_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "place_locations_place_idx" ON "place_locations" USING btree ("place_id","valid_from");--> statement-breakpoint
CREATE UNIQUE INDEX "place_locations_one_open_idx" ON "place_locations" USING btree ("place_id") WHERE "place_locations"."valid_to" is null;--> statement-breakpoint

-- Ambiente do lugar: vem do período mais recente das plantas dele; lugar sem planta fica outdoor.
ALTER TABLE "places" ADD COLUMN "environment" "environment";--> statement-breakpoint
UPDATE "places" p SET "environment" = ref."environment"
FROM (
  SELECT DISTINCT ON (pl."place_id") pl."place_id", pl."environment"
  FROM "plant_locations" pl
  WHERE pl."place_id" IS NOT NULL
  ORDER BY pl."place_id", (pl."valid_to" IS NULL) DESC, pl."valid_from" DESC
) ref
WHERE p."id" = ref."place_id";--> statement-breakpoint
UPDATE "places" SET "environment" = 'outdoor' WHERE "environment" IS NULL;--> statement-breakpoint
ALTER TABLE "places" ALTER COLUMN "environment" SET NOT NULL;--> statement-breakpoint

-- Uma localização aberta por lugar, desde o início do histórico dele.
INSERT INTO "place_locations" ("place_id","lat","lng","city","state","state_code","country","country_code","valid_from")
SELECT ref."place_id", ref."lat", ref."lng", ref."city", ref."state", ref."state_code", ref."country", ref."country_code", span."since"
FROM (
  SELECT DISTINCT ON (pl."place_id")
         pl."place_id", pl."lat", pl."lng", pl."city", pl."state", pl."state_code", pl."country", pl."country_code"
  FROM "plant_locations" pl
  WHERE pl."place_id" IS NOT NULL
  ORDER BY pl."place_id", (pl."valid_to" IS NULL) DESC, pl."valid_from" DESC
) ref
JOIN (
  SELECT "place_id", min("valid_from") AS "since" FROM "plant_locations" WHERE "place_id" IS NOT NULL GROUP BY "place_id"
) span ON span."place_id" = ref."place_id";--> statement-breakpoint

-- Clima: a fonte passa a ser o período do lugar ou o da planta sem lugar.
ALTER TABLE "weather_daily" ADD COLUMN "place_location_id" uuid;--> statement-breakpoint
ALTER TABLE "weather_daily" ADD CONSTRAINT "weather_daily_place_location_id_place_locations_id_fk" FOREIGN KEY ("place_location_id") REFERENCES "public"."place_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weather_daily" ALTER COLUMN "location_id" DROP NOT NULL;--> statement-breakpoint

-- As séries por planta de um mesmo lugar eram idênticas: viram uma só, a do lugar.
INSERT INTO "weather_daily" (
  "place_location_id","date","temp_min","temp_max","temp_mean","humidity_mean","humidity_min","humidity_max",
  "dew_point_mean","vpd_mean","vpd_max","precipitation","radiation","sunshine_hours","et0","wind_max","source","fetched_at"
)
SELECT DISTINCT ON (ploc."id", w."date")
       ploc."id", w."date", w."temp_min", w."temp_max", w."temp_mean", w."humidity_mean", w."humidity_min", w."humidity_max",
       w."dew_point_mean", w."vpd_mean", w."vpd_max", w."precipitation", w."radiation", w."sunshine_hours", w."et0", w."wind_max",
       w."source", w."fetched_at"
FROM "weather_daily" w
JOIN "plant_locations" pl ON pl."id" = w."location_id"
JOIN "place_locations" ploc ON ploc."place_id" = pl."place_id"
WHERE pl."place_id" IS NOT NULL AND w."date" >= (ploc."valid_from" AT TIME ZONE 'UTC')::date
ORDER BY ploc."id", w."date", w."fetched_at" DESC;--> statement-breakpoint
DELETE FROM "weather_daily" w USING "plant_locations" pl WHERE pl."id" = w."location_id" AND pl."place_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "weather_daily_place_location_date_idx" ON "weather_daily" USING btree ("place_location_id","date");--> statement-breakpoint
ALTER TABLE "weather_daily" ADD CONSTRAINT "weather_daily_source_ck" CHECK (num_nonnulls("weather_daily"."place_location_id", "weather_daily"."location_id") = 1);--> statement-breakpoint

-- Período da planta: num lugar, a localização e o ambiente são os dele.
ALTER TABLE "plant_locations" ALTER COLUMN "lat" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "plant_locations" ALTER COLUMN "lng" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "plant_locations" ALTER COLUMN "environment" DROP NOT NULL;--> statement-breakpoint
UPDATE "plant_locations"
SET "lat" = NULL, "lng" = NULL, "environment" = NULL,
    "city" = NULL, "state" = NULL, "state_code" = NULL, "country" = NULL, "country_code" = NULL
WHERE "place_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "plant_locations" ADD CONSTRAINT "plant_locations_source_ck" CHECK (("plant_locations"."place_id" is not null and "plant_locations"."lat" is null and "plant_locations"."lng" is null and "plant_locations"."environment" is null)
        or ("plant_locations"."place_id" is null and "plant_locations"."lat" is not null and "plant_locations"."lng" is not null and "plant_locations"."environment" is not null));
