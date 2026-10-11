-- The Even Realities G2 glasses feature is removed: its pairing codes, device
-- tokens, compiled questions and the internal OAuth client of its compiler.

DROP TABLE IF EXISTS "glasses_questions";
--> statement-breakpoint
DROP TABLE IF EXISTS "glasses_tokens";
--> statement-breakpoint
DROP TABLE IF EXISTS "glasses_pair_codes";
--> statement-breakpoint
DELETE FROM "oauth_clients" WHERE "client_id" = 'learnforge-glasses-compiler';
