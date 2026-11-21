#!/usr/bin/env bash
# ============================================================
# KrypciokGate — jednorazowy setup serwera (Ubuntu 22.04 / 24.04 / 26.04)
# Uruchom jako root: bash scripts/setup-vps.sh
# ============================================================
set -euo pipefail

APP_USER="${APP_USER:-krypciok}"
APP_DIR="${APP_DIR:-/opt/krypciokgate}"

echo "==> Aktualizacja systemu"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get -y upgrade

echo "==> Podstawowe pakiety"
apt-get -y install curl git unzip ufw ca-certificates gnupg cron lsb-release

echo "==> Firewall"
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Node.js 20 (jeśli brak)"
if ! command -v node >/dev/null 2>&1; then
	curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
	apt-get -y install nodejs
fi

# MongoDB: oficjalne repo tylko dla wersji, które je mają.
# Ubuntu 26.04+ nie ma już 7.0 — wtedy bierzemy 8.0, a jeśli repo nie zna
# danej wersji systemu, cofamy się do najnowszej znanej (jammy/noble).
echo "==> MongoDB"
if ! command -v mongod >/dev/null 2>&1 && [ ! -x /opt/mongodb/bin/mongod ]; then
	. /etc/os-release
	CODENAME="${VERSION_CODENAME:-unknown}"
	MONGO_VER=""
	MONGO_CODENAME=""

	for PAIR in "8.0:${CODENAME}" "7.0:${CODENAME}" "8.0:noble" "7.0:jammy"; do
		V="${PAIR%%:*}"; C="${PAIR##*:}"
		# samo Repo Release nie wystarcza — nowe Ubuntu ma puste repo bez paczek
		if curl -fsS --max-time 15 "https://repo.mongodb.org/apt/ubuntu/dists/${C}/mongodb-org/${V}/multiverse/binary-amd64/Packages.gz" 2>/dev/null \
			| gunzip -c 2>/dev/null | grep -q "Package: mongodb-org-server"; then
			MONGO_VER="$V"; MONGO_CODENAME="$C"; break
		fi
	done

	if [ -n "$MONGO_VER" ]; then
		echo "   repo: MongoDB ${MONGO_VER} / ${MONGO_CODENAME}"
		curl -fsSL "https://www.mongodb.org/static/pgp/server-${MONGO_VER}.asc" \
			| gpg --dearmor -o "/usr/share/keyrings/mongodb-server-${MONGO_VER}.gpg"
		echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-${MONGO_VER}.gpg ] https://repo.mongodb.org/apt/ubuntu ${MONGO_CODENAME}/mongodb-org/${MONGO_VER} multiverse" \
			> "/etc/apt/sources.list.d/mongodb-org-${MONGO_VER}.list"
		apt-get update -y
		if ! apt-get -y install mongodb-org; then
			echo "   instalacja z repo nieudana — tarball"
			MONGO_VER=""
		fi
	fi

	# Fallback: oficjalny tarball + własny unit systemd (odporne na wersję Ubuntu)
	if [ -z "$MONGO_VER" ]; then
		echo "   repo nie ma paczek — instaluje z tarballa"
		ARCH=$(uname -m)
		if [ "$ARCH" != "x86_64" ]; then
			echo "!! MongoDB tarball: nieobslugiwana architektura $ARCH"
			exit 1
		fi
		MURL=""
		for MV in 8.0.4 8.0.1 7.0.14 6.0.16; do
			for MT in ubuntu2404 ubuntu2204; do
				CAND="https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-${MT}-${MV}.tgz"
				if curl -fsS -o /dev/null --max-time 20 -I "$CAND" 2>/dev/null; then MURL="$CAND"; break 2; fi
			done
		done
		[ -n "$MURL" ] || { echo "!! brak tarballa MongoDB"; exit 1; }
		id mongodb >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin mongodb
		mkdir -p /opt/mongodb /var/lib/mongodb /var/log/mongodb
		curl -fsSL --max-time 300 -o /tmp/mongo.tgz "$MURL"
		tar -xzf /tmp/mongo.tgz -C /opt/mongodb --strip-components=1
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
		ln -sf /opt/mongodb/bin/mongod /usr/local/bin/mongod
		systemctl daemon-reload
	fi

	systemctl enable --now mongod
	sleep 2
	systemctl is-active --quiet mongod || { echo "!! mongod nie startuje"; tail -n 20 /var/log/mongodb/mongod.log 2>/dev/null; exit 1; }
fi

echo "==> Biblioteki dla Puppeteer / Chromium"
# Ubuntu 24.04+ ma libasound2t64, starsze libasound2
ALSA_PKG=libasound2
if apt-cache show libasound2t64 >/dev/null 2>&1; then ALSA_PKG=libasound2t64; fi
BASE_LIBS="libnss3 libgbm1 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libcups2 libdrm2 libpango-1.0-0 libcairo2 libatk1.0-0 libatk-bridge2.0-0 ${ALSA_PKG}"
if ! apt-get -y install chromium-browser $BASE_LIBS; then
	echo "   chromium-browser niedostepny — probuje chromium"
	apt-get -y install chromium $BASE_LIBS
fi
# Snap-owy chromium (Ubuntu 24.04+) wymaga snapd
if command -v chromium >/dev/null 2>&1 && head -c 200 "$(command -v chromium)" 2>/dev/null | grep -q snap; then
	apt-get -y install snapd || true
fi

echo "==> PM2"
npm i -g pm2

echo "==> Caddy (reverse proxy 80/443)"
if ! command -v caddy >/dev/null 2>&1; then
	apt-get -y install debian-keyring debian-archive-keyring apt-transport-https
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
	apt-get update -y
	apt-get -y install caddy
fi
CADDY_SRC=""
for CAND in "$APP_DIR/scripts/Caddyfile" "$(dirname "${BASH_SOURCE[0]}")/Caddyfile"; do
	if [ -f "$CAND" ]; then CADDY_SRC="$CAND"; break; fi
done
if [ -n "$CADDY_SRC" ]; then
	cp "$CADDY_SRC" /etc/caddy/Caddyfile
	systemctl enable --now caddy
	systemctl reload caddy 2>/dev/null || systemctl restart caddy
fi

echo "==> Użytkownik aplikacji: ${APP_USER}"
id -u "$APP_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$APP_USER"

mkdir -p "$APP_DIR"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

echo "==> Test Chromium (Puppeteer)"
if [ -x /opt/krypciokgate/node_modules/.bin/../../node_modules/puppeteer ] 2>/dev/null; then :; fi
node -e '
const p=require("/opt/krypciokgate/node_modules/puppeteer");
p.launch({headless:true,args:["--no-sandbox","--disable-setuid-sandbox"]})
 .then(async b=>{await b.close();console.log("   Puppeteer OK");})
 .catch(e=>console.log("   Puppeteer FAIL:",e.message.split("\n")[0]));
' 2>/dev/null || echo "   (puppeteer sprawdz po npm ci)"

echo "==> Gotowe"
echo "Dalej:"
echo "  cd ${APP_DIR} && cp banita.env.example banita.env && chmod 600 banita.env && nano banita.env"
echo "  npm ci --omit=dev"
echo "  pm2 start ecosystem.config.js && pm2 save && pm2 startup"
