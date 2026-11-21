#!/bin/bash
cd /opt/krypciokgate
T=$(grep -m1 '^TOKEN=' banita.env | cut -d= -f2-)
CHAT=8806188013
API="https://api.telegram.org/bot${T}"

short='<tg-emoji emoji-id="5778672437122045013">📦</tg-emoji> B'
echo "dlugosc etykiety: ${#short}"
echo "=== E: KROTKA etykieta z tagiem"
curl -s -m 20 -X POST "$API/sendMessage" -H 'Content-Type: application/json' \
 -d "{\"chat_id\":$CHAT,\"text\":\"E: krotka etykieta z tagiem\",\"reply_markup\":{\"inline_keyboard\":[[{\"text\":\"$short\",\"callback_data\":\"e\"}]]}}" > /tmp/e.json
python3 - <<'PY'
import json
d=json.load(open('/tmp/e.json'))
t=d.get('result',{}).get('reply_markup',{}).get('inline_keyboard',[[]])[0][0].get('text','')
print('zwrocone przez API:', repr(t))
print('dlugosc:', len(t))
PY

long='<tg-emoji emoji-id="5778672437122045013">📦</tg-emoji> Bramki płatności'
echo "dlugosc dlugiej: ${#long}"
echo "=== F: DLUGA etykieta z tagiem"
curl -s -m 20 -X POST "$API/sendMessage" -H 'Content-Type: application/json' \
 -d "{\"chat_id\":$CHAT,\"text\":\"F: dluga etykieta z tagiem\",\"reply_markup\":{\"inline_keyboard\":[[{\"text\":\"$long\",\"callback_data\":\"f\"}]]}}" > /tmp/f.json
python3 - <<'PY'
import json
d=json.load(open('/tmp/f.json'))
r=d.get('result',{})
t=r.get('reply_markup',{}).get('inline_keyboard',[[]])[0][0].get('text','')
print('zwrocone przez API:', repr(t))
print('dlugosc:', len(t))
PY
