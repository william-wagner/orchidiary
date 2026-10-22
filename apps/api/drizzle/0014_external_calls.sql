CREATE TABLE "external_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"service" text NOT NULL,
	"operation" text NOT NULL,
	"method" text NOT NULL,
	"host" text NOT NULL,
	"path" text NOT NULL,
	"query" text,
	"outcome" text NOT NULL,
	"status" integer,
	"duration_ms" integer NOT NULL,
	"ttfb_ms" integer,
	"request_bytes" integer,
	"response_bytes" integer,
	"attempt" integer DEFAULT 1 NOT NULL,
	"error_code" text,
	"error_excerpt" text,
	"request_id" text,
	"origin" text,
	"user_id" uuid,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "external_calls" ADD CONSTRAINT "external_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "external_calls_started_idx" ON "external_calls" USING btree ("started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "external_calls_service_idx" ON "external_calls" USING btree ("service","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "external_calls_request_idx" ON "external_calls" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "external_calls_failed_idx" ON "external_calls" USING btree ("started_at" DESC NULLS LAST) WHERE "external_calls"."outcome" <> 'ok';