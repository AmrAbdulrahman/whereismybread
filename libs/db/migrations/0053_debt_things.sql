CREATE TABLE "debt_things" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"unit" text DEFAULT 'piece' NOT NULL,
	"value_minor" integer DEFAULT 0 NOT NULL,
	"value_currency" text DEFAULT 'EUR' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "debt_entries" ADD COLUMN "thing_id" uuid;--> statement-breakpoint
ALTER TABLE "debt_entries" ADD COLUMN "thing_name" text;--> statement-breakpoint
ALTER TABLE "debt_lines" ADD COLUMN "thing_id" uuid;--> statement-breakpoint
ALTER TABLE "debt_lines" ADD COLUMN "thing_name" text;--> statement-breakpoint
ALTER TABLE "debt_things" ADD CONSTRAINT "debt_things_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "debt_things_user_idx" ON "debt_things" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "debt_things_user_name_idx" ON "debt_things" USING btree ("user_id",lower("name"));--> statement-breakpoint
ALTER TABLE "debt_entries" ADD CONSTRAINT "debt_entries_thing_id_debt_things_id_fk" FOREIGN KEY ("thing_id") REFERENCES "public"."debt_things"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_lines" ADD CONSTRAINT "debt_lines_thing_id_debt_things_id_fk" FOREIGN KEY ("thing_id") REFERENCES "public"."debt_things"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Backfill: legacy custom-gold rows become entries in the debt_things catalogue.
INSERT INTO "debt_things" ("id", "user_id", "name", "unit", "value_minor", "value_currency", "created_at", "updated_at")
SELECT gen_random_uuid(), s."user_id", MAX(s."gold_label"),
       COALESCE(MAX(s."gold_unit"), 'piece'), 0, 'EUR', now(), now()
FROM (
  SELECT "user_id", "gold_label", "gold_unit" FROM "debt_lines"
  WHERE "gold_type" = 'custom' AND "gold_label" IS NOT NULL
  UNION ALL
  SELECT "user_id", "gold_label", "gold_unit" FROM "debt_entries"
  WHERE "gold_type" = 'custom' AND "gold_label" IS NOT NULL
) s
GROUP BY s."user_id", lower(s."gold_label")
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "debt_lines" l
SET "denom_kind" = 'thing', "thing_id" = t."id", "thing_name" = t."name", "gold_type" = NULL, "gold_label" = NULL
FROM "debt_things" t
WHERE l."gold_type" = 'custom' AND l."gold_label" IS NOT NULL
  AND t."user_id" = l."user_id" AND lower(t."name") = lower(l."gold_label");
--> statement-breakpoint
UPDATE "debt_entries" e
SET "denom_kind" = 'thing', "thing_id" = t."id", "thing_name" = t."name", "gold_type" = NULL, "gold_label" = NULL
FROM "debt_things" t
WHERE e."gold_type" = 'custom' AND e."gold_label" IS NOT NULL
  AND t."user_id" = e."user_id" AND lower(t."name") = lower(e."gold_label");