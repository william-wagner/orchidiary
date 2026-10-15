ALTER TABLE "plants" DROP CONSTRAINT "plants_species_id_species_id_fk";--> statement-breakpoint
ALTER TABLE "plants" DROP COLUMN "species_id";--> statement-breakpoint
DROP TABLE "species";
