#!/bin/bash
# AWS Amplify Hosting icin dagitim paketini (.amplify-hosting) olusturur.
# Yapi: https://docs.aws.amazon.com/amplify/latest/userguide/deploy-express-server.html
set -euo pipefail

OUT=.amplify-hosting
rm -rf "$OUT"
mkdir -p "$OUT/compute/default"

# Sunucu (Compute): Amplify, entrypoint'i calistirir ve 3000 portuna yonlendirir.
cp -r server.js package.json lib public node_modules "$OUT/compute/default/"

# Statik dosyalar CDN'den sunulur; bulunamayanlar sunucuya duser.
cp -r public "$OUT/static"

cp deploy-manifest.json "$OUT/deploy-manifest.json"

# Amplify konsolundaki ortam degiskenleri calisma aninda sunucuya ulasmaz;
# bu yuzden build sirasinda .env dosyasina yaziyoruz (server.js acilista okur).
ENV_OUT="$OUT/compute/default/.env"
: > "$ENV_OUT"
for key in DATABASE_URL SESSION_SECRET ADMIN_EMAIL ADMIN_PASSWORD FIRMS_MAP_KEY; do
  if [ -n "${!key:-}" ]; then
    printf '%s=%s\n' "$key" "${!key}" >> "$ENV_OUT"
  else
    echo "[uyari] $key tanimli degil" >&2
  fi
done
# istege bagli: site adresi, KVKK iletisim e-postasi, e-postayla sifre sifirlama (Resend)
for key in SITE_URL CONTACT_EMAIL RESEND_API_KEY MAIL_FROM VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT PUSH_CRON_SECRET; do
  if [ -n "${!key:-}" ]; then
    printf '%s=%s\n' "$key" "${!key}" >> "$ENV_OUT"
  fi
done
echo "COOKIE_SECURE=true" >> "$ENV_OUT"
