@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ===== Установка StarCatch =====

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js не найден. Устанавливаю через winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  echo Node.js установлен. ЗАКРОЙТЕ это окно и запустите start.bat заново.
  pause
  exit /b 1
)

echo [1/2] Устанавливаю зависимости игры...
call npm install --omit=dev
if errorlevel 1 ( echo Ошибка npm install & pause & exit /b 1 )

if not exist cloudflared.exe (
  echo [2/2] Скачиваю cloudflared ^(Cloudflare Tunnel^)...
  powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'cloudflared.exe'"
  if not exist cloudflared.exe ( echo Не удалось скачать cloudflared.exe & pause & exit /b 1 )
)
echo.
echo Готово! Теперь запускайте start.bat
exit /b 0
