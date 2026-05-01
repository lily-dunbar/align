CREATE TABLE "hourly_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"step_count" integer NOT NULL,
	"source" text DEFAULT 'apple_shortcuts' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hourly_steps" ADD CONSTRAINT "hourly_steps_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hourly_steps_user_bucket_source_uq" ON "hourly_steps" USING btree ("user_id","bucket_start","source");--> statement-breakpoint
CREATE INDEX "hourly_steps_user_bucket_idx" ON "hourly_steps" USING btree ("user_id","bucket_start");