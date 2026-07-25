#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$SCRIPT_DIR/backup"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="learnforge_${TIMESTAMP}.sql"

docker compose -f "$PROJECT_DIR/docker-compose.yml" exec -T db pg_dump -U learnforge learnforge > "$BACKUP_DIR/$FILENAME"

if [ ! -s "$BACKUP_DIR/$FILENAME" ]; then
  echo "ERROR: Backup file is empty!" >&2
  rm "$BACKUP_DIR/$FILENAME"
  exit 1
fi

echo "Backup saved to backup/$FILENAME ($(du -h "$BACKUP_DIR/$FILENAME" | cut -f1))"

# Keep only the newest MAX_BACKUPS dumps (timestamps sort chronologically)
MAX_BACKUPS=10
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'learnforge_*.sql' \
  | sort -r \
  | tail -n +$((MAX_BACKUPS + 1)) \
  | while IFS= read -r old; do
      rm -f "$old"
      echo "Pruned old backup: $(basename "$old")"
    done
