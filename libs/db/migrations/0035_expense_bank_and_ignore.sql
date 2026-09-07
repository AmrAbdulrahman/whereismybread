ALTER TABLE "expenses" ADD COLUMN "bank_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD COLUMN "bank_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD COLUMN "ignore_patterns" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_bank_id_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."banks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_bank_id_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."banks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_bank_idx" ON "expenses" USING btree ("bank_id");