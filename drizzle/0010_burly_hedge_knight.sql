ALTER TABLE "user_display_preferences" ADD COLUMN "target_low_mgdl" integer DEFAULT 70 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_display_preferences" ADD COLUMN "target_high_mgdl" integer DEFAULT 180 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_display_preferences" ADD COLUMN "align_mentor_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_display_preferences" ADD COLUMN "target_tir_percent" integer DEFAULT 70 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_display_preferences" ADD COLUMN "target_steps_per_day" integer DEFAULT 10000 NOT NULL;