#!/usr/bin/env bash
set -euo pipefail

cd /var/app/current
bash scripts/eb_ensure_https.sh
