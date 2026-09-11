@echo off
if not exist "%~dp0opencode-env\dist\cli.js" (
  echo Preparing opencode-env for first use...
  call npm --prefix "%~dp0opencode-env" install
  if errorlevel 1 exit /b 1
  call npm --prefix "%~dp0opencode-env" run build
  if errorlevel 1 exit /b 1
)
node "%~dp0opencode-env\dist\cli.js" %*
