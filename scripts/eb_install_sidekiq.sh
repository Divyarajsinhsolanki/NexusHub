#!/usr/bin/env bash
set -euo pipefail

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
EnvironmentFile=/opt/elasticbeanstalk/deployment/env
Environment=RAILS_ENV=production
ExecStart=/usr/bin/bundle exec sidekiq -C config/sidekiq.yml
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
