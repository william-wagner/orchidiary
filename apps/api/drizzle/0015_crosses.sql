CREATE TYPE "public"."cross_side" AS ENUM('seed', 'pollen');--> statement-breakpoint
CREATE TABLE "crosses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"seed_taxon_id" uuid,
	"seed_text" text,
	"pollen_taxon_id" uuid,
	"pollen_text" text,
	"care_from" "cross_side",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crosses_seed_ck" CHECK ("crosses"."seed_taxon_id" is null or "crosses"."seed_text" is null),
	CONSTRAINT "crosses_pollen_ck" CHECK ("crosses"."pollen_taxon_id" is null or "crosses"."pollen_text" is null),
	CONSTRAINT "crosses_care_ck" CHECK ("crosses"."care_from" is null
        or ("crosses"."care_from" = 'seed' and "crosses"."seed_taxon_id" is not null)
        or ("crosses"."care_from" = 'pollen' and "crosses"."pollen_taxon_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "plants" DROP CONSTRAINT "plants_taxon_id_taxa_id_fk";
--> statement-breakpoint
ALTER TABLE "plants" ADD COLUMN "cross_id" uuid;--> statement-breakpoint
ALTER TABLE "plants" ADD COLUMN "received_name" text;--> statement-breakpoint
ALTER TABLE "taxa" ADD COLUMN "cross_id" uuid;--> statement-breakpoint
ALTER TABLE "crosses" ADD CONSTRAINT "crosses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crosses" ADD CONSTRAINT "crosses_seed_taxon_id_taxa_id_fk" FOREIGN KEY ("seed_taxon_id") REFERENCES "public"."taxa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crosses" ADD CONSTRAINT "crosses_pollen_taxon_id_taxa_id_fk" FOREIGN KEY ("pollen_taxon_id") REFERENCES "public"."taxa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crosses_user_idx" ON "crosses" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "plants" ADD CONSTRAINT "plants_cross_id_crosses_id_fk" FOREIGN KEY ("cross_id") REFERENCES "public"."crosses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plants" ADD CONSTRAINT "plants_taxon_id_taxa_id_fk" FOREIGN KEY ("taxon_id") REFERENCES "public"."taxa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxa" ADD CONSTRAINT "taxa_cross_id_crosses_id_fk" FOREIGN KEY ("cross_id") REFERENCES "public"."crosses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plants_cross_idx" ON "plants" USING btree ("cross_id");--> statement-breakpoint
ALTER TABLE "plants" ADD CONSTRAINT "plants_determination_ck" CHECK (num_nonnulls("plants"."taxon_id", "plants"."cross_id") <= 1);--> statement-breakpoint
ALTER TABLE "taxa" ADD CONSTRAINT "taxa_cross_rank_ck" CHECK ("taxa"."cross_id" is null or "taxa"."rank" = 'hybrid');--> statement-breakpoint
-- o nome livre de hoje já é o texto da etiqueta: passa para a coluna nova antes de a antiga sair (0016)
UPDATE "plants" SET "received_name" = "taxon_text" WHERE "taxon_text" IS NOT NULL;