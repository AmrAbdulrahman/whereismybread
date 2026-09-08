ALTER TABLE "expenses" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "brand_color" text;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "name_override" text;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "notes_override" text;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "triage_account_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "brand_color" text;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_triage_account_id_accounts_id_fk" FOREIGN KEY ("triage_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;