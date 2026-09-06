ALTER TABLE "bank_balances" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bank_connections" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "push_subscriptions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "bank_balances" CASCADE;--> statement-breakpoint
DROP TABLE "bank_connections" CASCADE;--> statement-breakpoint
DROP TABLE "push_subscriptions" CASCADE;--> statement-breakpoint
ALTER TABLE "bank_transactions" DROP CONSTRAINT IF EXISTS "bank_transactions_balance_id_bank_balances_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "bank_transactions_balance_external_idx";--> statement-breakpoint
ALTER TABLE "bank_transactions" ALTER COLUMN "external_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_transactions" DROP COLUMN "balance_id";--> statement-breakpoint
ALTER TABLE "bank_transactions" DROP COLUMN "fee_minor";--> statement-breakpoint
ALTER TABLE "bank_transactions" DROP COLUMN "notified_at";--> statement-breakpoint
DROP TYPE "public"."bank_connection_status";--> statement-breakpoint
DROP TYPE "public"."bank_provider";