#!/bin/bash
python3 -c "import PIL; print('pillow', PIL.__version__)" 2>&1 | tail -2
which ffmpeg dwebp magick convert 2>&1
python3 - <<'PY'
import json
d=json.load(open('/tmp/set.json'))
for i,s in enumerate(d['result']['stickers'], start=1):
    print(i, s['custom_emoji_id'], s.get('emoji'))
PY
