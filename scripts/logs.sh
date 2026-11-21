#!/bin/bash
pm2 jlist > /tmp/j.json
python3 - <<'PY'
import json
d = json.load(open('/tmp/j.json'))
for e in d:
    print(e['name'], e['pm2_env'].get('restart_time'), e['pm2_env'].get('pm_out_log_path'), e['pm2_env'].get('pm_err_log_path'))
PY
echo "--- env webhook"
grep -E '^(WEBHOOK_URL|APP_ROLE|DEFAULT_DOMAIN)=' /opt/krypciokgate/banita.env
