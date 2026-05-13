@echo off
setlocal

cd /d "%~dp0"

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo Failed to install dependencies.
    pause
    exit /b 1
  )
)

echo Starting xrDocs dev server...
echo Browser will open automatically.
echo.

call npm.cmd run dev -- --port 5173

pause
