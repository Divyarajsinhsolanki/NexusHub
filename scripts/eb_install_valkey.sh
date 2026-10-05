#!/usr/bin/env bash
set -euo pipefail

dnf install -y valkey

if systemctl is-active --quiet redis6; then
  if [ -f /var/lib/valkey/dump.rdb ]; then
    echo "Both legacy Redis and Valkey data exist; refusing to overwrite either."
    exit 1
  fi
  redis6-cli SAVE
  systemctl stop redis6
  cp -p /var/lib/redis6/dump.rdb "/var/lib/redis6/dump.rdb.before-valkey-$(date +%s)"
  install -o valkey -g valkey -m 0600 /var/lib/redis6/dump.rdb /var/lib/valkey/dump.rdb
fi

systemctl disable redis6 >/dev/null 2>&1 || true
systemctl enable valkey
systemctl start valkey
valkey-cli PING
# Append-only persistence protects queued jobs between periodic snapshots.
valkey-cli CONFIG SET maxmemory-policy noeviction
valkey-cli CONFIG SET appendonly yes
valkey-cli CONFIG SET appendfsync everysec
valkey-cli CONFIG REWRITE
