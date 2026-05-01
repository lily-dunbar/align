CREATE TABLE "user_display_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"show_steps" boolean DEFAULT true NOT NULL,
	"show_activity" boolean DEFAULT true NOT NULL,
	"show_sleep" boolean DEFAULT true NOT NULL,
	"show_food" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_display_preferences" ADD CONSTRAINT "user_display_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;