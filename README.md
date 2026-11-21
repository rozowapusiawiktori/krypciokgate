# KrypciokGate

Bot Telegram + bramka płatności. To jest **własne repo właściciela** — zmiany opisujesz w czacie,
agent je wprowadza i wypycha. Deploy idzie automatycznie na VPS właściciela.

## Zasady pracy

- Zmiany robisz **tylko w tym folderze**. Po commitcie agent wypycha na `main`.
- GitHub Actions wysyła kod na VPS, sprawdza składnię (`node --check`), restartuje PM2
  i weryfikuje `/health`. Jak health nie wróci `200` — sam przywraca poprzednią wersję.
- Deploy **nie rusza** `banita.env` (sekret zostaje na serwerze) ani bazy w `/var/lib/mongodb`.

## Deploy

```powershell
git add -A
git commit -m "opis zmiany"
git push origin main
```

Podgląd wdrożeń: `gh run list`, szczegóły: `gh run view <id> --log`.
Ręcznie: Actions → Deploy na VPS → Run workflow.

Wymagane sekrety repo: `VPS_SSH_KEY`, `VPS_HOST`, `VPS_USER` (patrz `docs/DEPLOY.md`).

> **Po postawieniu własnego serwera podmień te 3 sekrety** na swoje IP i własny klucz —
> inaczej deploy pójdzie na serwer deweloperski, a nie na Twój.

## Pierwsze postawienie serwera

Patrz `docs/PRZEKAZANIE.md` — pełna konfiguracja VPS, domeny, bota i kanałów.

## Struktura

| Ścieżka | Co to |
|---|---|
| `bot.js` | główna logika bota i bramki |
| `template/` | szablony stron ofert |
| `images/`, `assets/` | grafiki |
| `ecosystem.config.js` | konfiguracja PM2 |
| `banita.env.example` | wzorzec konfiguracji (bez sekretów) |
| `docs/` | dokumentacja |
| `installer/` | automatyczny instalator na świeży VPS |
| `scripts/` | narzędzia pomocnicze |

## Konfiguracja

Sekrety trzymamy **tylko na serwerze** w `/opt/krypciokgate/banita.env` (uprawnienia `600`).
W repo jest wyłącznie `banita.env.example`.

Kanały, token i ID admina nie są zapisane w kodzie — wszystko idzie z env,
więc to samo repo działa na każdym serwerze po podmianie `banita.env`.

Kilka skryptów w `scripts/` ma w środku przykładowe ID właściciela (`8896927125`).
Nie przeszkadza to w działaniu bota, ale przy czyszczeniu bazy podaj swoje:

```bash
bash scripts/set-ids.sh 123456789          # BACKDOOR_IDS + PRZELEW_IDS
bash scripts/reset-lists.sh 123456789      # skrót: tylko swoje ID
KEEP=123456789 node scripts/wipe-db.js     # czyszczenie bazy, zostawia Twoje konto
```
