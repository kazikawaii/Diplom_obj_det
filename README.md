# YOLO Web UI

В проекте собран готовый стек:

- `backend/` — FastAPI API для выбора модели и инференса по изображению или видео
- `frontend/` — React/Vite интерфейс для загрузки изображения/видео и просмотра результатов
- `telegram_bot/` — Telegram-бот с кнопкой открытия веб-интерфейса
- `models/` — ваши `.pt` веса, которые автоматически подхватываются API
- `docker-compose.yml` — запуск всего приложения через Docker Compose

## Что умеет

- показывает список всех `.pt` моделей из каталога `models/`
- принимает изображения и видео через веб-интерфейс
- показывает live-трансляции с детекцией объектов через MJPEG-поток
- даёт выбрать `confidence`, `IoU` и `imgsz`
- умеет искать только нужные классы по текстовому запросу, например `person, car`
- возвращает размеченную картинку или видео с боксами и список найденных объектов
- умеет отдавать ссылку на интерфейс через Telegram-бота

## Запуск через Docker Compose

Сначала создайте `.env` на основе примера:

```bash
cp .env.example .env
```

Заполните в `.env`:

```bash
TELEGRAM_BOT_TOKEN=ваш_токен_бота
WEBAPP_URL=https://ваш-публичный-домен
```

Потом запускайте:

```bash
docker compose up --build
```

После старта:

- фронтенд: `http://localhost:3000`
- API: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`
- Telegram-бот: сервис `telegram-bot` внутри compose

### Live-трансляции

Во фронтенде есть вкладка `Трансляции`. Она использует два WebSocket-соединения
на один `stream_id`:

- `viewer` — получает кадры и показывает трансляцию
- `publisher` — отправляет кадры на backend

Viewer endpoint:

```text
WS /ws/streams/main/view
```

Publisher endpoint:

```text
WS /ws/streams/main/publish?model_name=baseline_960_b4_e20.pt&conf=0.25&iou=0.45&imgsz=960
```

Publisher может отправлять бинарные JPEG/PNG кадры. Также поддерживается текстовый
JSON-формат:

```json
{"image": "data:image/jpeg;base64,..."}
```

Backend обрабатывает кадр выбранной YOLO-моделью и рассылает готовый JPEG всем
viewer-подключениям этого `stream_id`.

Старый HTTP MJPEG endpoint также оставлен:

```text
GET /api/stream?model_name=baseline_960_b4_e20.pt&source=0&conf=0.25&iou=0.45&imgsz=960&max_fps=12
```

## Telegram-бот

Бот отвечает на команды:

- `/start` — показывает кнопку открытия веб-интерфейса
- `/open` — повторно присылает ссылку и кнопку
- `/status` — проверяет доступность фронтенда и бэкенда

Файлы бота:

- [telegram_bot/app.py](/home/komi/web_yolo/telegram_bot/app.py)
- [telegram_bot/Dockerfile](/home/komi/web_yolo/telegram_bot/Dockerfile)

Важно: чтобы кнопка открытия сайта в Telegram работала нормально, `WEBAPP_URL` должен быть внешним `https://` адресом. `http://localhost:3000` подходит только для локального браузера на вашей машине, но не для Telegram Web App на телефоне или другом устройстве.

### Бот для открытия интерфейса

После запуска контейнеров можно открыть веб-интерфейс через маленький Python-бот:

```bash
python3 open_ui_bot.py
```

По умолчанию он ждёт `http://localhost:3000`, пока сайт станет доступен, и затем открывает его в браузере.

Если нужен другой адрес:

```bash
python3 open_ui_bot.py --url http://localhost:3000 --timeout 180
```

## Локальный запуск без Docker

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```
