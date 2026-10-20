CREATE TYPE "public"."comfort_dimension" AS ENUM('night', 'day', 'humidity');--> statement-breakpoint
CREATE TABLE "comfort_silences" (
	"plant_id" uuid NOT NULL,
	"dimension" "comfort_dimension" NOT NULL,
	"location_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comfort_silences_plant_id_dimension_pk" PRIMARY KEY("plant_id","dimension")
);
--> statement-breakpoint
ALTER TABLE "comfort_silences" ADD CONSTRAINT "comfort_silences_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comfort_silences" ADD CONSTRAINT "comfort_silences_location_id_plant_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."plant_locations"("id") ON DELETE cascade ON UPDATE no action;