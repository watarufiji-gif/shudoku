#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  cat <<USAGE
Usage:
  bash scripts/apply-production-values.sh <domain> <amazon_tag> <rakuten_id> [ga4_measurement_id]

Example:
  bash scripts/apply-production-values.sh shudoku.jp mybook-22 your_rakuten_id G-XXXXXXXXXX
USAGE
  exit 1
fi

DOMAIN="$1"
AMAZON_TAG="$2"
RAKUTEN_ID="$3"
GA4_ID="${4:-}"

if [[ ! "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "Invalid domain: $DOMAIN" >&2
  exit 1
fi

if [[ -z "$AMAZON_TAG" || -z "$RAKUTEN_ID" ]]; then
  echo "amazon_tag and rakuten_id are required" >&2
  exit 1
fi

replace_in_file() {
  local file="$1"
  local pattern="$2"
  local replacement="$3"
  perl -0pi -e "s/${pattern}/${replacement}/g" "$file"
}

# Domain placeholders
for file in index.html book-22.html robots.txt sitemap.xml; do
  if [[ -f "$file" ]]; then
    replace_in_file "$file" "YOUR_DOMAIN" "$DOMAIN"
  fi
done

# Affiliate placeholders
for file in index.html book-22.html microcms-book-template.json; do
  if [[ -f "$file" ]]; then
    replace_in_file "$file" "YOUR_AMAZON_ID" "$AMAZON_TAG"
    replace_in_file "$file" "YOUR_RAKUTEN_ID" "$RAKUTEN_ID"
  fi
done

# GA4 setting
if [[ -n "$GA4_ID" && -f analytics-config.js ]]; then
  replace_in_file "analytics-config.js" "window\\.GA4_MEASUREMENT_ID = ''" "window.GA4_MEASUREMENT_ID = '$GA4_ID'"
fi

echo "Applied production values:"
echo "  domain=$DOMAIN"
echo "  amazon_tag=$AMAZON_TAG"
echo "  rakuten_id=$RAKUTEN_ID"
if [[ -n "$GA4_ID" ]]; then
  echo "  ga4=$GA4_ID"
else
  echo "  ga4=(not set)"
fi
