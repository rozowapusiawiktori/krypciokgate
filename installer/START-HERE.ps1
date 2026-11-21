# ============================================================
#  KrypciokGate — automatyczna instalacja na VPS
#  Uruchom: prawy klik -> "Uruchom w PowerShell"
#  (albo: powershell -ExecutionPolicy Bypass -File START-HERE.ps1)
# ============================================================

$ErrorActionPreference = 'Stop'
$pkg = Join-Path $PSScriptRoot 'kcg-bundle.tar.gz'

function Line { Write-Host ("-" * 62) -ForegroundColor DarkGray }
function Head($t) { Write-Host ""; Write-Host "  $t" -ForegroundColor Cyan; Line }
function Ok($t)   { Write-Host "  [OK] $t" -ForegroundColor Green }
function Bad($t)  { Write-Host "  [!]  $t" -ForegroundColor Yellow }

Clear-Host
Write-Host ""
Write-Host "  KRYPCIOKGATE — instalator" -ForegroundColor White
Write-Host "  Postawi bota i bramke na Twoim VPS" -ForegroundColor DarkGray
Line

if (-not (Test-Path $pkg)) {
	Bad "Brak paczki kcg-bundle.tar.gz obok tego pliku."
	Write-Host "  Skopiuj caly folder 'installer' od wlasciciela." -ForegroundColor DarkGray
	Write-Host ""; Read-Host "Enter, aby zamknac"; exit 1
}
Ok "Paczka znaleziona ($([math]::Round((Get-Item $pkg).Length/1MB,1)) MB)"

# ---------- SSH ----------
Head "1/6  Dane serwera"
Write-Host "  Potrzebujesz VPS z Ubuntu 24.04 (bitlaunch, Hetzner itp.)" -ForegroundColor DarkGray
$ip = (Read-Host "  IP serwera").Trim()
if (-not $ip) { Bad "Podaj IP."; Read-Host; exit 1 }

$user = (Read-Host "  Uzytkownik SSH [root]").Trim()
if (-not $user) { $user = 'root' }

$pass = Read-Host "  Haslo roota" -AsSecureString
$cred = New-Object System.Management.Automation.PSCredential($user, $pass)

Write-Host "  Sprawdzam polaczenie..."
try {
	$test = Test-NetConnection -ComputerName $ip -Port 22 -InformationLevel Quiet -WarningAction SilentlyContinue
} catch { $test = $false }
if (-not $test) { Bad "Port 22 nie odpowiada na $ip"; Read-Host; exit 1 }
Ok "Serwer osiagalny"

# ---------- Telegram ----------
Head "2/6  Token bota"
Write-Host "  W Telegramie: @BotFather -> /newbot -> wklej token" -ForegroundColor DarkGray
$token = (Read-Host "  Token").Trim()
if ($token -notmatch '^\d+:[A-Za-z0-9_-]{30,}$') { Bad "To nie wyglada na token."; Read-Host; exit 1 }

Write-Host "  Sprawdzam token..."
try {
	$me = Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/getMe" -TimeoutSec 20
} catch { Bad "Token odrzucony przez Telegram."; Read-Host; exit 1 }
if (-not $me.ok) { Bad "Token odrzucony przez Telegram."; Read-Host; exit 1 }
Ok "Bot: @$($me.result.username)"

Head "3/6  Twoje ID Telegram"
Write-Host "  Napisz do @userinfobot na Telegramie i podaj swoje ID" -ForegroundColor DarkGray
$ownerId = (Read-Host "  Twoje ID").Trim()
if ($ownerId -notmatch '^\d{6,}$') { Bad "ID to same cyfry."; Read-Host; exit 1 }
Ok "ID: $ownerId"

Write-Host ""
Write-Host "  WAZNE: teraz otworz bota i napisz do niego /start" -ForegroundColor Yellow
Write-Host "  (https://t.me/$($me.result.username))" -ForegroundColor DarkGray
Write-Host "  Bez tego Telegram nie pozwoli mu pisac na Twoje priv." -ForegroundColor DarkGray
$null = Read-Host "  Napisales /start? Enter"

Head "4/6  Kanaly"
Write-Host "  Zaloz 2 grupy: 'kodziki main' i 'backdoor', dodaj bota jako admina." -ForegroundColor DarkGray
Write-Host "  ID grup poda @userinfobot po dodaniu go do grupy." -ForegroundColor DarkGray
$chCode = (Read-Host "  ID kanalu kodziki").Trim()
$chBack = (Read-Host "  ID kanalu backdoor").Trim()
if ($chCode -notmatch '^-?\d{6,}$') { Bad "ID kanalu kodziki nieprawidlowe."; Read-Host; exit 1 }
if ($chBack -notmatch '^-?\d{6,}$') { Bad "ID kanalu backdoor nieprawidlowe."; Read-Host; exit 1 }

