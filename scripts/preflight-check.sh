#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

errors=0
warns=0

ok() { echo "[OK] $1"; }
warn() { echo "[WARN] $1"; warns=$((warns + 1)); }
err() { echo "[ERROR] $1"; errors=$((errors + 1)); }

echo "Preflight check started"
echo

if grep -Eq "window\.GA4_MEASUREMENT_ID = ''" analytics-config.js; then
  warn "GA4 Measurement ID is empty in analytics-config.js"
else
  ok "GA4 Measurement ID is set"
fi

if grep -RIn --include="*.html" --include="*.json" "YOUR_AMAZON_ID" . >/dev/null; then
  err "Placeholder YOUR_AMAZON_ID remains in HTML/JSON files"
else
  ok "No Amazon placeholder IDs found in HTML/JSON"
fi

if grep -RIn --include="*.html" "https://www.amazon.co.jp" . | grep -Ev "tag=" >/dev/null; then
  err "Found Amazon links without tag parameter"
else
  ok "All Amazon links include tag parameter"
fi

if [[ -f "_redirects" ]]; then
  if grep -Eq "^/login(\.html)?[[:space:]]+/" _redirects && grep -Eq "^/my-library(\.html)?[[:space:]]+/" _redirects; then
    ok "Private page redirects are configured"
  else
    err "Missing /login or /my-library redirects in _redirects"
  fi
else
  err "_redirects file is missing"
fi

if [[ -f "microcms-config.js" ]]; then
  if grep -Eq "const staticMicrocmsApiKey = ''" microcms-config.js; then
    warn "staticMicrocmsApiKey is empty (CMS sync works only where localStorage is configured)"
  else
    ok "staticMicrocmsApiKey is set"
  fi
fi

node --check script.js >/dev/null && ok "script.js syntax check passed" || err "script.js syntax check failed"
bash -n scripts/check-affiliate-links.sh && ok "check-affiliate-links.sh syntax check passed" || err "check-affiliate-links.sh syntax check failed"
bash -n scripts/apply-production-values.sh && ok "apply-production-values.sh syntax check passed" || err "apply-production-values.sh syntax check failed"

echo
bash scripts/check-affiliate-links.sh >/dev/null
ok "Affiliate link report generated under reports/"

echo
echo "Summary: errors=$errors warnings=$warns"
if [[ "$errors" -gt 0 ]]; then
  exit 1
fi
