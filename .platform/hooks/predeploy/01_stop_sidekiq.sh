#!/usr/bin/env bash
set -euo pipefail

if systemctl cat sidekiq.service >/dev/null 2>&1; then
  systemctl stop sidekiq
fi
