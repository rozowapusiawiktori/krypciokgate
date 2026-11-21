#!/bin/bash
cd /opt/krypciokgate
T=$(grep -m1 '^TOKEN=' banita.env | cut -d= -f2-)
API="https://api.telegram.org/bot${T}"
echo "--- pelny caption (kopia 1:1 z kodu)"
curl -s -m 25 -X POST "$API/sendMessage" -H 'Content-Type: application/json' -d @/tmp/full.json | head -c 300
echo
