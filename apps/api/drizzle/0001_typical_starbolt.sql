ALTER TABLE "plants" ADD COLUMN "accession_number" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "plants_user_accession_idx" ON "plants" USING btree ("user_id","accession_number");