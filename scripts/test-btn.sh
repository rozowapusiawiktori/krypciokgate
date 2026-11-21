#!/bin/bash
cd /opt/krypciokgate
T=$(grep -m1 '^TOKEN=' banita.env | cut -d= -f2-)
cat > /tmp/b2.json <<'JSON'
{"chat_id":8806188013,"text":"test premium w przycisku v2","reply_markup":{"inline_keyboard":[[{"text":"<tg-emoji emoji-id=\"5778672437122045013\">📦</tg-emoji> Bramki platnosci","callback_data":"x1"}]]}}
JSON
r=$(curl -s -m 25 -X POST "https://api.telegram.org/bot${T}/sendMessage" -H 'Content-Type: application/json' --data-binary @/tmp/b2.json)
echo "$r" | head -c 400
echo
