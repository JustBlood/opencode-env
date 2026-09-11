$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = Join-Path $root "opencode-env\release\opencode-env-setup.exe"
if (-not (Test-Path -LiteralPath $exe)) {
  throw "Installer executable not found: $exe"
}
& $exe
