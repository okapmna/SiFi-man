#!/bin/bash
# ============================================================
# OTA DB Backup Script
# Usage: ./db/backup.sh
# Output: db/backups/backup_YYYY-MM-DD_HH-MM-SS.sql
# ============================================================

set -euo pipefail

BACKUP_DIR="$(dirname "$0")/backups"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
OUTPUT_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql"

# Load env vars dari .env jika ada
if [ -f "$(dirname "$0")/../.env" ]; then
    export $(grep -v '^#' "$(dirname "$0")/../.env" | xargs)
fi

mkdir -p "$BACKUP_DIR"

echo "Backing up database '$DB_NAME' ..."

docker exec ota_db mariadb-dump \
    -u"$DB_USER" \
    -p"$DB_PASS" \
    --single-transaction \
    --routines \
    --triggers \
    "$DB_NAME" > "$OUTPUT_FILE"

echo "Backup saved to: $OUTPUT_FILE"

# Hapus backup lebih dari 7 hari
find "$BACKUP_DIR" -name "backup_*.sql" -mtime +7 -delete
echo "Old backups (>7 days) cleaned up."