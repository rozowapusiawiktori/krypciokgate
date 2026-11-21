# ============================================================
#  Buduje paczkę do przekazania: kcg-bundle.tar.gz
#  Uruchom RAZ u siebie:  powershell -ExecutionPolicy Bypass -File build-bundle.ps1
# ============================================================

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $PSScriptRoot 'kcg-bundle.tar.gz'
$stage = Join-Path $env:TEMP ('kcg-stage-' + [guid]::NewGuid().ToString('N').Substring(0, 8))

Write-Host "==> Staging w $stage"
New-Item -ItemType Directory -Force -Path $stage | Out-Null

# Pliki aplikacji (bez sekretów — banita.env jedzie tylko zaszyfrowany)
$files = @('bot.js', 'package.json', 'package-lock.json', 'banita.png', 'ecosystem.config.js')
foreach ($f in $files) {
	$src = Join-Path $root $f
	if (-not (Test-Path $src)) { throw "Brak pliku: $f" }
	Copy-Item $src -Destination $stage
}

# Katalogi z treścią
foreach ($d in @('images', 'template', 'banner', 'assets', 'scripts')) {
	$src = Join-Path $root $d
	if (Test-Path $src) {
		Copy-Item $src -Destination $stage -Recurse
	}
}

# Bez śmieci w scripts
Get-ChildItem (Join-Path $stage 'scripts') -File -ErrorAction SilentlyContinue |
	Where-Object { $_.Name -like '_*' -or $_.Name -like '*.ps1' } |
	Remove-Item -Force -ErrorAction SilentlyContinue

$envExample = Join-Path $PSScriptRoot 'banita.env.example'
if (Test-Path $envExample) {
	Copy-Item $envExample -Destination (Join-Path $stage 'banita.env.example')
} elseif (Test-Path (Join-Path $root 'banita.env.example')) {
	Copy-Item (Join-Path $root 'banita.env.example') -Destination (Join-Path $stage 'banita.env.example')
} else {
	throw "Brak banita.env.example"
}
Copy-Item (Join-Path $PSScriptRoot 'kcg-install.sh') -Destination $stage
Copy-Item (Join-Path $PSScriptRoot 'START-HERE.ps1') -Destination $stage -ErrorAction SilentlyContinue

Write-Host "==> Pakowanie"
Push-Location $stage
try {
	if (Test-Path $out) { Remove-Item $out -Force }
	tar -czf $out .
} finally {
	Pop-Location
}

Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue

$mb = [math]::Round((Get-Item $out).Length / 1MB, 1)
Write-Host ""
Write-Host "GOTOWE: $out ($mb MB)" -ForegroundColor Green
Write-Host "Przekaż koledze cały folder 'installer' (z paczką w środku)."
