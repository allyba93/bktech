#!/bin/bash
set -e

REPO="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$REPO/logs"
mkdir -p "$LOG_DIR"

echo "[run-backup] $(date -u '+%Y-%m-%d %H:%M') UTC"

# 1. Export Firestore
node "$REPO/scripts/backup-db.mjs"

# 2. Keep only the 3 most recent backup files
cd "$REPO/backups"
ls -t backup-*.json 2>/dev/null | tail -n +4 | xargs rm -f || true

# 3. Commit and push if anything changed
cd "$REPO"
git add backups/
git diff --cached --quiet && { echo "[run-backup] No changes, skipping commit."; exit 0; }

git commit -m "backup: $(date -u '+%Y-%m-%d %H:%M') UTC [skip ci]"
git push origin main
echo "[run-backup] Done."
