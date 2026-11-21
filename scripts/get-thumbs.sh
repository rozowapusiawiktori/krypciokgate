#!/bin/bash
cd /opt/krypciokgate
T=$(grep -m1 '^TOKEN=' banita.env | cut -d= -f2-)
rm -rf /tmp/emo && mkdir -p /tmp/emo
python3 - <<'PY' > /tmp/ids.txt
import json
d=json.load(open('/tmp/set.json'))
for s in d['result']['stickers']:
    print(s['custom_emoji_id'], s['thumbnail']['file_id'])
PY
i=0
while read id fid; do
  for try in 1 2 3 4; do
    path=$(curl -s -m 20 "https://api.telegram.org/bot${T}/getFile?file_id=${fid}" | python3 -c 'import json,sys
try:
    print(json.load(sys.stdin).get("result",{}).get("file_path",""))
except Exception:
    print("")')
    if [ -n "$path" ]; then
      curl -s -m 25 -o "/tmp/emo/${i}.png" "https://api.telegram.org/file/bot${T}/${path}"
      break
    fi
    sleep 5
  done
  i=$((i+1))
  sleep 2
done < /tmp/ids.txt
echo "pobrano:"; ls /tmp/emo | wc -l
