ALTER TABLE "expenses" DROP CONSTRAINT "expenses_budget_id_budgets_id_fk";
--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "budget_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "date" date NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_user_date_idx" ON "expenses" USING btree ("user_id","date");