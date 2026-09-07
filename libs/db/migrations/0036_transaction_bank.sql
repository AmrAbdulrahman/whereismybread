ALTER TABLE "bank_transactions" ADD COLUMN "bank_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_id_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."banks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_transactions_bank_idx" ON "bank_transactions" USING btree ("bank_id");