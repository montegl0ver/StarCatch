# StarCatch

## Локальный запуск
    npm install
    node server.js        # откройте http://localhost:3000
Для теста на телефоне: откройте http://<IP-компьютера>:3000 в той же Wi-Fi сети.

## Деплой (Render)
1. Залейте папку в GitHub-репозиторий.
2. Render → New → Web Service → выберите репозиторий.
3. Build: `npm install`, Start: `node server.js`. Порт берётся из `PORT` автоматически.
Работает аналогично на Glitch/Railway/Heroku (Procfile: `web: node server.js`).
Комнаты хранятся в памяти: при перезапуске сервера они сбрасываются, масштабирование — только 1 инстанс.
