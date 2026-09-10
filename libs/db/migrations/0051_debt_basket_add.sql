CREATE TABLE "debt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"debt_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"denom_kind" text DEFAULT 'money' NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"gold_type" text,
	"gold_label" text,
	"gold_unit" text,
	"amount_minor" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "debt_entries" ADD COLUMN "denom_kind" text DEFAULT 'money' NOT NULL;--> statement-breakpoint
ALTER TABLE "debt_entries" ADD COLUMN "currency" text DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE "debt_entries" ADD COLUMN "gold_type" text;--> statement-breakpoint
ALTER TABLE "debt_entries" ADD COLUMN "gold_label" text;--> statement-breakpoint
ALTER TABLE "debt_entries" ADD COLUMN "gold_unit" text;--> statement-breakpoint
ALTER TABLE "debt_lines" ADD CONSTRAINT "debt_lines_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_lines" ADD CONSTRAINT "debt_lines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "debt_lines_debt_idx" ON "debt_lines" USING btree ("debt_id");--> statement-breakpoint
INSERT INTO "debt_lines" ("id", "debt_id", "user_id", "denom_kind", "currency", "gold_type", "gold_label", "gold_unit", "amount_minor", "sort_order", "created_at")
SELECT gen_random_uuid(), d."id", d."user_id", d."denom_kind", d."currency", d."gold_type", d."gold_label", d."gold_unit", d."principal_minor", 0, d."created_at"
FROM "debts" d;
--> statement-breakpoint
UPDATE "debt_entries" e SET "denom_kind" = d."denom_kind", "currency" = d."currency", "gold_type" = d."gold_type", "gold_label" = d."gold_label", "gold_unit" = d."gold_unit"
FROM "debts" d WHERE d."id" = e."debt_id";
