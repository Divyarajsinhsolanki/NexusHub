#!/usr/bin/env bash
set -euo pipefail

cd /var/app/current
bash scripts/eb_ensure_https.sh || {
  echo "HTTPS certificate check failed; app deployment will continue. Run scripts/eb_ensure_https.sh manually on the instance to debug."
  exit 0
}
