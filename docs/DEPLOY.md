# Deploy — konfiguracja dla nowego repo

Repo jest osobne, serwer jest osobny. Poniżej jednorazowa konfiguracja, po której
push na `main` sam wdraża zmiany.

## 1. Sekrety repo

W repo: Settings → Secrets and variables → Actions → New repository secret:

| Sekret | Wartość |
|---|---|
| `VPS_HOST` | IP serwera |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | zawartość klucza **prywatnego** (całość, z `BEGIN`/`END`) |

## 2. Klucz SSH

Wygeneruj parę (bez hasła):

```powershell
ssh-keygen -t ed25519 -f .deploy/ci_key -N '""' -C "github-actions-deploy"
```

Klucz **publiczny** (`ci_key.pub`) dopisz na serwerze:

```bash
mkdir -p /root/.ssh && chmod 700 /root/.ssh
echo 'TU_WKLEJ_KLUCZ_PUBLICZNY' >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
```

Cały klucz **prywatny** wklej jako sekret `VPS_SSH_KEY`.

`.deploy/` jest w `.gitignore` — klucz zostaje lokalnie.

## 3. Weryfikacja

Zrób pusty commit i push. W Actions ma pojawić się zielony przebieg z `DEPLOY OK`
oraz `health=200`. Na serwerze:

```bash
pm2 list          # jeden proces krypciokgate, status online
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/health
```

## Cofnięcie zmiany

```powershell
git revert HEAD
git push origin main
```

Workflow sam przywraca `bot.js` z `/root/kcg-rollback/`, jeśli health po wdrożeniu nie wróci `200`.
