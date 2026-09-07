#!/usr/bin/env bash
#
# Manually exercise the bank-sync endpoint the way the GitHub Actions workflow
# (.github/workflows/bank-sync.yml) does. Use it to check whether a given
# CRON_SECRET is the one the deployment currently accepts.
#
# Usage:
#   CRON_SECRET=xxxx ./scripts/test-bank-sync.sh                 # hits production
#   CRON_SECRET=xxxx APP_URL=http://localhost:3000 ./scripts/test-bank-sync.sh
#   ./scripts/test-bank-sync.sh                                  # reads .env.local
#
# Exit codes: 0 = 2xx, 1 = auth/other failure, 2 = misconfig.

set -euo pipefail

APP_URL="${APP_URL:-https://www.whereismybread.com}"

# Fall back to CRON_SECRET from .env.local if not passed in the environment.
if [ -z "${CRON_SECRET:-}" ] && [ -f "$(dirname "$0")/../.env.local" ]; then
  CRON_SECRET=$(grep -E '^CRON_SECRET=' "$(dirname "$0")/../.env.local" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//')
fi

if [ -z "${CRON_SECRET:-}" ]; then
  echo "error: set CRON_SECRET (env var) or add it to .env.local" >&2
  exit 2
fi

url="${APP_URL%/}/api/bank-sync/enable-banking"
echo "POST $url"
echo "secret: ${#CRON_SECRET} chars, starts ${CRON_SECRET:0:4}…"
echo

# 1. No auth -> expect 401 (proves the endpoint is reachable and guarded).
noauth=$(curl -sS -m 20 -o /dev/null -w '%{http_code}' -X POST "$url" || true)
echo "no auth      -> HTTP $noauth  (expect 401)"

# 2. Wrong secret -> expect 401.
badauth=$(curl -sS -m 20 -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer definitely-not-the-secret" "$url" || true)
echo "wrong secret -> HTTP $badauth  (expect 401)"

# 3. The real call. A correct secret starts a real bank sync that can take
#    minutes, so first do a short probe: an instant 401 means "rejected";
#    a timeout means auth passed and the sync is running.
if [ "${QUICK:-1}" = "1" ]; then
  probe=$(curl -sS -m 12 -o /dev/null -w '%{http_code}' -X POST \
    -H "Authorization: Bearer ${CRON_SECRET}" "$url" 2>/dev/null || echo "timeout")
  if [ "$probe" = "401" ]; then
    echo "your secret  -> HTTP 401 (rejected)"
    code=401
  elif [ "$probe" = "timeout" ]; then
    echo "your secret  -> accepted (auth passed; sync is running — did not wait)"
    echo "               re-run with QUICK=0 to wait for the full result"
    exit 0
  else
    echo "your secret  -> HTTP $probe"
    code=$probe
  fi
else
  body=$(mktemp)
  code=$(curl -sS -m 330 -o "$body" -w '%{http_code}' -X POST \
    -H "Authorization: Bearer ${CRON_SECRET}" "$url" || true)
  echo "your secret  -> HTTP $code"
  echo "--- response body ---"
  cat "$body"; echo
  rm -f "$body"
fi

case "$code" in
  2*) echo "OK — this secret is accepted by $APP_URL"; exit 0 ;;
  401)
    echo
    echo "401 — the deployment at $APP_URL does NOT accept this secret. Either:" >&2
    echo "  - Vercel's CRON_SECRET differs from this value, or" >&2
    echo "  - the env var was changed but production was not redeployed, or" >&2
    echo "  - the stored value has stray quotes/whitespace." >&2
    exit 1 ;;
  503) echo "503 — CRON_SECRET is not set on the deployment at all." >&2; exit 1 ;;
  *)   echo "unexpected HTTP $code" >&2; exit 1 ;;
esac
