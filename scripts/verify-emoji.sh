#!/bin/bash
cd /opt/krypciokgate
T=$(grep -m1 '^TOKEN=' banita.env | cut -d= -f2-)
IDS='["5271993882492559766","5269274438049752598","5271666760603427350","5271792289612588924","5271790979647564149","5272019892814504151","5271721242263577490","5269769531814865334","5271588587903674739","5271470051101272581","5271710728183637588","5271811883253391120","5269500757056449381","5271540707608258213","5271918596010828714","5271882758803713012","5271704307207528291"]'
curl -s -m 25 -X POST "https://api.telegram.org/bot${T}/getCustomEmojiStickers" -H 'Content-Type: application/json' -d "{\"custom_emoji_ids\":${IDS}}" > /tmp/ce.json
python3 - <<'PY'
import json
d=json.load(open('/tmp/ce.json'))
print('ok:', d.get('ok'), 'count:', len(d.get('result',[])), d.get('description',''))
PY
