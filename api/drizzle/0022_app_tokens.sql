CREATE TABLE "app_pair_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(8) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"app" text NOT NULL,
	"device" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by_user_id" uuid,
	CONSTRAINT "app_pair_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "app_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"app" text NOT NULL,
	"device" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "app_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "source_ref" text;--> statement-breakpoint
ALTER TABLE "app_pair_codes" ADD CONSTRAINT "app_pair_codes_claimed_by_user_id_users_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_tokens" ADD CONSTRAINT "app_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_tokens_user_idx" ON "app_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notes_user_source_ref_uq" ON "notes" USING btree ("user_id","source_ref") WHERE source_ref IS NOT NULL;