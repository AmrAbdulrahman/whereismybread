ALTER TYPE "public"."bank_connection_status" ADD VALUE 'pending';--> statement-breakpoint
ALTER TYPE "public"."bank_provider" ADD VALUE 'yapily';--> statement-breakpoint
ALTER TABLE "bank_balances" ALTER COLUMN "wise_balance_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_connections" ALTER COLUMN "wise_profile_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_balances" ADD COLUMN "external_account_id" text;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD COLUMN "external_ref" text;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD COLUMN "provider_consent_id" text;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD COLUMN "consent_expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "bank_connections" SET "external_ref" = "wise_profile_id" WHERE "wise_profile_id" IS NOT NULL AND "external_ref" IS NULL;--> statement-breakpoint
UPDATE "bank_balances" SET "external_account_id" = "wise_balance_id" WHERE "wise_balance_id" IS NOT NULL AND "external_account_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_balances_connection_account_idx" ON "bank_balances" USING btree ("connection_id","external_account_id");