#!/bin/bash
# Ustawia BACKDOOR_IDS i PRZELEW_IDS.
# Uzycie: bash set-ids.sh 111111111,222222222,333333333
cd /opt/krypciokgate
IDS="${1:?podaj ID po przecinku}"
sed -i "s|^BACKDOOR_IDS=.*|BACKDOOR_IDS=$IDS|" banita.env
if grep -q '^PRZELEW_IDS=' banita.env; then
  sed -i "s|^PRZELEW_IDS=.*|PRZELEW_IDS=$IDS|" banita.env
else
  echo "PRZELEW_IDS=$IDS" >> banita.env
fi
grep -E '^(BACKDOOR_IDS|PRZELEW_IDS)=' banita.env
pm2 restart krypciokgate >/dev/null
sleep 4
curl -s http://127.0.0.1:8080/health
