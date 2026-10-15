CREATE TABLE "app_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"level" text NOT NULL,
	"source" text NOT NULL,
	"message" text NOT NULL,
	"request_id" text,
	"user_id" uuid,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_stack" text
);
--> statement-breakpoint
ALTER TABLE "app_logs" ADD CONSTRAINT "app_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_logs_created_idx" ON "app_logs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "app_logs_level_idx" ON "app_logs" USING btree ("level","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "app_logs_source_idx" ON "app_logs" USING btree ("source","created_at" DESC NULLS LAST);