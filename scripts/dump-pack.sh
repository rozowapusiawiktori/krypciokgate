#!/bin/bash
mkdir -p /tmp/emo && cd /tmp/emo
python3 - <<'PY'
import json
d=json.load(open('/tmp/set.json'))
r=d.get('result',{})
for i,s in enumerate(r.get('stickers',[])):
    print(i, s.get('custom_emoji_id'), s.get('thumbnail',{}).get('file_id',''))
PY
