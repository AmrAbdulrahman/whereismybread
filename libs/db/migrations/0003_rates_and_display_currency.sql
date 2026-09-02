CREATE TABLE "exchange_rate_snapshots" (
	"base" text PRIMARY KEY NOT NULL,
	"rates" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_currency" text DEFAULT 'EUR' NOT NULL;