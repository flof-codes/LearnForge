CREATE TABLE "anki_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"filename" varchar(255) NOT NULL,
	"status" text DEFAULT 'analyzing' NOT NULL,
	"package_version" text,
	"options" jsonb,
	"preview" jsonb,
	"stats" jsonb,
	"error" text,
	"staged_path" text,
	"progress_done" integer DEFAULT 0 NOT NULL,
	"progress_total" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "anki_records" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"import_id" uuid,
	"kind" text NOT NULL,
	"anki_key" text NOT NULL,
	"local_id" uuid,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anki_records_key_uq" UNIQUE("user_id","kind","anki_key")
);
--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "suspended_by" text;--> statement-breakpoint
-- Every card suspended so far was suspended because its cloze gap vanished.
UPDATE "cards" SET "suspended_by" = 'gap' WHERE "suspended";--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "size_bytes" integer;--> statement-breakpoint
ALTER TABLE "note_types" ADD COLUMN "anki_key" text;--> statement-breakpoint
ALTER TABLE "note_types" ADD COLUMN "anki_schema" text;--> statement-breakpoint
ALTER TABLE "anki_imports" ADD CONSTRAINT "anki_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anki_records" ADD CONSTRAINT "anki_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anki_records" ADD CONSTRAINT "anki_records_import_id_anki_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."anki_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anki_imports_user_idx" ON "anki_imports" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "images_user_hash_idx" ON "images" USING btree ("user_id","content_hash");--> statement-breakpoint
CREATE INDEX "note_types_anki_idx" ON "note_types" USING btree ("user_id","anki_key");--> statement-breakpoint
-- Share copies could give one user the same guid twice; the oldest note keeps it.
UPDATE "notes" n SET "anki_guid" = NULL WHERE n."anki_guid" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "notes" o WHERE o."user_id" = n."user_id" AND o."anki_guid" = n."anki_guid"
    AND (o."created_at", o."id") < (n."created_at", n."id"));--> statement-breakpoint
CREATE UNIQUE INDEX "notes_user_guid_uq" ON "notes" USING btree ("user_id","anki_guid") WHERE anki_guid IS NOT NULL;