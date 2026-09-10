ALTER TABLE "debts" ADD COLUMN "denom_kind" text DEFAULT 'money' NOT NULL;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "gold_type" text;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "gold_label" text;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "gold_unit" text;