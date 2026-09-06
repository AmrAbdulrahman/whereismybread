ALTER TABLE "expenses" ADD COLUMN "occurred_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "occurred_has_time" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Interpret the wall-clock digits in the statement as UTC, so they display back unchanged.
SET LOCAL timezone = 'UTC';--> statement-breakpoint
-- Backfill times for already-imported Wise transactions from the preserved raw row
-- ("Date Time" like "06-09-2026 16:57:47.398").
UPDATE "bank_transactions"
SET "occurred_at" = to_timestamp(
      split_part("raw_payload"->>'Date Time', '.', 1),
      'DD-MM-YYYY HH24:MI:SS'
    ),
    "occurred_has_time" = true
WHERE "raw_payload" ? 'Date Time'
  AND coalesce("raw_payload"->>'Date Time', '') ~ '\d{1,2}[-/]\d{1,2}[-/]\d{4} \d{1,2}:\d{2}';--> statement-breakpoint
-- Carry the recovered time onto expenses that were categorized from those transactions.
UPDATE "expenses" e
SET "occurred_at" = bt."occurred_at"
FROM "bank_transactions" bt
WHERE bt."result_type" = 'expense'
  AND bt."result_id" = e."id"
  AND bt."occurred_has_time" = true;
