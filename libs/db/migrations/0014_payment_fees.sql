ALTER TABLE "payments" ADD COLUMN "fee_kind" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "fee_fixed_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "fee_percent" double precision DEFAULT 0 NOT NULL;