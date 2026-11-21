#!/bin/bash
cd /opt/krypciokgate
T=$(grep -m1 '^TOKEN=' banita.env | cut -d= -f2-)
API="https://api.telegram.org/bot${T}"
CHAT=8806188013

echo "=== G: icon_custom_emoji_id (poprawna metoda)"
curl -s -m 25 -X POST "$API/sendMessage" -H 'Content-Type: application/json' \
 -d "{\"chat_id\":$CHAT,\"text\":\"G: metoda icon_custom_emoji_id\",\"reply_markup\":{\"inline_keyboard\":[[{\"text\":\"Bramki płatności\",\"callback_data\":\"g\",\"icon_custom_emoji_id\":\"5778672437122045013\"}]]}}" | head -c 160
echo

echo "=== H: icon + style primary"
curl -s -m 25 -X POST "$API/sendMessage" -H 'Content-Type: application/json' \
 -d "{\"chat_id\":$CHAT,\"text\":\"H: icon + style\",\"reply_markup\":{\"inline_keyboard\":[[{\"text\":\"Ustawienia\",\"callback_data\":\"h\",\"icon_custom_emoji_id\":\"5904258298764334001\",\"style\":\"primary\"}]]}}" | head -c 160
echo
