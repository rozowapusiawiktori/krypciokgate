#!/usr/bin/env bash
# Wdrożenie / aktualizacja na serwerze. Użycie: bash scripts/deploy-git.sh
set -e
cd /opt/krypciokgate

echo "== pobieranie zmian =="
git pull --ff-only origin main

echo "== zależności =="
npm ci --omit=dev

echo "== restart =="
pm2 restart krypciokgate --update-env
pm2 save

echo "== kontrola =="
sleep 3
pm2 list | grep krypciokgate
node --check bot.js && echo "składnia OK"
