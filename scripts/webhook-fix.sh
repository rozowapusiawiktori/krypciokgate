#!/bin/bash
cd /opt/krypciokgate
TOKEN=$(grep -m1 '^TOKEN=' banita.env | cut -d= -f2-)
DOMAIN=$(grep -m1 '^DEFAULT_DOMAIN=' banita.env | cut -d= -f2-)
WHPATH=$(grep -m1 '^WEBHOOK_PATH=' banita.env | cut -d= -f2-)
SECRET=$(grep -m1 '^WEBHOOK_SECRET=' banita.env | cut -d= -f2-)
echo "url=https://olx.${DOMAIN}/${WHPATH}"
curl -s "https://api.telegram.org/bot${TOKEN}/setWebhook?url=https://olx.${DOMAIN}/${WHPATH}&secret_token=${SECRET}"
echo
sleep 2
curl -s "https://api.telegram.org/bot${TOKEN}/getWebhookInfo"
echo
tail -20 /root/.pm2/logs/krypciokgate-error.log 2>/dev/null | tail -8
