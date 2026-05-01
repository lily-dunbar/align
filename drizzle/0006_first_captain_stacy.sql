CREATE TABLE "food_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"eaten_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"carbs_grams" integer,
	"protein_grams" integer,
	"fat_grams" integer,
	"calories" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_workouts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workout_type" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_min" integer,
	"intensity" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sleep_windows" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"sleep_start" timestamp with time zone NOT NULL,
	"sleep_end" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"quality_score" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "food_entries" ADD CONSTRAINT "food_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_workouts" ADD CONSTRAINT "manual_workouts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sleep_windows" ADD CONSTRAINT "sleep_windows_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_entries_user_eaten_at_idx" ON "food_entries" USING btree ("user_id","eaten_at");--> statement-breakpoint
CREATE INDEX "manual_workouts_user_started_at_idx" ON "manual_workouts" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "sleep_windows_user_sleep_start_idx" ON "sleep_windows" USING btree ("user_id","sleep_start");