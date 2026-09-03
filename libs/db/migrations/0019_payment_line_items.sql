-- `group` payments derive their amount from a list of records, each a named
-- value in its own currency. Null for every existing (fixed / per-unit) payment.
ALTER TABLE "payments" ADD COLUMN "line_items" jsonb;
