CREATE TABLE "glucose_readings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"mgdl" integer NOT NULL,
	"trend" text,
	"trend_rate" integer,
	"source" text DEFAULT 'dexcom' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "glucose_readings" ADD CONSTRAINT "glucose_readings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "glucose_readings_user_observed_at_uq" ON "glucose_readings" USING btree ("user_id","observed_at");--> statement-breakpoint
CREATE INDEX "glucose_readings_user_observed_at_idx" ON "glucose_readings" USING btree ("user_id","observed_at");