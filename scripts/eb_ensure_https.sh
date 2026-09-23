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

if [ -f "/etc/letsencrypt/live/${PRIMARY_DOMAIN}/fullchain.pem" ]; then
  if certbot certificates --cert-name "$PRIMARY_DOMAIN" 2>/dev/null | grep -q "VALID"; then
    echo "Certificate for ${PRIMARY_DOMAIN} exists; ensuring nginx config is still installed."
  fi
fi

certbot --nginx \
  --non-interactive \
  --agree-tos \
  --email "$CERTBOT_EMAIL" \
  --keep-until-expiring \
  --redirect \
  "${domain_args[@]}"

systemctl reload nginx
