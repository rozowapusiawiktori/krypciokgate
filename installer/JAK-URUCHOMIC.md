# Jak postawić bota

Masz gotową maszynkę. Robisz tylko to, co niżej — reszta dzieje się sama.

## 1. Kup serwer (VPS)

- bitlaunch.io albo Hetzner — cokolwiek
- System: **Ubuntu 24.04**
- Najmniejszy plan wystarczy
- Dostaniesz mailem **IP** i **hasło roota**

## 2. Kup domenę i ustaw DNS

Domena jest potrzebna — bez niej nie ma HTTPS.

W panelu DNS dodaj dwa rekordy `A`:

| Nazwa | Wartość |
|---|---|
| `@` | IP serwera |
| `*` | IP serwera |

`*` jest konieczne (oferty chodzą na subdomenach). Odczekaj kilka minut na propagację.

## 3. Zrób bota

1. Napisz do **@BotFather** na Telegramie
2. `/newbot`, podaj nazwę
3. Skopiuj **token**

## 4. Załóż 2 grupy

- `kodziki main`
- `backdoor`

Dodaj bota do obu jako **administratora**. ID grup: dodaj `@userinfobot`, skopiuj `-100...`, usuń go.

## 5. Odpal instalator

1. Rozpakuj ZIP
2. Kliknij dwa razy `URUCHOM-TO.cmd`
3. Podaj: IP, hasło, token, swoje ID, ID grup, **swoją domenę**

Poczekaj 3-6 minut, nic nie klikaj.

## 6. Po instalacji

1. Napisz do bota `/start`
2. Wejdź na `https://twojadomena.pl/health` — ma być `ok`

## 7. Podmień deploy na swój serwer

Repo ma wpisany serwer deweloperski. Żeby Twój push wdrażał się u Ciebie:

1. Wygeneruj klucz: `ssh-keygen -t ed25519 -f .deploy/ci_key -N '""'`
2. Klucz publiczny (`.deploy/ci_key.pub`) dopisz na swoim serwerze:
   `echo 'KLUCZ' >> /root/.ssh/authorized_keys`
3. W repo: Settings → Secrets → Actions — ustaw `VPS_HOST` (Twoje IP),
   `VPS_USER` (`root`), `VPS_SSH_KEY` (cały klucz prywatny)

Szczegóły: `docs/DEPLOY.md`.

## Co jeśli coś nie wyjdzie

| Problem | Rozwiązanie |
|---|---|
| "Port 22 nie odpowiada" | zły IP albo serwer jeszcze wstaje — poczekaj 2 min |
| "Token odrzucony" | token ze spacją — zrób nowy przez `/newbot` |
| "chat not found" | napisz `/start` do bota i uruchom ponownie |
| HTTPS nie działa | DNS jeszcze nie propaguje — sprawdź `dig twojadomena.pl` |
