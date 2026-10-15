#!/usr/bin/env bash
set -euo pipefail
cd /var/app/current
backup_source_url="${BACKUP_DATABASE_URL:?Configure the read-only backup database URL}"
if [ -x /opt/elasticbeanstalk/bin/get-config ]; then
  eval "$(/opt/elasticbeanstalk/bin/get-config environment | ruby -rjson -rshellwords -e 'JSON.parse(STDIN.read).each { |key, value| puts "export #{key}=#{Shellwords.escape(value.to_s)}" }')"
fi
export DATABASE_URL="$backup_source_url" BACKUP_DATABASE_URL="$backup_source_url"
export RAILS_ENV=production DEPLOYMENT_TIER=production BACKUP_UPLOAD_MODE=active_storage
exec bundle exec rails recovery:backup
