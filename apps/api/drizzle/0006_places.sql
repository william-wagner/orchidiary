CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plant_locations" ADD COLUMN "place_id" uuid;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "places_user_name_uq" ON "places" USING btree ("user_id",lower("name"));--> statement-breakpoint
ALTER TABLE "plant_locations" ADD CONSTRAINT "plant_locations_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Preenche a partir dos nomes já digitados (plant_locations.label): um lugar por usuário e nome (sem diferenciar maiúsculas).
INSERT INTO "places" ("user_id", "name")
SELECT DISTINCT ON (p."user_id", lower(btrim(l."label"))) p."user_id", btrim(l."label")
FROM "plant_locations" l
JOIN "plants" p ON p."id" = l."plant_id"
WHERE btrim(coalesce(l."label", '')) <> ''
ORDER BY p."user_id", lower(btrim(l."label")), l."valid_from";--> statement-breakpoint
UPDATE "plant_locations" l
SET "place_id" = pl."id"
FROM "plants" p, "places" pl
WHERE p."id" = l."plant_id"
  AND pl."user_id" = p."user_id"
  AND lower(pl."name") = lower(btrim(l."label"));
