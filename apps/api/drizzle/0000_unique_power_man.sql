CREATE TYPE "public"."environment" AS ENUM('indoor', 'outdoor');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('note', 'watering', 'fertilizing', 'repotting', 'bloom_start', 'bloom_end', 'new_growth', 'new_root', 'keiki', 'pest', 'disease', 'treatment', 'moved');--> statement-breakpoint
CREATE TYPE "public"."integration" AS ENUM('telegram', 'google_drive');--> statement-breakpoint
CREATE TYPE "public"."photo_source" AS ENUM('camera', 'upload');--> statement-breakpoint
CREATE TYPE "public"."plant_origin" AS ENUM('purchase', 'trade', 'gift', 'division', 'keiki', 'seed', 'rescue', 'other');--> statement-breakpoint
CREATE TYPE "public"."plant_status" AS ENUM('active', 'dormant', 'in_treatment', 'given_away', 'dead');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('master', 'user');--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plant_id" uuid,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"channel" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alerts_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "backup_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"drive_file_id" text,
	"size_bytes" integer,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "event_type" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"notes" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"photo_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_settings" (
	"key" "integration" PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secrets_enc" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "manual_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	"temperature" real,
	"humidity" real,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"thumb_key" text,
	"mime_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"size_bytes" integer,
	"taken_at" timestamp with time zone NOT NULL,
	"source" "photo_source" NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"accuracy" real,
	"location_id" uuid,
	"distance_from_plant_m" integer,
	"caption" text,
	"drive_file_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plant_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plant_id" uuid NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"label" text,
	"environment" "environment" NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"species_id" uuid,
	"taxon_text" text,
	"nickname" text NOT NULL,
	"status" "plant_status" DEFAULT 'active' NOT NULL,
	"origin" "plant_origin",
	"acquired_at" timestamp with time zone,
	"parent_plant_id" uuid,
	"pot_notes" text,
	"substrate" text,
	"notes" text,
	"cover_photo_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "species" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"genus" text NOT NULL,
	"epithet" text,
	"display_name" text NOT NULL,
	"common_names" text[] DEFAULT '{}'::text[] NOT NULL,
	"temp_day_min" real,
	"temp_day_max" real,
	"temp_night_min" real,
	"temp_night_max" real,
	"humidity_min" real,
	"humidity_max" real,
	"light" text,
	"watering" text,
	"fertilizing" text,
	"substrate" text,
	"bloom_months" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"rest_period" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"password_hash" text NOT NULL,
	"telegram_chat_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "weather_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"date" date NOT NULL,
	"temp_min" real,
	"temp_max" real,
	"temp_mean" real,
	"humidity_mean" real,
	"humidity_min" real,
	"humidity_max" real,
	"dew_point_mean" real,
	"vpd_mean" real,
	"vpd_max" real,
	"precipitation" real,
	"radiation" real,
	"sunshine_hours" real,
	"et0" real,
	"wind_max" real,
	"source" text DEFAULT 'open-meteo' NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_settings" ADD CONSTRAINT "integration_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_readings" ADD CONSTRAINT "manual_readings_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_readings" ADD CONSTRAINT "manual_readings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_location_id_plant_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."plant_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_locations" ADD CONSTRAINT "plant_locations_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plants" ADD CONSTRAINT "plants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plants" ADD CONSTRAINT "plants_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plants" ADD CONSTRAINT "plants_parent_plant_id_plants_id_fk" FOREIGN KEY ("parent_plant_id") REFERENCES "public"."plants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weather_daily" ADD CONSTRAINT "weather_daily_location_id_plant_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."plant_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_plant_idx" ON "events" USING btree ("plant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "manual_readings_plant_idx" ON "manual_readings" USING btree ("plant_id","measured_at");--> statement-breakpoint
CREATE INDEX "photos_plant_idx" ON "photos" USING btree ("plant_id","taken_at");--> statement-breakpoint
CREATE INDEX "plant_locations_plant_idx" ON "plant_locations" USING btree ("plant_id","valid_from");--> statement-breakpoint
CREATE UNIQUE INDEX "plant_locations_one_open_idx" ON "plant_locations" USING btree ("plant_id") WHERE "plant_locations"."valid_to" is null;--> statement-breakpoint
CREATE INDEX "plants_user_idx" ON "plants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "species_display_name_idx" ON "species" USING btree ("display_name");--> statement-breakpoint
CREATE UNIQUE INDEX "weather_daily_location_date_idx" ON "weather_daily" USING btree ("location_id","date");