ALTER TABLE "banks" DROP COLUMN IF EXISTS "url";--> statement-breakpoint
ALTER TABLE "banks" DROP COLUMN IF EXISTS "logo_url";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN IF EXISTS "provider_url";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "brand_color" text;
