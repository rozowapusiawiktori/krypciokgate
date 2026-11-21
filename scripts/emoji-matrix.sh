#!/bin/bash
cd /opt/krypciokgate
T=$(grep -m1 '^TOKEN=' banita.env | cut -d= -f2-)
CHAT=8806188013
API="https://api.telegram.org/bot${T}"

echo "=== A: tag w przycisku, bez parse_mode"
curl -s -m 20 -X POST "$API/sendMessage" -H 'Content-Type: application/json' \
 -d "{\"chat_id\":$CHAT,\"text\":\"A: tag w przycisku bez parse_mode\",\"reply_markup\":{\"inline_keyboard\":[[{\"text\":\"<tg-emoji emoji-id=\\\"5778672437122045013\\\">📦</tg-emoji> Bramki\",\"callback_data\":\"a\"}]]}}" | head -c 120
echo

echo "=== B: tag w przycisku + parse_mode HTML"
curl -s -m 20 -X POST "$API/sendMessage" -H 'Content-Type: application/json' \
 -d "{\"chat_id\":$CHAT,\"text\":\"B: tag w przycisku z parse_mode\",\"parse_mode\":\"HTML\",\"reply_markup\":{\"inline_keyboard\":[[{\"text\":\"<tg-emoji emoji-id=\\\"5778672437122045013\\\">📦</tg-emoji> Bramki\",\"callback_data\":\"b\"}]]}}" | head -c 120
echo

echo "=== C: zwykla emotka w przycisku (kontrola)"
curl -s -m 20 -X POST "$API/sendMessage" -H 'Content-Type: application/json' \
 -d "{\"chat_id\":$CHAT,\"text\":\"C: kontrola ze zwykla emotka\",\"reply_markup\":{\"inline_keyboard\":[[{\"text\":\"📦 Bramki\",\"callback_data\":\"c\"}]]}}" | head -c 120
echo

echo "=== D: tag w tresci wiadomosci (kontrola renderu)"
curl -s -m 20 -X POST "$API/sendMessage" -H 'Content-Type: application/json' \
 -d "{\"chat_id\":$CHAT,\"text\":\"D: w tresci: <tg-emoji emoji-id=\\\"5778672437122045013\\\">📦</tg-emoji>\",\"parse_mode\":\"HTML\"}" | head -c 120
echo
