-- Rename the seeded "Credit card" method to "Card" (kept where the user hasn't
-- renamed it themselves).
UPDATE "payment_methods"
SET "name" = 'Card', "updated_at" = now()
WHERE "kind" = 'credit_card' AND "name" = 'Credit card';
