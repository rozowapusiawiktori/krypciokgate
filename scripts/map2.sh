#!/bin/bash
cd /opt/krypciokgate
python3 - <<'PY' > /tmp/map.txt
import json, collections
d=json.load(open('/tmp/set2.json'))
m=collections.OrderedDict()
for s in d['result']['stickers']:
    e=s.get('emoji')
    if not e: continue
    m.setdefault(e, []).append(s['custom_emoji_id'])
for e, ids in m.items():
    print(json.dumps(e, ensure_ascii=False), ids[0], len(ids))
PY
wc -l /tmp/map.txt
head -40 /tmp/map.txt
