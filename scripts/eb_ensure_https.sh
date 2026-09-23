#!/usr/bin/env bash
set -euo pipefail

if [ "${CERTBOT_ENABLE:-false}" != "true" ]; then
  echo "CERTBOT_ENABLE is not true; skipping HTTPS certificate check."
  exit 0
fi

if [ -z "${CERTBOT_EMAIL:-}" ]; then
  echo "CERTBOT_EMAIL is required when CERTBOT_ENABLE=true."
  exit 1
fi

DOMAINS="${CERTBOT_DOMAINS:-app.divyarajsinh.com,divyarajsinh.com}"
PRIMARY_DOMAIN="${DOMAINS%%,*}"
PRIMARY_DOMAIN="$(echo "$PRIMARY_DOMAIN" | xargs)"

domain_args=()
IFS=',' read -ra domain_list <<< "$DOMAINS"
for domain in "${domain_list[@]}"; do
  domain="$(echo "$domain" | xargs)"
  [ -n "$domain" ] && domain_args+=("-d" "$domain")
done

if [ "${#domain_args[@]}" -eq 0 ]; then
  echo "CERTBOT_DOMAINS did not contain any domains."
  exit 1
fi

if ! command -v certbot >/dev/null 2>&1; then
  dnf install -y certbot python3-certbot-nginx
fi

CERT_DIR="/etc/letsencrypt/live/${PRIMARY_DOMAIN}"

if [ ! -f "${CERT_DIR}/fullchain.pem" ] || [ ! -f "${CERT_DIR}/privkey.pem" ]; then
  certbot --nginx \
    --non-interactive \
    --agree-tos \
    --email "$CERTBOT_EMAIL" \
    --keep-until-expiring \
    "${domain_args[@]}"
else
  certbot renew --quiet || true
fi

cat >/etc/nginx/conf.d/99_nexus_hub_https.conf <<NGINX
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAINS//,/ };

    ssl_certificate ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

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

nginx -t

systemctl reload nginx
