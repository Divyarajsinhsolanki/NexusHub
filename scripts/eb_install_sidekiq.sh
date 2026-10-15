#!/usr/bin/env bash
set -euo pipefail

# Read EB's current configuration at process startup; the deployment/env file
# can omit updated values and must not be relied on for the encryption keyring.
cat > /usr/local/bin/nexus-sidekiq <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
cd /var/app/current
worker_environment="$(/opt/elasticbeanstalk/bin/get-config environment | ruby -rjson -rshellwords -e 'JSON.parse(STDIN.read).each { |key, value| puts "export #{key}=#{Shellwords.escape(value.to_s)}" }')"
eval "$worker_environment"
unset worker_environment
export RAILS_ENV="${RAILS_ENV:-production}"
export BUNDLE_WITHOUT="${BUNDLE_WITHOUT:-development:test}"
exec /usr/bin/bundle exec sidekiq "$@"
SCRIPT
chmod 0755 /usr/local/bin/nexus-sidekiq

cat > /etc/systemd/system/sidekiq.service <<'UNIT'
[Unit]
Description=Nexus Hub Sidekiq worker
After=network-online.target valkey.service
Wants=network-online.target
Requires=valkey.service

[Service]
Type=simple
User=webapp
WorkingDirectory=/var/app/current
Environment=RAILS_ENV=production
ExecStart=/usr/local/bin/nexus-sidekiq -C config/sidekiq.yml
Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=90
SyslogIdentifier=sidekiq
UMask=0027

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable sidekiq
systemctl restart sidekiq
systemctl is-active --quiet sidekiq

# The PDF queue is separate from normal web/mail work, on the same EC2 host.
cat > /etc/systemd/system/sidekiq-pdf.service <<'UNIT'
[Unit]
Description=Nexus Hub bounded PDF worker
After=network-online.target valkey.service
Wants=network-online.target
Requires=valkey.service

[Service]
Type=simple
User=webapp
WorkingDirectory=/var/app/current
Environment=RAILS_ENV=production
ExecStart=/usr/local/bin/nexus-sidekiq -C config/sidekiq_pdf.yml
Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=350
MemoryMax=768M
CPUQuota=100%
TasksMax=128
PrivateTmp=true
NoNewPrivileges=true
UMask=0077
SyslogIdentifier=sidekiq-pdf

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable sidekiq-pdf
systemctl restart sidekiq-pdf
systemctl is-active --quiet sidekiq-pdf
