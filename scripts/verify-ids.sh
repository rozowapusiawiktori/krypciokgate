#!/bin/bash
cd /opt/krypciokgate
T=$(grep -m1 '^TOKEN=' banita.env | cut -d= -f2-)
for id in 5776233299424843260 5771851822897566479 5938539885907415367 5902206159095339799 5769126056262898415 6050588788021793070 5774022692642492953 6037249452824072506 5769248574499983619; do
  ok=$(curl -s -m 15 -X POST "https://api.telegram.org/bot${T}/getCustomEmojiStickers" -H 'Content-Type: application/json' -d "{\"custom_emoji_ids\":[\"$id\"]}" | grep -c '"ok":true')
  echo "$id -> $ok"
done
