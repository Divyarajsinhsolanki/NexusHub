#!/usr/bin/env bash
set -euo pipefail

cat >/usr/local/bin/rails <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/app/current"

if [ ! -d "${APP_DIR}" ]; then
  echo "${APP_DIR} does not exist yet." >&2
  exit 1
fi

cd "${APP_DIR}"

if [ -x /opt/elasticbeanstalk/bin/get-config ]; then
  eval "$(
    /opt/elasticbeanstalk/bin/get-config environment |
      ruby -rjson -rshellwords -e 'JSON.parse(STDIN.read).each { |key, value| puts "export #{key}=#{Shellwords.escape(value.to_s)}" }'
  )"
fi

export RAILS_ENV="${RAILS_ENV:-production}"
export RACK_ENV="${RACK_ENV:-production}"
export BUNDLE_WITHOUT="${BUNDLE_WITHOUT:-development:test}"

if [ "$(id -un)" = "webapp" ]; then
  exec bundle exec rails "$@"
else
  exec sudo -u webapp -E bundle exec rails "$@"
fi
SCRIPT

chmod 0755 /usr/local/bin/rails
