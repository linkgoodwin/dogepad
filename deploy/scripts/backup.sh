#!/bin/bash

BACKUP_DIR="/home/deploy/backups"
WWW_DIR="/var/www/bsc-launchpad"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

echo "💾 Creating backup..."
tar -czf "$BACKUP_DIR/bsc-launchpad_$DATE.tar.gz" -C "$WWW_DIR" .

echo "🧹 Cleaning old backups (keeping last 7)..."
ls -t "$BACKUP_DIR"/bsc-launchpad_*.tar.gz | tail -n +8 | xargs -r rm

echo "✅ Backup saved: bsc-launchpad_$DATE.tar.gz"
echo "   Size: $(du -h "$BACKUP_DIR/bsc-launchpad_$DATE.tar.gz" | cut -f1)"
