CREATE TYPE "public"."illustration_status" AS ENUM('pending', 'ready', 'error');--> statement-breakpoint
ALTER TYPE "public"."integration" ADD VALUE 'openai';--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "illustration_key" text;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "illustration_thumb_key" text;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "illustration_status" "illustration_status";--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "illustration_updated_at" timestamp with time zone;