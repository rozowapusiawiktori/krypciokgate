#!/bin/bash
cd /opt/krypciokgate
TOKEN=$(grep -m1 '^TOKEN=' banita.env | cut -d= -f2-)
echo "--- getMe"; curl -s "https://api.telegram.org/bot${TOKEN}/getMe" | head -c 250; echo
echo "--- offers olx w bazie"
mongosh banita --quiet --eval 'print(db.olxoffers.countDocuments({}))' 2>/dev/null || true
echo "--- pierwsza oferta olx"
mongosh banita --quiet --eval 'var o=db.olxoffers.findOne(); if(o){print(o.link)}' 2>/dev/null || true
echo "--- banita.png"
ls -l banita.png
echo "--- pm2"
pm2 jlist | head -c 200
echo
