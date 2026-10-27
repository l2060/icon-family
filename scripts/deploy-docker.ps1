param(
  [string]$Server = '192.168.1.30',
  [string]$User = 'root',
  [string]$IdentityFile = (Join-Path $env:USERPROFILE '.ssh/id_ed25519_192_168_1_30'),
  [string]$RemoteDirectory = '/home/icon-family',
  [ValidateRange(1, 65535)][int]$Port = 3000,
  [string]$Tag = ('minimal-' + (Get-Date -Format 'yyyyMMdd-HHmmss')),
  [switch]$PrepareOnly
)

$ErrorActionPreference = 'Stop'
# Restrict values interpolated into remote shell commands.
if ($Server -notmatch '^[a-zA-Z0-9][a-zA-Z0-9.-]*$' -or
    $User -notmatch '^[a-zA-Z_][a-zA-Z0-9_-]*$' -or
    $RemoteDirectory -notmatch '^/[a-zA-Z0-9_/-]+$' -or
    $RemoteDirectory -eq '/' -or $RemoteDirectory.Contains('//') -or
    $Tag -notmatch '^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$') {
  throw 'Invalid server, user, remote directory or image tag.'
}
$RemoteDirectory = $RemoteDirectory.TrimEnd('/')
$projectRoot = Split-Path $PSScriptRoot -Parent
$staging = Join-Path ([System.IO.Path]::GetTempPath()) ('icon-family-' + [guid]::NewGuid().ToString('N'))
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Invoke-Checked {
  param([string]$Command, [string[]]$Arguments)
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Command failed (exit $LASTEXITCODE)." }
}

Push-Location $projectRoot
try {
  foreach ($command in @('node', 'npm', 'tar')) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "$command is required locally." }
  }
  if (-not $PrepareOnly) {
    foreach ($command in @('ssh', 'scp')) {
      if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "$command is required locally." }
    }
    if (-not (Test-Path -LiteralPath $IdentityFile -PathType Leaf)) { throw "SSH key not found: $IdentityFile" }
  }
  Invoke-Checked npm @('ci', '--no-audit', '--no-fund')
  Invoke-Checked npm @('run', 'build')
  New-Item -ItemType Directory -Path $staging | Out-Null
  $compose = [System.IO.File]::ReadAllText((Join-Path $projectRoot 'docker-compose.yml'))
  $compose = $compose -replace '(?m)^    build: \.\r?\n', ''
  $compose = $compose.Replace('${ICONFAMILY_IMAGE:-icon-family:latest}', "icon-family:$Tag")
  $compose = $compose.Replace('${ICONFAMILY_PORT:-3000}', "$Port")
  $compose = $compose.Replace('${ICONFAMILY_DATA_DIR:-/home/icon-family/data}', "$RemoteDirectory/data")
  [System.IO.File]::WriteAllText((Join-Path $staging 'docker-compose.yml'), $compose.Replace("`r", ''), $utf8)
  $remoteScript = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'deploy-docker-remote.sh'))
  [System.IO.File]::WriteAllText((Join-Path $staging 'deploy-docker-remote.sh'), $remoteScript.Replace("`r", ''), $utf8)
  Invoke-Checked tar @('-czf', (Join-Path $staging 'source.tar.gz'), 'Dockerfile', '.dockerignore', 'package.json', 'package-lock.json', 'server', 'dist')
  if ($PrepareOnly) {
    Write-Host "Prepared deployment files: $staging"
    return
  }
  $target = "${User}@${Server}"
  $sshOptions = @('-i', $IdentityFile, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15')
  $remoteBuild = "$RemoteDirectory/builds/$Tag"
  Invoke-Checked ssh ($sshOptions + @($target, "mkdir -p $remoteBuild"))
  foreach ($file in @('source.tar.gz', 'docker-compose.yml', 'deploy-docker-remote.sh')) {
    Invoke-Checked scp ($sshOptions + @((Join-Path $staging $file), "${target}:$remoteBuild/$file"))
  }
  Invoke-Checked ssh ($sshOptions + @($target, "sh $remoteBuild/deploy-docker-remote.sh $RemoteDirectory $Tag $Port"))
  Write-Host "Deployment complete: http://${Server}:$Port"
  Write-Host "Deployment files retained locally: $staging"
} finally {
  Pop-Location
}
