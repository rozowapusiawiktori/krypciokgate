#!/usr/bin/env bash
# ============================================================
# Zrzut bazy + sekretów ze STAREGO VPS — do przeniesienia na nowy.
# Uruchom jako root NA STARYM serwerze:
#   bash dump-for-migration.sh
# Wynik: /root/kcg-migration.tar.gz  ->  wgraj na nowy do /root/kcg-restore/
# ============================================================
set -euo pipefail

OUT=/root/kcg-migration.tar.gz
WORK=/root/kcg-mig-tmp

rm -rf "$WORK"; mkdir -p "$WORK"

echo "==> banita.env"
[ -f /opt/krypciokgate/banita.env ] || { echo "brak banita.env"; exit 1; }
cp /opt/krypciokgate/banita.env "$WORK/banita.env"
chmod 600 "$WORK/banita.env"

echo "==> klucz deploy (jesli jest)"
[ -f /root/.ssh/id_deploy ] && cp /root/.ssh/id_deploy "$WORK/id_deploy" && chmod 600 "$WORK/id_deploy" || true

echo "==> mongodump"
systemctl start mongod 2>/dev/null || true
if command -v mongodump >/dev/null 2>&1; then
	mongodump --db banita --out "$WORK/mongo-dump"
else
	echo "!! brak mongodump — doinstaluj: apt-get -y install mongodb-database-tools"
	exit 1
fi

echo "==> commit"
git -C /opt/krypciokgate rev-parse HEAD > "$WORK/commit.txt" 2>/dev/null || true

echo "==> pakowanie"
tar -czf "$OUT" -C "$WORK" .
chmod 600 "$OUT"
rm -rf "$WORK"

echo
echo "GOTOWE: $OUT ($(du -h "$OUT" | cut -f1))"
echo "Na nowy serwer:"
echo "  scp $OUT root@<NOWY_IP>:/root/kcg-restore.tar.gz"
echo "  ssh root@<NOWY_IP> 'mkdir -p /root/kcg-restore && tar -xzf /root/kcg-restore.tar.gz -C /root/kcg-restore'"
