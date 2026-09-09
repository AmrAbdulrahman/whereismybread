-- Dry-run copy of the provider backfill that ships inside
-- libs/db/migrations/0046_providers_add.sql (the migration is the source of
-- truth). Run this wrapped in a transaction against a DB dump to preview the
-- result, e.g.:
--
--   psql "$POSTGRES_URL_NON_POOLING" \
--     -c 'BEGIN' -f scripts/backfill-providers.sql \
--     -c 'SELECT count(*), count(provider_id) FROM payments' \
--     -c 'ROLLBACK'
--
-- It assumes 0046's DDL (providers / provider_tags tables, provider_id columns)
-- has already run and the inline url / logo_url / brand_color columns still
-- exist (they are dropped in 0047).

-- ============================================================================
-- Backfill: extract reusable providers from the branding that was, until now,
-- copied inline onto every payment / expense / bank transaction. One provider
-- per (user, url-host) — or (user, lower(name)) for rows with no URL. Then link
-- every row and seed each provider's default tags from the union of tags its
-- linked payments / expenses carry.
-- The inline url / logo_url / brand_color columns are dropped in 0047, once the
-- application no longer reads them.
-- ============================================================================

WITH candidates AS (
  SELECT p.user_id,
         lower(regexp_replace(coalesce(p.url, ''), '^(https?://)?(www\.)?([^/]+).*$', '\3')) AS host,
         nullif(btrim(p.name), '') AS name,
         nullif(btrim(p.url), '')  AS url,
         nullif(btrim(p.logo_url), '')    AS logo_url,
         nullif(btrim(p.brand_color), '') AS brand_color
    FROM payments p
   WHERE coalesce(p.url, '') <> '' OR coalesce(p.logo_url, '') <> ''
  UNION ALL
  SELECT e.user_id,
         lower(regexp_replace(coalesce(e.url, ''), '^(https?://)?(www\.)?([^/]+).*$', '\3')),
         nullif(btrim(e.name), ''),
         nullif(btrim(e.url), ''),
         nullif(btrim(e.logo_url), ''),
         nullif(btrim(e.brand_color), '')
    FROM expenses e
   WHERE coalesce(e.url, '') <> '' OR coalesce(e.logo_url, '') <> ''
  UNION ALL
  SELECT t.user_id,
         lower(regexp_replace(coalesce(t.url, ''), '^(https?://)?(www\.)?([^/]+).*$', '\3')),
         nullif(btrim(coalesce(t.name_override, t.description)), ''),
         nullif(btrim(t.url), ''),
         nullif(btrim(t.logo_url), ''),
         nullif(btrim(t.brand_color), '')
    FROM bank_transactions t
   WHERE coalesce(t.url, '') <> ''
),
keyed AS (
  SELECT user_id, host, name, url, logo_url, brand_color,
         coalesce(nullif(host, ''), lower(name)) AS group_key
    FROM candidates
   WHERE coalesce(nullif(host, ''), lower(name)) IS NOT NULL
),
grouped AS (
  SELECT user_id,
         group_key,
         (array_agg(name ORDER BY (name IS NULL), length(name), name))[1]     AS name,
         (array_agg(url ORDER BY (url IS NULL), length(url)))[1]              AS url,
         (array_agg(logo_url ORDER BY (logo_url IS NULL)))[1]                AS logo_url,
         (array_agg(brand_color ORDER BY (brand_color IS NULL)))[1]          AS brand_color
    FROM keyed
   GROUP BY user_id, group_key
)
INSERT INTO providers (user_id, name, url, logo_url, color)
SELECT user_id, coalesce(name, group_key), url, logo_url, brand_color
  FROM grouped
 WHERE coalesce(name, group_key) IS NOT NULL
ON CONFLICT (user_id, lower(name)) DO NOTHING;

-- Link payments: by URL host when it has one, else by name.
UPDATE payments p SET provider_id = pr.id
  FROM providers pr
 WHERE pr.user_id = p.user_id
   AND p.provider_id IS NULL
   AND (
     (coalesce(p.url, '') <> '' AND coalesce(pr.url, '') <> ''
        AND lower(regexp_replace(p.url,  '^(https?://)?(www\.)?([^/]+).*$', '\3'))
          = lower(regexp_replace(pr.url, '^(https?://)?(www\.)?([^/]+).*$', '\3')))
     OR
     (coalesce(p.url, '') = '' AND lower(btrim(p.name)) = lower(pr.name))
   );

