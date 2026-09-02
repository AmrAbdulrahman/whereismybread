ALTER TABLE "payment_events" ALTER COLUMN "status" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "overrides" jsonb;