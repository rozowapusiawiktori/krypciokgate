#!/bin/bash
cd /opt/krypciokgate
T=$(grep -m1 '^TOKEN=' banita.env | cut -d= -f2-)
for try in 1 2 3 4 5; do
  out=$(curl -s -m 25 "https://api.telegram.org/bot${T}/getStickerSet?name=tgiosicons")
  echo "try $try: $(echo "$out" | head -c 180)"
  if echo "$out" | grep -q '"ok":true'; then
    echo "$out" > /tmp/set2.json
    break
  fi
  sleep 5
done
if [ -f /tmp/set2.json ]; then
python3 - <<'PY'
import json
d=json.load(open('/tmp/set2.json'))
r=d['result']
print('TITLE:', r.get('title'), 'TYPE:', r.get('sticker_type'), 'COUNT:', len(r.get('stickers',[])))
PY
fi
