-- The study start screen's last choices move to the server, so a session begun
-- in the browser continues the same way on the phone.

ALTER TABLE "tutor_settings" ADD COLUMN IF NOT EXISTS "study_difficulty" real;
--> statement-breakpoint
ALTER TABLE "tutor_settings" ADD COLUMN IF NOT EXISTS "study_answer_by" text[];
