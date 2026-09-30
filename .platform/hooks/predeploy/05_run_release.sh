#!/usr/bin/env bash
set -euo pipefail

cd /var/app/staging

if [ -x /opt/elasticbeanstalk/bin/get-config ]; then
  eval "$(
    /opt/elasticbeanstalk/bin/get-config environment |
      ruby -rjson -rshellwords -e 'JSON.parse(STDIN.read).each { |key, value| puts "export #{key}=#{Shellwords.escape(value.to_s)}" }'
  )"
fi

if [ "${RAILS_SKIP_MIGRATIONS:-false}" = "true" ]; then
  echo "Skipping app bootstrap because RAILS_SKIP_MIGRATIONS=true."
  exit 0
fi

echo "Running application bootstrap..."
sudo -u webapp -E bundle exec rails app:bootstrap
