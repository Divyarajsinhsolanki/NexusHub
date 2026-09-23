#!/usr/bin/env bash
set -euo pipefail

if [ "${CERTBOT_ENABLE:-false}" != "true" ]; then
  echo "CERTBOT_ENABLE is not true; skipping HTTPS."
  exit 0
fi

if [ -z "${CERTBOT_EMAIL:-}" ]; then
  echo "CERTBOT_EMAIL is required."
  exit 1
fi

DOMAINS="${CERTBOT_DOMAINS:-app.divyarajsinh.com,divyarajsinh.com}"

# Always use the existing certificate name
CERT_NAME="divyarajsinh.com"
CERT_DIR="/etc/letsencrypt/live/${CERT_NAME}"

domain_args=()
IFS=',' read -ra domain_list <<< "$DOMAINS"

for domain in "${domain_list[@]}"; do
  domain="$(echo "$domain" | xargs)"
  [ -n "$domain" ] && domain_args+=("-d" "$domain")
done

if ! command -v certbot >/dev/null 2>&1; then
  dnf install -y certbot python3-certbot-nginx
fi

# Create/renew certificate
if [ ! -f "${CERT_DIR}/fullchain.pem" ] || \
   [ ! -f "${CERT_DIR}/privkey.pem" ]; then

  certbot certonly \
    --nginx \
    --non-interactive \
    --agree-tos \
    --email "$CERTBOT_EMAIL" \
    --keep-until-expiring \
    --cert-name "$CERT_NAME" \
    "${domain_args[@]}"
else
  certbot renew --quiet || true
fi

# Make sure certificate exists
if [ ! -f "${CERT_DIR}/fullchain.pem" ] || \
   [ ! -f "${CERT_DIR}/privkey.pem" ]; then
  echo "ERROR: HTTPS certificate was not created."
  exit 1
fi

# Create HTTPS nginx configuration
cat > /etc/nginx/conf.d/99_nexus_hub_https.conf <<NGINX
server {
    listen 443 ssl;
    listen [::]:443 ssl;

    server_name app.divyarajsinh.com divyarajsinh.com;

    ssl_certificate ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/privkey.pem;

    client_max_body_size 50M;

    location / {
        proxy_pass http://unix:/var/run/puma/my_app.sock;

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;

        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-SSL on;
        proxy_set_header X-Forwarded-Port 443;

        proxy_redirect off;
    }
}
NGINX

# Validate before touching nginx
nginx -t

# Reload nginx
systemctl reload nginx

# Verify HTTPS listener
if ss -lnt | grep -q ':443 '; then
  echo "HTTPS is active on port 443."
else
  echo "ERROR: Nginx is not listening on port 443."
  exit 1
fi

echo "HTTPS configuration completed successfully."