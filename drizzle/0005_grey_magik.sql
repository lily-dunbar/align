CREATE TABLE "step_ingest_tokens" (
	"user_id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "step_ingest_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "step_ingest_tokens" ADD CONSTRAINT "step_ingest_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "step_ingest_tokens_token_idx" ON "step_ingest_tokens" USING btree ("token");