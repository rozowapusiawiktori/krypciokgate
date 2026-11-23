#!/usr/bin/env bash
# ============================================================
# KrypciokGate — migracja na świeży VPS (Ubuntu 22.04 / 24.04)
#
# URUCHOM JAKO root NA NOWYM SERWERZE:
#   bash migrate-new-vps.sh
#
# ZANIM uruchomisz, wgraj na serwer (scp/SFTP) do /root/kcg-restore/:
#   banita.env          (WYMAGANE — sekrety)
#   mongo-dump/         (opcjonalnie — katalog ze zrzutem mongodump)
#   id_deploy           (opcjonalnie — klucz deploy do repo)
#
# Skrypt NIE wysyła nic na kanały Telegrama.
# ============================================================
set -euo pipefail

APP_USER="${APP_USER:-krypciok}"
APP_DIR="${APP_DIR:-/opt/krypciokgate}"
REPO="${REPO:-git@github.com:rozowapusiawiktori/krypciokgate.git}"
RESTORE_DIR="${RESTORE_DIR:-/root/kcg-restore}"
CF_TUNNEL_TOKEN="${CF_TUNNEL_TOKEN:-}"
DB_NAME="${DB_NAME:-banita}"

log()  { echo -e "\n\033[1;36m==> $*\033[0m"; }
warn() { echo -e "\033[1;33m[!] $*\033[0m"; }
die()  { echo -e "\033[1;31m[FAIL] $*\033[0m"; exit 1; }

# ------------------------------------------------------------
# 0. Preflight
# ------------------------------------------------------------
[ "$(id -u)" = "0" ] || die "uruchom jako root"
. /etc/os-release
echo "System: $PRETTY_NAME"

case "${VERSION_ID:-}" in
	22.04|24.04) : ;;
	*) warn "testowane na 22.04/24.04 — na ${PRETTY_NAME} mogą być niespodzianki" ;;
esac

command -v systemctl >/dev/null || die "brak systemd — to nie jest normalny VPS"

AVAIL_KB=$(df --output=avail -k / | tail -1 | tr -d ' ')
[ "$AVAIL_KB" -gt 8000000 ] || die "za mało miejsca na / (${AVAIL_KB} KB) — potrzeba >8 GB"
echo "Wolne miejsce na /: $((AVAIL_KB/1024/1024)) GB"

MEM_MB=$(( $(awk '/MemTotal/{print $2}' /proc/meminfo) / 1024 ))
echo "RAM: ${MEM_MB} MB"
[ "$MEM_MB" -ge 1800 ] || warn "mniej niż 2 GB RAM — dodam swap"

[ -f "$RESTORE_DIR/banita.env" ] || die "brak $RESTORE_DIR/banita.env — wgraj sekrety najpierw"

# ------------------------------------------------------------
# 1. Swap (zabezpieczenie przed OOM od chromium)
# ------------------------------------------------------------
if [ ! -f /swapfile ]; then
	log "Swap 2 GB"
	fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
	chmod 600 /swapfile
	mkswap /swapfile >/dev/null
	swapon /swapfile
	echo '/swapfile none swap sw 0 0' >> /etc/fstab
	sysctl -w vm.swappiness=20 >/dev/null
	echo 'vm.swappiness=20' > /etc/sysctl.d/99-kcg.conf
else
	echo "swap już jest — pomijam"
fi

# ------------------------------------------------------------
# 2. Kod aplikacji (przed setup-vps.sh, bo ten czyta scripts/Caddyfile)
# ------------------------------------------------------------
log "Klonowanie repo"
mkdir -p "$APP_DIR"
if [ -x "$RESTORE_DIR/id_deploy" ] || [ -f "$RESTORE_DIR/id_deploy" ]; then
	install -m 600 "$RESTORE_DIR/id_deploy" /root/.ssh/id_deploy
	[ -f /root/.ssh/known_hosts ] || ssh-keyscan -H github.com >> /root/.ssh/known_hosts 2>/dev/null || true
	export GIT_SSH_COMMAND="ssh -i /root/.ssh/id_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
fi
if [ -d "$APP_DIR/.git" ]; then
	git -C "$APP_DIR" fetch origin main --depth=1
	git -C "$APP_DIR" reset --hard origin/main
else
	git clone --depth=1 --branch main "$REPO" "$APP_DIR"
fi
echo "HEAD: $(git -C "$APP_DIR" rev-parse --short HEAD)"

# ------------------------------------------------------------
# 3. System: pakiety, node, mongo, chromium, pm2, caddy
# ------------------------------------------------------------
log "Setup systemu (scripts/setup-vps.sh)"
APP_USER="$APP_USER" APP_DIR="$APP_DIR" bash "$APP_DIR/scripts/setup-vps.sh" \
	|| die "setup-vps.sh padł — przerwij i przeczytaj błąd wyżej"

# ------------------------------------------------------------
# 4. Rotacja logów PM2 — tego brakowało na starym VPS
# ------------------------------------------------------------
# UWAGA: moduły PM2 są per-user — instalujemy na koncie aplikacji, nie roota.
log "pm2-logrotate (konto $APP_USER)"
as_app() { runuser -u "$APP_USER" -- "$@"; }
as_app pm2 install pm2-logrotate >/dev/null 2>&1 || warn "pm2-logrotate nie zainstalowany"
as_app pm2 set pm2-logrotate:max_size 20M        >/dev/null 2>&1 || true
as_app pm2 set pm2-logrotate:retain 5            >/dev/null 2>&1 || true
as_app pm2 set pm2-logrotate:compress true       >/dev/null 2>&1 || true
as_app pm2 set pm2-logrotate:rotateInterval '0 4 * * *' >/dev/null 2>&1 || true

