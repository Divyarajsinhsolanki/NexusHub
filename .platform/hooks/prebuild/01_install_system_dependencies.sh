#!/usr/bin/env bash
set -euo pipefail

dnf install -y \
  gcc \
  gcc-c++ \
  git \
  make \
  libpq-devel \
  libyaml-devel \
  ImageMagick \
  postgresql15 \
  postgresql15-server \
  poppler-utils \
  ghostscript \
  qpdf \
  tar \
  xz

if ! command -v redis-server >/dev/null 2>&1; then
  dnf install -y redis6 || dnf install -y redis
fi

systemctl enable redis6 >/dev/null 2>&1 || systemctl enable redis >/dev/null 2>&1 || true
systemctl restart redis6 >/dev/null 2>&1 || systemctl restart redis >/dev/null 2>&1 || true

install -d -o webapp -g webapp /var/run/puma
install -d -o webapp -g webapp /var/app/staging/log

if [ ! -f /var/lib/pgsql/data/PG_VERSION ]; then
  postgresql-setup --initdb
fi

sed -i 's/ident/scram-sha-256/g; s/md5/scram-sha-256/g' /var/lib/pgsql/data/pg_hba.conf
grep -q "127.0.0.1/32" /var/lib/pgsql/data/pg_hba.conf || {
  echo "host all all 127.0.0.1/32 scram-sha-256" >> /var/lib/pgsql/data/pg_hba.conf
  echo "host all all ::1/128 scram-sha-256" >> /var/lib/pgsql/data/pg_hba.conf
}

systemctl enable postgresql >/dev/null 2>&1
systemctl restart postgresql

if [ "${LOCAL_POSTGRES_ENABLED:-false}" = "true" ]; then
  DB_NAME="${LOCAL_POSTGRES_DB:-nexus_hub_production}"
  DB_USER="${LOCAL_POSTGRES_USER:-nexus_hub}"

  if [ -z "${LOCAL_POSTGRES_PASSWORD:-}" ]; then
    echo "LOCAL_POSTGRES_PASSWORD is required when LOCAL_POSTGRES_ENABLED=true."
    exit 1
  fi

  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO
\$do\$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}'
   ) THEN
      CREATE ROLE ${DB_USER} LOGIN PASSWORD '${LOCAL_POSTGRES_PASSWORD}';
   ELSE
      ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${LOCAL_POSTGRES_PASSWORD}';
   END IF;
END
\$do\$;
SQL

  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
    sudo -u postgres createdb --owner="${DB_USER}" "${DB_NAME}"
  fi
fi
