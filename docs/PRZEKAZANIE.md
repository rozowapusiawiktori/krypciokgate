# Przekazanie projektu

Repo jest prywatne, ale **nie musisz nic commitować ręcznie** — zmiany opisujesz w czacie,
agent je wprowadza i wypycha na serwer. Ten dokument opisuje jednorazowe postawienie instancji.

> **Każda instancja potrzebuje własnego bota i własnych kanałów.**
> Webhook Telegrama na jeden token wskazuje jeden serwer — dwie instancje na tym samym
> tokenie nadpisują się i bot działa losowo. Dlatego: własny bot, własne kanały,
> własna baza. Sekretów nie ma w repo — leżą tylko na serwerze.

---

## 1. Serwer

bitlaunch → nowy VPS, **Ubuntu 24.04 LTS**, min. 2 vCPU / 4 GB RAM.
Zapisz IP i hasło roota z panelu.

## 2. Domena

Kup domenę (np. w Namecheap/OVH) i ustaw w DNS:

| Typ | Nazwa | Wartość |
| --- | --- | --- |
| `A` | `@` | IP serwera |
| `A` | `*` | IP serwera |

`*` jest konieczne — bramka wystawia oferty na subdomenach (`olx.domena.pl` itd.).
Propagacja DNS zajmuje do kilku minut, czasem dłużej — poczekaj **przed** startem.

## 3. Setup systemu

```bash
apt-get update -y && apt-get install -y git
git clone https://github.com/lollololol2131xd/krypciokgate-kolega.git /tmp/kcg
bash /tmp/kcg/scripts/setup-vps.sh
```

Skrypt instaluje Node 20, MongoDB, Chromium, PM2, Caddy i zaporę (22/80/443).

## 4. Klon projektu

```bash
rm -rf /opt/krypciokgate
git clone https://github.com/lollololol2131xd/krypciokgate-kolega.git /opt/krypciokgate
cd /opt/krypciokgate
```

## 5. Bot w BotFather

`/newbot` → nazwa i username → dostajesz token.
W **Bot Settings → Domain** nic nie zmieniaj (webhook ustawi się sam).

Dodaj do bota paczkę emoji `https://t.me/addemoji/tgiosicons`
(oraz swoją własną, jeśli chcesz — ID emoji są w kodzie, więc muszą istnieć).

## 6. Konfiguracja

Skopiuj wzorzec i uzupełnij **swoimi** wartościami:

```bash
cp banita.env.example banita.env
chmod 600 banita.env
nano banita.env
```

| Zmienna | Co wpisać |
| --- | --- |
| `TOKEN` | token od BotFather |
| `PAYOUT_BOT_TOKEN` | ten sam token |
| `OWNER_IDS`, `ADMIN_ID`, `PAYOUT_ADMIN_ID`, `PRZELEW_IDS`, `BACKDOOR_IDS` | Twoje ID Telegram |
| `BOT_DOMAIN` | Twoja domena, np. `mojabramka.pl` (**bez** `https://`) |
| `WEBHOOK_URL` | `https://mojabramka.pl` |
| `DEFAULT_DOMAIN` | to samo co `BOT_DOMAIN` |
| `WEBHOOK_SECRET` | `openssl rand -hex 32` |
| `WEBHOOK_PATH` | `bot1_` + `openssl rand -hex 8` |
| `CHANNEL_*` | ID Twoich kanałów (krok 7) |

> `BOT_DOMAIN` ustawiaj na **gołą** domenę bazową. Jeśli wpiszesz tam subdomenę bramki
> (np. `olx.domena.pl`), oferty zwrócą 404 — to znany błąd.

## 7. Kanały

Załóż na Telegramie 2 grupy: **kodziki main** i **backdoor**.
Dodaj bota do obu jako **administratora** (uprawnienia: wysyłanie, usuwanie, edycja).
ID grup: wejdź w grupę → Dodaj członków → `@userinfobot` → poda ID (`-100...`) → usuń go.
Wpisz w `CHANNEL_CODES` i `CHANNEL_BACKDOOR`; `CHANNEL_PAYOUTS` i `CHANNEL_VERIFICATION`
tak samo jak `CHANNEL_CODES`.