# logrotate systemowy dla mongod
cat > /etc/logrotate.d/kcg-mongod <<'LR'
/var/log/mongodb/mongod.log {
	daily
	size 50M
	rotate 5
	compress
	missingok
	notifempty
	copytruncate
}
LR

# budżet dysku: alarm w cronie
cat > /etc/cron.d/kcg-disk-check <<'CRON'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
*/15 * * * * root U=$(df --output=pcent / | tail -1 | tr -dc 0-9); [ "$U" -ge 90 ] && { find /opt/krypciokgate/logs -name '*.log' -size +50M -exec truncate -s 0 {} \; ; runuser -u krypciok -- pm2 flush >/dev/null 2>&1; }
CRON

# ------------------------------------------------------------
# 5. Cloudflare Tunnel
# ------------------------------------------------------------
if [ -n "$CF_TUNNEL_TOKEN" ]; then
	log "Cloudflare Tunnel"
	if ! command -v cloudflared >/dev/null 2>&1; then
		mkdir -p /usr/share/keyrings
		curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
			| gpg --dearmor -o /usr/share/keyrings/cloudflare-main.gpg
		echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
			> /etc/apt/sources.list.d/cloudflared.list
		apt-get update -y && apt-get -y install cloudflared
	fi
	cloudflared service install "$CF_TUNNEL_TOKEN" || warn "tunel nie wystartował — sprawdź token"
	sleep 3
	systemctl is-active --quiet cloudflared && echo "   tunel aktywny" || warn "tunel NIE działa"
else
	warn "brak CF_TUNNEL_TOKEN — konfigurujesz tunel ręcznie (albo jedziesz na IP)"
fi

# ------------------------------------------------------------
# 6. Sekrety
# ------------------------------------------------------------
log "Przywracanie banita.env"
install -m 600 -o "$APP_USER" -g "$APP_USER" "$RESTORE_DIR/banita.env" "$APP_DIR/banita.env"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

# ------------------------------------------------------------
# 7. Baza
# ------------------------------------------------------------
if [ -d "$RESTORE_DIR/mongo-dump" ]; then
	log "Restore bazy $DB_NAME"
	DUMP_PATH="$RESTORE_DIR/mongo-dump"
	# mongodump tworzy podkatalog o nazwie bazy — wykryj oba warianty
	if [ -d "$DUMP_PATH/$DB_NAME" ]; then DUMP_PATH="$DUMP_PATH/$DB_NAME"; fi
	command -v mongorestore >/dev/null 2>&1 || apt-get -y install mongodb-database-tools >/dev/null 2>&1 || \
		warn "brak mongorestore — doinstaluj mongodb-database-tools ręcznie"
	if command -v mongorestore >/dev/null 2>&1; then
		mongorestore --drop --db "$DB_NAME" "$DUMP_PATH" || warn "restore zgłosił błąd"
	fi
else
	warn "brak $RESTORE_DIR/mongo-dump — baza będzie pusta (bot ją utworzy)"
fi
systemctl enable --now mongod >/dev/null 2>&1 || true

# ------------------------------------------------------------
# 8. Zależności i start
# ------------------------------------------------------------
log "npm ci"
cd "$APP_DIR"
sudo -u "$APP_USER" npm ci --omit=dev >/dev/null 2>&1 || sudo -u "$APP_USER" npm install --omit=dev >/dev/null 2>&1
node --check bot.js || die "błąd składni bot.js"

log "Start PM2"
mkdir -p "$APP_DIR/logs"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR/logs"
sudo -u "$APP_USER" pm2 start ecosystem.config.js >/dev/null
sudo -u "$APP_USER" pm2 save >/dev/null
env PATH="$PATH" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" >/dev/null 2>&1 || true

sleep 10
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:8080/health || echo 000)
echo "health lokalny = $CODE"

# ------------------------------------------------------------
# 9. Raport
# ------------------------------------------------------------
log "PODSUMOWANIE"
echo "HEAD:      $(git -C "$APP_DIR" rev-parse --short HEAD)"
echo "health:    $CODE"
echo "dysk /:    $(df -h / | tail -1)"
echo "swap:      $(free -m | awk '/Swap/{print $2" MB"}')"
echo "mongo:     $(systemctl is-active mongod 2>/dev/null || echo nieaktywny)"
echo "tunel:     $(systemctl is-active cloudflared 2>/dev/null || echo brak)"
pm2 list | grep -a krypciokgate || true

if [ "$CODE" != "200" ]; then
	warn "health != 200 — sprawdź: pm2 logs krypciokgate --lines 60"
	exit 2
fi

cat <<'DONE'

==> SERWER GOTOWY. Zostało po stronie Cloudflare/DNS:

1. Publiczny hostname tunelu -> http://127.0.0.1:8080
2. W banita.env popraw, jeśli zmieniasz domenę:
     WEBHOOK_URL=https://<nowa-domena>
     BOT_DOMAIN=<nowa-domena>
     DEFAULT_DOMAIN=<nowa-domena-bramki>
3. pm2 restart krypciokgate --update-env   (webhook przerejestruje się sam)
4. W GitHub -> Settings -> Secrets zaktualizuj VPS_HOST / VPS_USER / VPS_SSH_KEY
5. Stary VPS: zostaw włączony 48 h jako droga powrotu.

Na nowym IP nie odpalaj od razu scrapera — rozgrzej je dzień na samym bocie.
DONE
