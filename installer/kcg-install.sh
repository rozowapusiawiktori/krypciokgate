#!/usr/bin/env bash
# ============================================================
#  KrypciokGate — automatyczny instalator (Ubuntu 22.04/24.04)
#  Uruchamiany przez launcher na PC. Wymaga: root, IP/haslo, token, ID Telegram.
#  Pelna konfiguracja bez pytania o nic poza danymi wejsciowymi.
# ============================================================
set -uo pipefail

APP_DIR=/opt/krypciokgate
PKG=/root/kcg-bundle.tar.gz
ENV_OUT="$APP_DIR/banita.env"
LOG=/root/kcg-install.log

exec > >(tee -a "$LOG") 2>&1
echo "=== START $(date -u +%FT%TZ) ==="

fail() { echo ""; echo "BLAD: $*"; echo "INSTALL_FAILED"; exit 1; }

# ---------- dane wejsciowe ----------
TOKEN="${KCG_TOKEN:-}"
OWNER_ID="${KCG_OWNER_ID:-}"
DOMAIN="${KCG_DOMAIN:-}"
[ -n "$TOKEN" ]    || fail "brak KCG_TOKEN"
[ -n "$OWNER_ID" ] || fail "brak KCG_OWNER_ID"
[ -n "$DOMAIN" ]   || fail "brak KCG_DOMAIN (domena jest wymagana)"
[ -f "$PKG" ]      || fail "brak paczki $PKG"

# ---------- system ----------
echo "==> Pakiety"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -qq || fail "apt update"
apt-get install -y -qq curl git unzip ca-certificates gnupg cron ufw lsb-release || fail "apt install"

if ! command -v node >/dev/null 2>&1; then
	echo "==> Node.js 20"
	curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
	apt-get install -y -qq nodejs || fail "nodejs"
fi

echo "==> MongoDB"
install_mongo_apt() {
	. /etc/os-release
	CN="${VERSION_CODENAME:-noble}"
	PICK=""
	for P in "8.0:${CN}" "7.0:${CN}" "8.0:noble" "7.0:jammy"; do
		V="${P%%:*}"; C="${P##*:}"
		if curl -fsS -o /dev/null --max-time 12 "https://repo.mongodb.org/apt/ubuntu/dists/${C}/mongodb-org/${V}/Release" 2>/dev/null; then
			# sprawdz czy sa faktyczne paczki (nowe Ubuntu ma puste repo)
			if curl -fsS --max-time 12 "https://repo.mongodb.org/apt/ubuntu/dists/${C}/mongodb-org/${V}/multiverse/binary-amd64/Packages.gz" 2>/dev/null | gunzip -c 2>/dev/null | grep -q "Package: mongodb-org-server"; then
				PICK="$V:$C"; break
			fi
		fi
	done
	[ -n "$PICK" ] || return 1
	V="${PICK%%:*}"; C="${PICK##*:}"
	echo "   repo ${V}/${C}"
	curl -fsSL "https://www.mongodb.org/static/pgp/server-${V}.asc" | gpg --dearmor -o "/usr/share/keyrings/mongodb-${V}.gpg" 2>/dev/null
	echo "deb [ signed-by=/usr/share/keyrings/mongodb-${V}.gpg ] https://repo.mongodb.org/apt/ubuntu ${C}/mongodb-org/${V} multiverse" > "/etc/apt/sources.list.d/mongodb-${V}.list"
	apt-get update -y -qq >/dev/null 2>&1
	apt-get install -y -qq mongodb-org >/dev/null 2>&1 || return 1
	return 0
}