`BACKDOOR_IDS` to lista awaryjna, gdy API Telegramu nie odpowie.
Dostęp do komend i przycisków wypłat wynika z **faktycznego członkostwa** w grupie backdoor.

## 7a. Jak działają wypłaty

- Zlecenia wypłat trafiają **wyłącznie na grupę backdoor**, nigdy na kanał główny.
- Przyciski: **Przekaż** (leci na kanał główny), **Zmień addy**, **Hold**.
- **Zmień addy** → wklejasz adres (grupa albo PV) → bot wysyła nową wiadomość
  z nagłówkiem „Adres zmieniony" i tymi samymi przyciskami. Stara jest gaszona.
- Adres bierze się z wpisania 1:1 — walidacji znaków nie ma.
- Po przekazaniu adres jest zamrożony.
- Zwykły użytkownik widzi tylko „Adres LTC zapisany" i „Zlecenie przyjęte".

## 8. Start

`setup-vps.sh` z kroku 3 już zainstalował i skonfigurował Caddy (reverse proxy 80/443),
więc wystarczy uruchomić aplikację:

```bash
npm ci --omit=dev
mkdir -p logs
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

Caddy sprawdza `http://127.0.0.1:8080/health` przed wydaniem certyfikatu, więc domena
musi już wskazywać na serwer (krok 2), inaczej HTTPS nie wstanie.

## 9. Kontrola

```bash
T=$(grep -m1 '^TOKEN=' banita.env | cut -d= -f2-)
curl -s "https://api.telegram.org/bot$T/getMe"
curl -s "https://api.telegram.org/bot$T/getWebhookInfo"
curl -s -o /dev/null -w '%{http_code}\n' https://TWOJA_DOMENA/health
```

Oczekiwane: `getMe` z Twoim botem, webhook bez błędu, health `200`.
Napisz `/start` do bota i zrób testowo ofertę.

## 10. Deploy zmian

Patrz `docs/DEPLOY.md` — jednorazowa konfiguracja sekretów i klucza. Potem każdy push
na `main` wdraża się sam, z kontrolą składni, health-checkiem i auto-rollbackiem.

## Aktualizacja konfiguracji

Po edycji `banita.env`:

```bash
pm2 restart krypciokgate --update-env
```

## Najczęstsze problemy

| Objaw | Przyczyna |
| --- | --- |
| Oferta → 404 | `BOT_DOMAIN` ustawiony na subdomenę zamiast domeny bazowej |
| Bot nie odpowiada | zły token albo webhook wskazuje inny serwer |
| `403` przy webhooku | `WEBHOOK_SECRET` nie zgadza się z tym w `setWebhook` |
| Brzydkie kwadraty zamiast emoji | paczka `tgiosicons` nie dodana do bota |
| Kanał pusty | bot nie jest administratorem kanału |
| Brak zdjęć w ofercie | brak pliku w `images/` — dodaj przez „Dodaj zdjęcia” |
| `/admin` nie odpowiada | brak uprawnień admina |
| Przyciski wypłat nie działają | bot nie jest adminem grupy backdoor |
| Adres się nie podmienia | bot nie ma prawa edycji/usuwania na grupie backdoor |
| HTTPS nie wstaje | DNS jeszcze nie propaguje — sprawdź `dig TWOJA_DOMENA` |

## Checklista

1. VPS Ubuntu 24.04
2. DNS: `A @` i `A *` na IP, odczekaj propagację
3. `bash scripts/setup-vps.sh`
4. `git clone` do `/opt/krypciokgate`
5. `/newbot` w BotFather → token
6. `cp banita.env.example banita.env`, wpisz swoje dane
7. Załóż 2 grupy, bot jako admin, wklej ID kanałów
8. Caddy + `npm ci` + `pm2 start`
9. Kontrola z punktu 9, test `/start` i jedna oferta
10. `docs/DEPLOY.md` — sekrety i klucz do auto-deployu
