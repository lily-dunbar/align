CREATE TABLE "activities" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text DEFAULT 'strava' NOT NULL,
	"provider_activity_id" text NOT NULL,
	"name" text,
	"activity_type" text,
	"sport_type" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone,
	"duration_sec" integer,
	"distance_meters" integer,
	"moving_time_sec" integer,
	"elapsed_time_sec" integer,
	"total_elevation_gain_meters" integer,
	"average_heartrate" integer,
	"max_heartrate" integer,
	"average_watts" integer,
	"kilojoules" integer,
	"calories" integer,
	"source_payload" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strava_tokens" (
	"user_id" text PRIMARY KEY NOT NULL,
	"athlete_id" text,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"scope" text,
	"token_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strava_tokens" ADD CONSTRAINT "strava_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activities_user_provider_activity_uq" ON "activities" USING btree ("user_id","provider","provider_activity_id");--> statement-breakpoint
CREATE INDEX "activities_user_start_at_idx" ON "activities" USING btree ("user_id","start_at");--> statement-breakpoint
CREATE INDEX "strava_tokens_user_id_idx" ON "strava_tokens" USING btree ("user_id");