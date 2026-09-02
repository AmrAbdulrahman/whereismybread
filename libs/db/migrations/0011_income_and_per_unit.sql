ALTER TABLE "month_incomes" ALTER COLUMN "amount_minor" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "month_incomes" ADD COLUMN "hours" double precision;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "income_mode" text DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "hourly_rate_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "monthly_hours" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "amount_kind" text DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "unit_name" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "default_units" double precision DEFAULT 1 NOT NULL;