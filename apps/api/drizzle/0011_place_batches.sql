CREATE TABLE "place_batch_exclusions" (
	"place_id" uuid NOT NULL,
	"type" "event_type" NOT NULL,
	"plant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_batch_exclusions_place_id_type_plant_id_pk" PRIMARY KEY("place_id","type","plant_id")
);
--> statement-breakpoint
ALTER TABLE "manual_readings" ALTER COLUMN "plant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "manual_readings" ADD COLUMN "place_id" uuid;--> statement-breakpoint
ALTER TABLE "place_batch_exclusions" ADD CONSTRAINT "place_batch_exclusions_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_batch_exclusions" ADD CONSTRAINT "place_batch_exclusions_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_readings" ADD CONSTRAINT "manual_readings_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_batch_idx" ON "events" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "manual_readings_place_idx" ON "manual_readings" USING btree ("place_id","measured_at");--> statement-breakpoint
ALTER TABLE "manual_readings" ADD CONSTRAINT "manual_readings_owner_ck" CHECK (num_nonnulls("manual_readings"."plant_id", "manual_readings"."place_id") = 1);