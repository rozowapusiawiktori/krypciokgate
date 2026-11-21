#!/bin/bash
cd /opt/krypciokgate
T=$(grep -m1 '^TOKEN=' banita.env | cut -d= -f2-)
API="https://api.telegram.org/bot${T}"
try() {
  echo "--- $1"
  curl -s -m 20 -X POST "$API/sendMessage" -H 'Content-Type: application/json' --data-binary "$2" | head -c 200
  echo
}
try "tylko blockquote+globe" '{"chat_id":8806188013,"parse_mode":"HTML","text":"<blockquote><tg-emoji emoji-id=\"5776233299424843260\">🌐</tg-emoji> <b>Centrum</b>\nID: <code>1</code></blockquote>"}'
try "z trojkatem rownosci" '{"chat_id":8806188013,"parse_mode":"HTML","text":"<blockquote><tg-emoji emoji-id=\"5771851822897566479\">≡</tg-emoji> ID: <code>1</code></blockquote>"}'
try "z symbolem ID" '{"chat_id":8806188013,"parse_mode":"HTML","text":"<blockquote><tg-emoji emoji-id=\"5771851822897566479\">🆔</tg-emoji> ID: <code>1</code></blockquote>"}'
