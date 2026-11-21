#!/bin/bash
cd /opt/krypciokgate
pm2 describe krypciokgate | sed -n '1,20p'
echo "--- ostatni start"
tail -3 logs/out.log
