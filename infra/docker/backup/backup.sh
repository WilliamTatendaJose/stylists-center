#!/bin/sh
# Dumps DATABASE_URL, checks the dump is readable, uploads it to
# s3://$BACKUP_S3_BUCKET/$BACKUP_PREFIX/, and exits non-zero on any failure so
# the run shows as failed in Railway's cron history.
#
# Required: DATABASE_URL, BACKUP_S3_BUCKET, AWS_ACCESS_KEY_ID,
#           AWS_SECRET_ACCESS_KEY, BACKUP_S3_ENDPOINT (unset for AWS S3)
# Optional: BACKUP_PREFIX (default "postgres"), AWS_DEFAULT_REGION (default "auto")
set -eu

: "${DATABASE_URL:?DATABASE_URL must be set}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET must be set}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID must be set}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY must be set}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"
# Same reason as the API's S3 client: only send checksums when required, which
# is what R2 and other non-AWS providers accept.
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
PREFIX="${BACKUP_PREFIX:-postgres}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="/tmp/sc-${stamp}.dump"
trap 'rm -f "$file"' EXIT

echo "Dumping database..."
# Custom format: compressed, and restorable table-by-table with pg_restore.
pg_dump --format=custom --no-owner --no-privileges --file="$file" "$DATABASE_URL"

# A truncated or corrupt dump fails here instead of being uploaded as if good.
pg_restore --list "$file" > /dev/null
size="$(wc -c < "$file" | tr -d ' ')"
echo "Dump OK (${size} bytes)."

endpoint_flag=""
if [ -n "${BACKUP_S3_ENDPOINT:-}" ]; then
  endpoint_flag="--endpoint-url=${BACKUP_S3_ENDPOINT}"
fi

# shellcheck disable=SC2086 # endpoint_flag is intentionally empty or one word
aws s3 cp $endpoint_flag --only-show-errors "$file" "s3://${BACKUP_S3_BUCKET}/${PREFIX}/sc-${stamp}.dump"
echo "Uploaded s3://${BACKUP_S3_BUCKET}/${PREFIX}/sc-${stamp}.dump"
