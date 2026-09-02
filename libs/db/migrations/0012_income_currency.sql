ALTER TABLE "month_incomes" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "income_currency" text DEFAULT 'EUR' NOT NULL;