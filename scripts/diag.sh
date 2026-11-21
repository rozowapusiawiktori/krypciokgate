#!/bin/bash
cd /opt/krypciokgate
echo "--- status"
pm2 describe krypciokgate | grep -E "status|uptime|restarts" | head -3
echo "--- banita.png"
ls -l banita.png 2>&1
echo "--- bledy (ostatnie 40 linii)"
tail -40 logs/error.log | cut -c1-200
echo "--- out (ostatnie 15)"
tail -15 logs/out.log | cut -c1-160
