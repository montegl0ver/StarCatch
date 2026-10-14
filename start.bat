@echo off
chcp 65001 >nul
cd /d "%~dp0"
title StarCatch launcher

rem --- Если чего-то не хватает (Node, зависимости, cloudflared) — ставим ---
set NEED=0
where node >nul 2>&1 || set NEED=1
if not exist node_modules\express set NEED=1
if not exist cloudflared.exe set NEED=1
if "%NEED%"=="1" call install.bat

where node >nul 2>&1 || ( echo Перезапустите start.bat после установки Node.js & pause & exit /b 1 )
if not exist cloudflared.exe ( echo cloudflared.exe не найден & pause & exit /b 1 )

set PORT=3000
del cloudflared.log >nul 2>&1

echo Запускаю игровой сервер...
start "StarCatch server" /min cmd /c node server.js
timeout /t 2 /nobreak >nul

echo Запускаю Cloudflare Tunnel...
start "StarCatch tunnel" /min cmd /c cloudflared.exe tunnel --url http://localhost:%PORT% --logfile cloudflared.log --no-autoupdate

echo Жду публичную ссылку...
set URL=
for /l %%i in (1,1,40) do (
  if not defined URL (
    for /f "delims=" %%u in ('powershell -nologo -noprofile -executionpolicy bypass -file geturl.ps1') do set URL=%%u
    if not defined URL timeout /t 1 /nobreak >nul
  )
)
if not defined URL ( echo Не удалось получить ссылку. Смотрите cloudflared.log & pause & goto stop )

echo %URL%| clip
echo.
echo ================================================
echo   Ссылка для друзей ^(уже скопирована^):
echo   %URL%
echo ================================================
echo Локально: http://localhost:%PORT%
start "" "%URL%"
echo.
echo Не закрывайте это окно, пока играете.
echo Нажмите любую клавишу, чтобы ОСТАНОВИТЬ сервер.
pause >nul

:stop
taskkill /f /im cloudflared.exe >nul 2>&1
taskkill /f /t /fi "WINDOWTITLE eq StarCatch server*" >nul 2>&1
exit /b 0
