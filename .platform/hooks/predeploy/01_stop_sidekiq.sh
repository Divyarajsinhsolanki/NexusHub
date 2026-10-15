#!/usr/bin/env bash
set -euo pipefail

for worker in sidekiq sidekiq-pdf; do
  if systemctl cat "${worker}.service" >/dev/null 2>&1; then
    systemctl stop "$worker"
  fi
done