# ---------- domena ----------
Head "5/6  Domena"
Write-Host "  Podaj domene, ktora juz wskazuje na ten IP (rekordy A: @ i *)." -ForegroundColor DarkGray
Write-Host "  DNS musi byc ustawiony PRZED startem, inaczej HTTPS nie wstanie." -ForegroundColor DarkGray
$domain = (Read-Host "  Domena").Trim()
$domain = $domain -replace '^https?://', '' -replace '/+$', ''
if (-not $domain) { Bad "Domena jest wymagana."; Read-Host; exit 1 }
if ($domain -notmatch '^[a-z0-9.-]+\.[a-z]{2,}$') { Bad "To nie wyglada na domene."; Read-Host; exit 1 }
Ok "Domena: $domain"

Write-Host ""
Write-Host "  Sprawdzam DNS (rekord A dla $domain)..."
try {
	$resolved = (Resolve-DnsName $domain -Type A -ErrorAction Stop | Where-Object {$_.IPAddress} | Select-Object -First 1).IPAddress
} catch { $resolved = $null }
if (-not $resolved) {
	Bad "Domena jeszcze nie wskazuje na zadne IP — poczekaj na propagacje."
	Write-Host "  Ustaw rekordy A (@ i *) na $ip i uruchom ponownie." -ForegroundColor DarkGray
	$null = Read-Host "  Kontynuowac mimo to? Enter"
} elseif ($resolved -ne $ip) {
	Bad "Domena wskazuje na $resolved, a serwer to $ip."
	$null = Read-Host "  Kontynuowac mimo to? Enter"
} else {
	Ok "DNS wskazuje na $ip"
}

Head "6/6  Instalacja"
Write-Host "  Trwa 3-6 minut. Nie zamykaj okna." -ForegroundColor Yellow
Line

# ---------- sesja ----------
try {
	Import-Module Posh-SSH -ErrorAction Stop
} catch {
	Bad "Brak modulu Posh-SSH — instaluje..."
	$d = Join-Path $env:USERPROFILE 'Documents\WindowsPowerShell\Modules\Posh-SSH'
	New-Item -ItemType Directory -Force -Path $d | Out-Null
	$z = Join-Path $env:TEMP 'poshssh.zip'
	curl.exe -sL --max-time 120 -o $z 'https://www.powershellgallery.com/api/v2/package/Posh-SSH/3.2.0'
	Expand-Archive $z -DestinationPath $d -Force
	Import-Module Posh-SSH -ErrorAction Stop
	Ok "Modul zainstalowany"
}

Write-Host "  Lacze..."
$s = New-SSHSession -ComputerName $ip -Credential $cred -AcceptKey -ConnectionTimeout 30
if (-not $s) { Bad "Nie udalo sie zalogowac. Zle haslo?"; Read-Host; exit 1 }
Ok "Zalogowano na $ip"

Write-Host "  Wysylam paczke..."
try {
	Set-SCPItem -ComputerName $ip -Credential $cred -AcceptKey -Path $pkg -Destination '/root/' -Force | Out-Null
	Ok "Paczka wyslana"
} catch { Bad "Blad wysylania paczki: $_"; Remove-SSHSession -SSHSession $s; Read-Host; exit 1 }

$cmd = "export KCG_TOKEN='$token' KCG_OWNER_ID='$ownerId' KCG_DOMAIN='$domain' KCG_CODE_CHANNEL='$chCode' KCG_BACK_CHANNEL='$chBack'; bash /root/kcg-install.sh"

$out = Invoke-SSHCommand -SSHSession $s -Command $cmd -TimeOut 900
$text = ($out.Output -join "`n")
Write-Host $text

if ($text -match 'INSTALL_OK') {
	Line
	Write-Host ""
	Write-Host "  INSTALACJA ZAKONCZONA" -ForegroundColor Green
	Line
	Write-Host ""
	Write-Host "  Adres bramki:  https://$domain" -ForegroundColor White
	Write-Host "  Bot:           @$($me.result.username)" -ForegroundColor White
	Write-Host ""
	Write-Host "  Sprawdz teraz:" -ForegroundColor Cyan
	Write-Host "   1. https://$domain/health — ma pokazac ok"
	Write-Host "   2. /start do bota — ma odpowiedziec"
	Write-Host "   3. testowa oferta"
} else {
	Line
	Bad "Instalacja nie potwierdzila sukcesu."
	Write-Host "  Ostatnie logi:" -ForegroundColor DarkGray
	$logs = Invoke-SSHCommand -SSHSession $s -Command "tail -n 30 /root/kcg-install.log" -TimeOut 60
	Write-Host ($logs.Output -join "`n") -ForegroundColor DarkGray
}

Remove-SSHSession -SSHSession $s
Write-Host ""
Read-Host "Enter, aby zamknac"
