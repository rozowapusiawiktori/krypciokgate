#!/bin/bash
cd /opt/krypciokgate
cp /tmp/bot.js bot.js
cp /tmp/banita.png banita.png
cp -r /tmp/tpl/. template/
pm2 restart krypciokgate >/dev/null
sleep 5
curl -s -o /dev/null -w 'health:%{http_code}\n' http://127.0.0.1:8080/health
tail -6 /root/.pm2/logs/krypciokgate-error.log 2>/dev/null | tail -4
