#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPORT_DIR="$ROOT_DIR/reports"
STAMP="$(date +%Y-%m-%d_%H-%M-%S)"
REPORT_FILE="$REPORT_DIR/affiliate-link-check-$STAMP.txt"

mkdir -p "$REPORT_DIR"

LINKS=$(cd "$ROOT_DIR" && cat ./*.html | grep -Eo "https://[^\"' >]+" | sort -u | grep -E 'amazon\.co\.jp' || true)

{
  echo "Affiliate link check report"
  echo "generated_at=$STAMP"
  echo

  while IFS= read -r link; do
    [[ -z "$link" ]] && continue
    status=""
    final_url=""
    tag_status="missing_tag"

    if [[ "$link" == *"tag="* && "$link" != *"YOUR_AMAZON_ID"* ]]; then
      tag_status="ok"
    elif [[ "$link" == *"YOUR_AMAZON_ID"* ]]; then
      tag_status="placeholder_tag"
    fi

    if response=$(curl -I -L --max-redirs 5 --connect-timeout 10 --max-time 20 "$link" 2>/dev/null); then
      status=$(printf '%s\n' "$response" | awk '/^HTTP/{code=$2} END{print code}')
      final_url=$(printf '%s\n' "$response" | awk -F': ' 'tolower($1)=="location"{loc=$2} END{print loc}' | tr -d '\r')
    else
      status="curl_error"
    fi

    printf '%-12s %-15s %s\n' "$status" "$tag_status" "$link"
    if [[ -n "$final_url" ]]; then
      printf '  -> %s\n' "$final_url"
    fi
  done <<< "$LINKS"
} | tee "$REPORT_FILE"

echo
echo "Saved report: $REPORT_FILE"
