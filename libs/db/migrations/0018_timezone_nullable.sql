ALTER TABLE "users" ALTER COLUMN "timezone" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "timezone" DROP NOT NULL;--> statement-breakpoint
-- Existing `UTC` was the column default, not a deliberate choice — treat it as
-- "auto-detect" so those users pick up their real zone from the browser.
UPDATE "users" SET "timezone" = NULL WHERE "timezone" = 'UTC';
