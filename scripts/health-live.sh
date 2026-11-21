#!/bin/bash
cd /opt/krypciokgate
T=$(grep -m1 '^TOKEN=' banita.env | cut -d= -f2-)
API="https://api.telegram.org/bot${T}"
CHAT=8806188013

# 1) wywolaj /start przez webhook? nie - sprawdz log po realnym uzyciu
echo "--- getMe (czy zywy)"
curl -s -m 15 "$API/getMe" | head -c 90
echo
echo "--- ostatnie bledy"
tail -6 logs/error.log | cut -c1-140
echo "--- czy proces zyje i nie restartuje"
pm2 describe krypciokgate | grep -E "status|uptime" | head -2
