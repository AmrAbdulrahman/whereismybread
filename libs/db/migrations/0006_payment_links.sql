ALTER TABLE "banks" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "is_subscription" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_url" text;