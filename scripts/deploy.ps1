param(
  [int]$Port = 3000,
  [string]$AdminPassword = "adminadmin"
)

$ErrorActionPreference = "Stop"
$env:PORT = $Port
$env:ADMIN_PASSWORD = $AdminPassword
$env:DATA_DIR = Join-Path (Get-Location) "data"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 22.5 or newer is required."
}

New-Item -ItemType Directory -Force -Path $env:DATA_DIR | Out-Null
Write-Host "IconFamily starting on http://localhost:$Port"
node --use-system-ca server/index.mjs