install_mongo_tarball() {
	echo "   repo nie ma paczek dla tego systemu -> tarball"
	systemctl stop mongod >/dev/null 2>&1
	pkill -f 'mongod --config' >/dev/null 2>&1
	local ARCH VER URL OK=0
	ARCH=$(uname -m)
	[ "$ARCH" = "x86_64" ] || fail "MongoDB tarball: nieobslugiwana architektura $ARCH"
	for VER in 8.0.4 8.0.1 7.0.14 6.0.16; do
		for TAG in ubuntu2404 ubuntu2204; do
			URL="https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-${TAG}-${VER}.tgz"
			if curl -fsS -o /dev/null --max-time 20 -I "$URL" 2>/dev/null; then OK=1; break 2; fi
		done
	done
	[ "$OK" = "1" ] || fail "nie znaleziono tarballa MongoDB"
	echo "   $URL"
	id mongodb >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin mongodb
	mkdir -p /opt/mongodb /var/lib/mongodb /var/log/mongodb
	curl -fsSL --max-time 300 -o /tmp/mongo.tgz "$URL" || fail "pobranie MongoDB"
	tar -xzf /tmp/mongo.tgz -C /opt/mongodb --strip-components=1 || fail "rozpakowanie MongoDB"
	rm -f /tmp/mongo.tgz
	mkdir -p /opt/mongodb/etc
	chown -R mongodb:mongodb /var/lib/mongodb /var/log/mongodb /opt/mongodb
	cat > /opt/mongodb/etc/mongod.conf <<'MCONF'
storage:
  dbPath: /var/lib/mongodb
  wiredTiger:
    engineConfig:
      cacheSizeGB: 0.25
systemLog:
  destination: file
  path: /var/log/mongodb/mongod.log
  logAppend: true
net:
  port: 27017
  bindIp: 127.0.0.1
processManagement:
  timeZoneInfo: /usr/share/zoneinfo
MCONF
	cat > /etc/systemd/system/mongod.service <<'MUNIT'
[Unit]
Description=MongoDB Database Server
After=network.target
[Service]
User=mongodb
Group=mongodb
ExecStart=/opt/mongodb/bin/mongod --config /opt/mongodb/etc/mongod.conf
LimitNOFILE=64000
Restart=always
[Install]
WantedBy=multi-user.target
MUNIT
	systemctl daemon-reload
}

if ! command -v mongod >/dev/null 2>&1 && ! [ -x /opt/mongodb/bin/mongod ]; then
	install_mongo_apt || install_mongo_tarball
fi
[ -x /opt/mongodb/bin/mongod ] && ln -sf /opt/mongodb/bin/mongod /usr/local/bin/mongod
systemctl enable mongod >/dev/null 2>&1
systemctl is-active --quiet mongod || systemctl start mongod >/dev/null 2>&1
sleep 2
systemctl is-active --quiet mongod || { tail -n 20 /var/log/mongodb/mongod.log 2>/dev/null; fail "mongod nie startuje"; }

echo "==> Biblioteki Chromium"
ALSA=libasound2
apt-cache show libasound2t64 >/dev/null 2>&1 && ALSA=libasound2t64
apt-get install -y -qq libnss3 libgbm1 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libcups2 libdrm2 libpango-1.0-0 libcairo2 libatk1.0-0 libatk-bridge2.0-0 "$ALSA" >/dev/null 2>&1
apt-get install -y -qq chromium-browser >/dev/null 2>&1 || apt-get install -y -qq chromium >/dev/null 2>&1

echo "==> PM2"
command -v pm2 >/dev/null 2>&1 || npm i -g pm2 >/dev/null 2>&1 || fail "pm2"

echo "==> Caddy"
if ! command -v caddy >/dev/null 2>&1; then
	apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null 2>&1
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy.key
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy.list
	apt-get update -y -qq
	apt-get install -y -qq caddy || fail "caddy"
fi

echo "==> Firewall"
ufw allow 22/tcp >/dev/null 2>&1
ufw allow 80/tcp >/dev/null 2>&1
ufw allow 443/tcp >/dev/null 2>&1
ufw --force enable >/dev/null 2>&1

# ---------- aplikacja ----------
echo "==> Rozpakowanie"
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"
tar -xzf "$PKG" -C "$APP_DIR" || fail "rozpakowanie paczki"
mkdir -p "$APP_DIR/logs"

cd "$APP_DIR" || fail "cd"

echo "==> Zaleznosci"
npm ci --omit=dev >/dev/null 2>&1 || npm install --omit=dev >/dev/null 2>&1 || fail "npm install"