UPDATE expenses e SET provider_id = pr.id
  FROM providers pr
 WHERE pr.user_id = e.user_id
   AND e.provider_id IS NULL
   AND (
     (coalesce(e.url, '') <> '' AND coalesce(pr.url, '') <> ''
        AND lower(regexp_replace(e.url,  '^(https?://)?(www\.)?([^/]+).*$', '\3'))
          = lower(regexp_replace(pr.url, '^(https?://)?(www\.)?([^/]+).*$', '\3')))
     OR
     (coalesce(e.url, '') = '' AND lower(btrim(e.name)) = lower(pr.name))
   );

UPDATE bank_transactions t SET provider_id = pr.id
  FROM providers pr
 WHERE pr.user_id = t.user_id
   AND t.provider_id IS NULL
   AND coalesce(t.url, '') <> '' AND coalesce(pr.url, '') <> ''
   AND lower(regexp_replace(t.url,  '^(https?://)?(www\.)?([^/]+).*$', '\3'))
     = lower(regexp_replace(pr.url, '^(https?://)?(www\.)?([^/]+).*$', '\3'));

-- Seed default tags: every tag used on a provider's linked payments / expenses.
INSERT INTO provider_tags (provider_id, tag_id)
SELECT DISTINCT p.provider_id, pt.tag_id
  FROM payments p
  JOIN payment_tags pt ON pt.payment_id = p.id
 WHERE p.provider_id IS NOT NULL
UNION
SELECT DISTINCT e.provider_id, et.tag_id
  FROM expenses e
  JOIN expense_tags et ON et.expense_id = e.id
 WHERE e.provider_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Migrate automation rules: set_url -> set_provider, and resolve every rule's
-- provider website / log_expense url to a provider row (creating any missing).
INSERT INTO providers (user_id, name, url, color)
SELECT DISTINCT a.user_id,
       lower(regexp_replace(act->>'url', '^(https?://)?(www\.)?([^/]+).*$', '\3')) AS name,
       act->>'url' AS url,
       NULL
  FROM automations a
  CROSS JOIN LATERAL jsonb_array_elements(a.actions) AS act
 WHERE act->>'url' IS NOT NULL AND btrim(act->>'url') <> ''
   AND lower(regexp_replace(act->>'url', '^(https?://)?(www\.)?([^/]+).*$', '\3')) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM providers pr2
      WHERE pr2.user_id = a.user_id
        AND coalesce(pr2.url, '') <> ''
        AND lower(regexp_replace(pr2.url, '^(https?://)?(www\.)?([^/]+).*$', '\3'))
          = lower(regexp_replace(act->>'url', '^(https?://)?(www\.)?([^/]+).*$', '\3'))
   )
ON CONFLICT (user_id, lower(name)) DO NOTHING;

UPDATE automations a SET actions = (
  SELECT jsonb_agg(
    CASE
      WHEN (act->>'url') IS NOT NULL AND btrim(act->>'url') <> '' THEN
        (act - 'url' - 'value')
        || jsonb_build_object(
             'type', CASE WHEN act->>'type' = 'set_url' THEN 'set_provider' ELSE act->>'type' END,
             'providerId', coalesce((
               SELECT pr.id::text FROM providers pr
                WHERE pr.user_id = a.user_id
                  AND lower(regexp_replace(coalesce(pr.url, ''), '^(https?://)?(www\.)?([^/]+).*$', '\3'))
                    = lower(regexp_replace(act->>'url', '^(https?://)?(www\.)?([^/]+).*$', '\3'))
                LIMIT 1
             ), ''))
      WHEN act->>'type' = 'set_url' THEN
        (act - 'value') || jsonb_build_object('type', 'set_provider', 'providerId', '')
      ELSE act
    END
  )
  FROM jsonb_array_elements(a.actions) AS act
)
WHERE a.actions @> '[{"type": "set_url"}]'
   OR EXISTS (
     SELECT 1 FROM jsonb_array_elements(a.actions) AS act
      WHERE (act->>'url') IS NOT NULL AND btrim(act->>'url') <> ''
   );
