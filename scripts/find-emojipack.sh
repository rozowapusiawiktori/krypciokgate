#!/bin/bash
cd /opt/krypciokgate
T=$(grep -m1 '^TOKEN=' banita.env | cut -d= -f2-)
# czy tgicons ma custom_emoji_id?
curl -s -m 20 "https://api.telegram.org/bot${T}/getStickerSet?name=tgicons" | grep -o 'custom_emoji_id' | head -1
for n in tgi tgio tg_ios tgios tg_icons tgi_icons ios_icons telegram_ios ios tgp tgpremium tg_premium; do
  for try in 1 2; do
    out=$(curl -s -m 20 "https://api.telegram.org/bot${T}/getStickerSet?name=${n}")
    if [ -n "$out" ] && ! echo "$out" | grep -q '502'; then
      if echo "$out" | grep -q '"ok":true'; then
        echo "== HIT $n -> $(echo "$out" | head -c 160)"
      fi
      break
    fi
    sleep 3
  done
done