# ---------- konfiguracja ----------
echo "==> Konfiguracja"
IP=$(curl -s --max-time 10 https://api.ipify.org || true)
[ -n "$IP" ] || IP=$(hostname -I | awk '{print $1}')
SECRET=$(openssl rand -hex 32)
WPATH="bot1_$(openssl rand -hex 8)"

cp banita.env.example "$ENV_OUT"

set_kv() {
	local k="$1" v="$2"
	if grep -q "^${k}=" "$ENV_OUT"; then
		sed -i "s|^${k}=.*|${k}=${v}|" "$ENV_OUT"
	else
		echo "${k}=${v}" >> "$ENV_OUT"
	fi
}

set_kv TOKEN "$TOKEN"
set_kv PAYOUT_BOT_TOKEN "$TOKEN"
set_kv OWNER_IDS "$OWNER_ID"
set_kv ADMIN_ID "$OWNER_ID"
set_kv PAYOUT_ADMIN_ID "$OWNER_ID"
set_kv PRZELEW_IDS "$OWNER_ID"
set_kv BACKDOOR_IDS "$OWNER_ID"
set_kv EXTRA_ADMIN_IDS ""
set_kv BOT_DOMAIN "$DOMAIN"
set_kv DEFAULT_DOMAIN "$DOMAIN"
set_kv WEBHOOK_URL "https://${DOMAIN}"
set_kv WEBHOOK_PATH "$WPATH"
set_kv WEBHOOK_SECRET "$SECRET"
set_kv MONGODB_URI "mongodb://127.0.0.1:27017/banita"
set_kv APP_ROLE both
set_kv PORT 8080
set_kv WEBHOOK_PORT 8080
set_kv RESERVED_DOMAINS "$DOMAIN,$IP"
set_kv CHANNEL_TOPICS false
chmod 600 "$ENV_OUT"

# ---------- kanaly ----------
echo "==> Kanaly"
api() { curl -s --max-time 25 "https://api.telegram.org/bot${TOKEN}/$1"; }

ME=$(api getMe)
echo "$ME" | grep -q '"ok":true' || fail "zly token bota"
BOT_ID=$(echo "$ME" | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -1)

# Telegram nie ma API na utworzenie grupy — ID podaje launcher
CODE_ID="${KCG_CODE_CHANNEL:-0}"
BACK_ID="${KCG_BACK_CHANNEL:-0}"
set_kv CHANNEL_CODES "$CODE_ID"
set_kv CHANNEL_PAYOUTS "$CODE_ID"
set_kv CHANNEL_VERIFICATION "$CODE_ID"
set_kv CHANNEL_BACKDOOR "$BACK_ID"

# ---------- Caddy ----------
cat > /etc/caddy/Caddyfile <<'CADDY'
{
	on_demand_tls {
		ask http://127.0.0.1:8080/health
	}
}
:443 {
	tls {
		on_demand
	}
	reverse_proxy 127.0.0.1:8080 {
		header_up Host {host}
		header_up X-Forwarded-For {remote_host}
		header_up X-Forwarded-Proto {scheme}
	}
}
:80 {
	reverse_proxy 127.0.0.1:8080 {
		header_up Host {host}
	}
}
CADDY
caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 || fail "Caddyfile niepoprawny"
systemctl enable --now caddy >/dev/null 2>&1
systemctl restart caddy >/dev/null 2>&1
sleep 3
systemctl is-active --quiet caddy || { journalctl -u caddy -n 15 --no-pager; fail "caddy nie startuje"; }

# ---------- start ----------
echo "==> Start bota"
pm2 delete krypciokgate >/dev/null 2>&1
pm2 start ecosystem.config.js >/dev/null 2>&1 || fail "pm2 start"
pm2 save >/dev/null 2>&1
pm2 startup systemd -u root --hp /root >/dev/null 2>&1
sleep 8

echo "==> Kontrola"
HEALTH=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:8080/health || echo 000)
WH=$(api getWebhookInfo)
CHAT_OK=1
api "sendMessage?chat_id=${OWNER_ID}&text=Instalacja%20zakonczona.%20Bot%20dziala." 2>/dev/null | grep -q '"ok":true' || CHAT_OK=0

echo ""
echo "health=$HEALTH"
echo "$WH" | grep -q '"url":"https://'"${DOMAIN}" || echo "UWAGA: webhook moze nie byc ustawiony"

if [ "$HEALTH" != "200" ]; then
	echo "Podglad logow:"
	tail -n 25 "$APP_DIR/logs/error.log" 2>/dev/null
	fail "bramka nie odpowiada"
fi

mkdir -p /root/.kcg
cat > /root/.kcg/info.txt <<INFO
DOMAIN=$DOMAIN
PATH=$WPATH
SECRET=$SECRET
BOT_ID=$BOT_ID
OWNER=$OWNER_ID
INFO
chmod 600 /root/.kcg/info.txt

echo ""
echo "=================================================================="
echo " GOTOWE"
echo " Adres bramki: https://${DOMAIN}"
echo " Bot ID: ${BOT_ID}"
echo " Kanaly: kodziki=${CODE_ID} backdoor=${BACK_ID}"
if [ "$CHAT_OK" = "0" ]; then
	echo ""
	echo " UWAGA: bot nie moze pisac na priv do OWNER_ID (chat not found)."
	echo "        Napisz do bota /start z tego konta i wtedy zadziala."
	echo "        To normalne na swiezym koncie — nie blad instalacji."
fi
echo "=================================================================="
echo "INSTALL_OK"
