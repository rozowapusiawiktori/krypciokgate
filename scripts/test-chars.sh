#!/bin/bash
cd /opt/krypciokgate
T=$(grep -m1 '^TOKEN=' banita.env | cut -d= -f2-)
API="https://api.telegram.org/bot${T}"
t() {
  r=$(curl -s -m 20 -X POST "$API/sendMessage" -H 'Content-Type: application/json' \
   -d "{\"chat_id\":8806188013,\"parse_mode\":\"HTML\",\"text\":\"<tg-emoji emoji-id=\\\"$2\\\">$1</tg-emoji> test\"}")
  echo "$1 -> $(echo "$r" | grep -o 'ENTITY_TEXT_INVALID\|"ok":true' | head -1)"
}
t "🌐" 5776233299424843260
t "🆔" 5771851822897566479
t "📈" 5938539885907415367
t "🤑" 5902206159095339799
t "👛" 5769126056262898415
t "🌀" 6050588788021793070
t "✅" 5774022692642492953
t "🔒" 6037249452824072506
t "🔄" 5769248574499983619
