#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="$(dirname "$0")/backup"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="learnforge_${TIMESTAMP}.sql"

docker compose exec -T db pg_dump -U learnforge learnforge > "$BACKUP_DIR/$FILENAME"

echo "Backup saved to backup/$FILENAME"
