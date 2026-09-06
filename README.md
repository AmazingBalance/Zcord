# Zcord

**Zcord** — веб-мессенджер в духе Discord, созданный как пет-проект: собственный Go-бэкенд, фронтенд на Next.js, real-time-обновления по WebSocket, аудио/видеозвонки на WebRTC и сквозное шифрование переписки.

Всё написано «с нуля» — от схемы PostgreSQL до собственной системы звонков и инфраструктуры ключей в стиле Signal.

![Go](https://img.shields.io/badge/backend-Go%201.22-00ADD8?logo=go&logoColor=white)
![Next.js](https://img.shields.io/badge/frontend-Next.js%2015%20%2B%20React%2019-000000?logo=nextdotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/DB-PostgreSQL%2015-4169E1?logo=postgresql&logoColor=white)
![WebRTC](https://img.shields.io/badge/calls-WebRTC-333333?logo=webrtc&logoColor=white)
![Docker](https://img.shields.io/badge/runs%20with-Docker%20%2F%20Podman-2496ED?logo=docker&logoColor=white)
![Status](https://img.shields.io/badge/status-в%20разработке-orange)

---

## 📋 Содержание

- [Возможности](#-возможности)
- [Архитектура](#️-архитектура)
- [Технологический стек](#-технологический-стек)
- [Быстрый старт](#-быстрый-старт)
- [Облачное развёртывание](#️-облачное-развёртывание)
- [Переменные окружения](#️-переменные-окружения)
- [Структура проекта](#-структура-проекта)
- [API](#-api)
- [База данных](#️-база-данных)
- [Разработка](#-разработка)
- [Дополнительная документация](#-дополнительная-документация)
- [Дорожная карта](#️-дорожная-карта)

## ✨ Возможности

### Общение

- 💬 **Три типа бесед** — личные сообщения (ЛС), групповые чаты и каналы (в стиле Discord-каналов); в проекте есть встроенный канал «Новости Zcord».
- 🖼️ **Сообщения с картинками** — текст и изображения, история хранится в виде связного списка (`prev_message_id`).
- 👥 **Друзья** — заявки (входящие/исходящие), принятие, отклонение, отмена, удаление из друзей; ЛС доступно только друзьям, после удаления дружбы чат остаётся в режиме «только чтение».
- 🏷️ **Уникальные теги** — у каждого пользователя и чата свой `@tag`, по нему ищут людей и открывают беседы.
- 🔗 **Инвайты** — ссылки-приглашения в чаты с кодом, сроком действия и лимитом использований; также приглашения по тегу пользователя.

### Real-time

- ⚡ **WebSocket-хаб** — мгновенная доставка сообщений, подписки на чаты, heartbeat (ping/pong) и хранение сессий в БД.
- 🟢 **Присутствие** — статусы онлайн/оффлайн, `last_seen`, отложенная очистка при коротких реконнектах.
- ⌨️ **Индикатор набора текста** и события прочтения сообщений (`message_read`).
- 📢 **Redis Pub/Sub** — рассылка событий между инстансами бэкенда при горизонтальном масштабировании (без Redis хаб работает в режиме одного инстанса).

### Звонки

- 📞 **Аудио- и видеозвонки** в ЛС, чатах и каналах — медиа идёт напрямую между участниками по WebRTC (P2P), сервер участвует только в сигналинге.
- 🔁 **Смена типа звонка** на лету (аудио ⇄ видео).
- 🗄️ **Состояние звонков в PostgreSQL** — таблицы `calls` / `call_participants` и хранимые функции `join_call` / `leave_call`: корректная очистка при обрыве соединения, системные сообщения о начале/конце звонка.
- 🧊 **STUN/TURN** — пробитие NAT через публичные STUN/TURN-серверы.

### Безопасность

- 🔐 **Сквозное шифрование (E2E)** — инфраструктура ключей в стиле Signal: Identity Key, Signed Pre-Key (с подписью) и одноразовые One-Time PreKeys с ротацией.
  - Клиент: Web Crypto API — AES-256-GCM, ECDH P-256, ECDSA; приватные ключи никогда не покидают устройство.
  - Сервер: только раздаёт публичные ключи (`/api/keys/*`), читать переписку не может.
- 🛡️ **Аутентификация** — JWT + bcrypt, проверка токена на защищённых маршрутах.
- 🌐 **CORS** — белый список разрешённых origin.

### Прочее

- 👤 **Профили** — имя, аватар (загрузка файлов на сервер, `/uploads/`), описание.
- 🌱 **Автоинициализация** — бэкенд сам ждёт готовности БД, применяет миграции схемы и создаёт bootstrap-аккаунты при первом запуске.
- 📦 **Контейнеризация** — Docker и Podman (prod/dev-профили) + облачный профиль с Caddy и автоматическим TLS.

## 🏗️ Архитектура

Три сервиса в контейнерах + optional Redis:

```
                        ┌──────────────────────────────┐
                        │            Browser           │
                        │   Next.js 15 · React 19      │
                        │   Redux Toolkit · CSS Modules│
                        └───────┬──────────────┬───────┘
                     REST /api  │              │  WebSocket /ws
                     (fetch)    │              │  (real-time)
                                ▼              ▼
        ┌────────────────── Caddy (reverse proxy, TLS) ──────────────────┐
        │                       только в docker-compose.cloud.yml        │
        └───────────────┬──────────────────────────────┬────────────────┘
                        ▼                              ▼
             ┌─────────────────────┐        ┌─────────────────────┐
             │    Go 1.22 backend  │        │    Go 1.22 backend  │
             │  net/http · REST    │        │  WebSocket Hub      │
             │  JWT · bcrypt       │        │  звонки: сигналинг  │
             │  E2E key-directory  │◄──┐    │  (pion/webrtc)      │
             └─────────┬───────────┘   │    └─────────┬───────────┘
                       │ SQL           │ Redis Pub/Sub (масштабирование,
                       ▼               │    опционально)
             ┌─────────────────────┐   │
             │   PostgreSQL 15     │───┘
             │ users · chats ·     │
             │ messages · calls ·  │
             │ chat_invites ·      │
             │ user_keys · ws-     │
             │ sessions            │
             └─────────────────────┘

                 Медиа-трафик звонков идёт напрямую P2P (WebRTC),
                 сервер предоставляет только сигналинг и STUN/TURN.
```

### Компоненты

| Компонент | Назначение |
|---|---|
| `frontend` (Next.js) | UI: страницы авторизации, чатов, друзей, настроек; Redux-слайсы (`user`, `chats`, `activeChat`, `call`, `news`); WebSocket-клиент и WebRTC-клиент в `src/services` |
| `backend` (Go) | REST API + WebSocket-хаб в одном бинарнике на stdlib `net/http`; модули: `auth`, `chats`, `chat_creation`, `ls`, `friends`, `invites`, `websocket`, `webrtc`, `crypto_keys`, `migrations`, `bootstrap` |
| `postgres` | Хранение всех данных; схема и seed-данные (канал новостей) применяются из `init.sql` при первом старте |
| `redis` (опционально) | Pub/Sub для рассылки WebSocket-событий между несколькими инстансами бэкенда |
| `caddy` (облако) | Reverse-proxy, автоматические сертификаты Let's Encrypt |

### Как устроен real-time слой

1. Клиент открывает `/ws`, аутентифицируется JWT и подписывается на нужные чаты.
2. `WebSocketHub` держит активные соединения, трекает статусы пользователей и пишет сессии в `websocket_sessions`.
3. События (`new_message`, `typing`, `user_online/offline`, `friend_request`, `message_read`, `chat_updated`, сигналинг звонков) рассылаются подписчикам; при подключённом Redis — через Pub/Sub на все инстансы.
4. При обрыве соединения хаб с задержкой чистит пользовательские звонки через `leave_call` и рассылает участникам системные сообщения.

### Как устроены звонки

- Сервер (`server/webrtc.go`, библиотека [pion/webrtc](https://github.com/pion/webrtc)) управляет жизненным циклом звонка: создаёт запись в БД, хранит сессии, раздаёт участникам SDP/ICE друг друга.
- Клиенты обмениваются медиапотоками напрямую (P2P), используя STUN/TURN для обхода NAT.
- Жизненный цикл звонка согласован между памятью сервера и PostgreSQL, поэтому рестарт бэкенда не «зависшивает» звонки.

## 🧰 Технологический стек

| Слой | Технологии |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, Redux Toolkit + redux-persist, CSS Modules, react-toastify, peerjs / webrtc-adapter, Web Crypto API |
| Backend | Go 1.22 (stdlib `net/http`), gorilla/websocket, pion/webrtc v3, go-redis v9, lib/pq, JWT, bcrypt |
| Базы данных | PostgreSQL 15 (+ массивы, GIN-индексы, хранимые функции), Redis (Pub/Sub, опционально) |
| Инфраструктура | Docker / Podman Compose, Caddy 2 (TLS), Let's Encrypt |

## 🚀 Быстрый старт

### Предварительные требования

- [Docker](https://docs.docker.com/get-docker/) **или** [Podman](https://podman.io/getting-started/installation) + Compose
- Git

### Запуск (production-профиль)

```bash
git clone <repository-url>
cd Zcord

# Настройте окружение (минимум — JWT_SECRET)
cp .env.example .env
$EDITOR .env

# Docker
docker compose up -d --build

# Podman
podman-compose -f podman-compose.yml up -d
```

После старта:

| Сервис | Адрес |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| PostgreSQL | localhost:5435 |

### Режим разработки

```bash
# Docker
docker compose -f docker-compose.dev.yml up -d

# Podman
podman-compose -f podman-compose.dev.yml up -d

# Или без контейнеров:
npm install && npm run dev     # фронтенд, терминал 1
cd server && go run .          # бэкенд, терминал 2
```

При первом запуске бэкенд сам дождётся PostgreSQL, применит схему и создаст bootstrap-аккаунты (если заданы `BOOTSTRAP_*` в `.env`).

## ☁️ Облачное развёртывание

Профиль `docker-compose.cloud.yml` добавляет Caddy с автоматическими сертификатами Let's Encrypt — всё приложение живёт за одним доменом:

```bash
cp .env.example .env
# обязательно задайте: ZCORD_DOMAIN, POSTGRES_PASSWORD, JWT_SECRET,
# BOOTSTRAP_ROOT_PASSWORD и т.д.

docker compose -f docker-compose.cloud.yml up -d --build
```

Подробности — в [CLOUD_DEPLOYMENT.md](CLOUD_DEPLOYMENT.md).

## ⚙️ Переменные окружения

Полный шаблон — в [`.env.example`](.env.example). Ключевые переменные:

| Переменная | Описание |
|---|---|
| `JWT_SECRET` | Секрет для подписи JWT (в проде ≥ 32 символов) |
| `DATABASE_URL` | DSN PostgreSQL для бэкенда |
| `PUBLIC_API_URL` / `PUBLIC_WEB_URL` | Публичные URL — из них бэкенд строит абсолютные ссылки (например, `/uploads`) |
| `CORS_ALLOWED_ORIGINS` | Белый список origin через запятую |
| `NEXT_PUBLIC_API_URL` | URL API в клиентском бандле фронтенда |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Учётные данные БД |
| `POSTGRES_PORT` / `BACKEND_PORT` / `FRONTEND_PORT` | Публикуемые порты (5435 / 8000 / 3000) |
| `BOOTSTRAP_ROOT_*` / `BOOTSTRAP_NIKDIMER_*` | Аккаунты, создаваемые при старте |
| `REDIS_URL` / `REDIS_PASSWORD` | Redis для Pub/Sub WebSocket-хаба (опционально) |
| `ZCORD_DOMAIN` / `CADDY_EMAIL` | Домен и e-mail для Let's Encrypt (облачный профиль) |

## 📁 Структура проекта

```
Zcord/
├── src/                        # Next.js фронтенд
│   ├── app/                    #   страницы (App Router): auth, (chats),
│   │   │                       #   friends, new_chat, new_channel, settings…
│   │   └── store/              #   Redux-слайсы: user, chats, activeChat,
│                               #   call, news, registration
│   ├── components/             #   UI-компоненты: ChatZone, ChatList,
│   │                           #   FriendsZone, VideoCall, MenuBar, Popup…
│   ├── services/               #   websocket.js, webrtc.js, peerjs-service,
│   │                           #   apiConfig.js
│   └── utils/                  #   crypto.js (E2E), logger.js
├── server/                     # Go бэкенд
│   ├── main.go                 #   роутинг, CORS, запуск
│   ├── auth.go                 #   регистрация, вход, JWT, профиль
│   ├── chats.go / ls.go        #   чаты, каналы, ЛС, сообщения
│   ├── chat_creation.go        #   создание чатов и каналов
│   ├── friends.go              #   система друзей
│   ├── invites.go              #   инвайты в чаты
│   ├── websocket.go            #   WebSocket-хаб + Redis Pub/Sub
│   ├── webrtc.go               #   сигналинг и сессии звонков
│   ├── crypto_keys.go          #   каталог публичных ключей E2E
│   ├── migrations.go           #   авто-миграции схемы
│   └── bootstrap.go            #   стартовые аккаунты
├── init.sql                    # схема БД + seed (канал новостей)
├── docker-compose.yml          # локальный production-профиль
├── docker-compose.dev.yml      # dev-профиль
├── docker-compose.cloud.yml    # облако: + Caddy c TLS
├── podman-compose*.yml         # аналогично для Podman
├── Dockerfile / Containerfile  # сборка образов
├── Caddyfile                   # reverse-proxy для облака
└── docs/                       # API, архитектура, деплой и др.
```

## 📡 API

Все защищённые маршруты требуют заголовок `Authorization: Bearer <JWT>`. Полная документация — в [docs/API.md](docs/API.md).

### Аутентификация и профиль

| Метод | Endpoint | Описание |
|---|---|---|
| POST | `/api/register` | Регистрация (name, email, password, tag) |
| POST | `/api/login` | Вход, выдача JWT |
| GET | `/api/validate-token` | Проверка токена |
| GET | `/api/check-tag` | Проверка занятости тега пользователя |
| POST | `/api/user/update` | Обновление профиля (multipart, аватар) |
| POST | `/api/user/check-unique` | Проверка уникальности полей |

### Чаты и сообщения

| Метод | Endpoint | Описание |
|---|---|---|
| GET | `/chats` | Список чатов пользователя |
| GET | `/chat?tag=` · `/channel?tag=` | Чат/канал по тегу с сообщениями |
| GET | `/ls?tag=` | ЛС с пользователем (read-only после удаления дружбы) |
| POST | `/api/ls/ensure` | Создать ЛС при необходимости |
| POST | `/api/create-chat` · `/api/create-channel` | Создание чата/канала |
| GET | `/api/check-chat-tag` | Проверка занятости тега чата |
| POST | `/api/send` | Отправка сообщения (текст/картинка) |

### Друзья

| Метод | Endpoint | Описание |
|---|---|---|
| POST | `/api/friends/search` | Поиск пользователя по тегу |
| POST | `/api/friends/request` | Отправить заявку |
| POST | `/api/friends/accept` / `reject` / `cancel` | Управление заявкой |
| POST | `/api/friends/remove` | Удалить из друзей |

### Инвайты

| Метод | Endpoint | Описание |
|---|---|---|
| POST | `/api/invites/create` | Создать ссылку-приглашение |
| GET | `/api/invites/info` | Информация о приглашении (публичный) |
| POST | `/api/invites/accept` | Принять приглашение |
| GET | `/api/invites/tag-info` | Информация о приглашении по тегу |
| POST | `/api/invites/accept-tag` | Принять приглашение по тегу |

### Криптография (E2E)

| Метод | Endpoint | Описание |
|---|---|---|
| POST | `/api/keys/upload` | Загрузить набор публичных ключей |
| GET | `/api/keys/public` | Публичные ключи пользователя |
| GET | `/api/keys/chat` | Ключи участников чата |
| POST | `/api/keys/rotate` | Ротация одноразовых PreKeys |

### Real-time

| Протокол | Endpoint | Описание |
|---|---|---|
| WebSocket | `/ws` | Сообщения, статусы, typing, звонки (сигналинг) |
| GET | `/uploads/*` | Статические файлы |

## 🗄️ База данных

Схема применяется автоматически (`init.sql` + `server/migrations.go`):

- **`users`** — профиль, тег, хеш пароля, списки друзей/заявок (`INTEGER[]`), статус, `last_seen`;
- **`websocket_sessions`** — активные WebSocket-сессии;
- **`chats`** — беседы с `chat_type` (`chat` / `channel`), владельцем и массивом участников (GIN-индекс);
- **`messages`** — UUID-ключи, текст, тип, картинка, связный список через `prev_message_id`;
- **`chat_invites`** — ссылки-приглашения: код, срок, лимит использований;
- **`calls` / `call_participants`** — звонки и участники + хранимые функции `join_call` / `leave_call`;
- **`user_keys`** — публичные E2E-ключи (identity, signed pre-key, one-time pre-keys).

Бэкап и восстановление:

```bash
docker compose exec postgres pg_dump -U <user> zcord > backup.sql
docker compose exec -T postgres psql -U <user> zcord < backup.sql
```

## 💻 Разработка

```bash
npm install          # зависимости фронтенда
npm run dev          # dev-сервер Next.js
cd server && go run .   # бэкенд без контейнеров
npm run lint         # ESLint
```

Полезные npm-скрипты: `podman:dev`, `podman:dev:logs:backend`, `podman:prod:stop` и др. — см. [package.json](package.json). В dev-профиле фронтенд перезагружается автоматически; изменения Go требуют пересборки контейнера бэкенда.

## 📚 Дополнительная документация

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — детали архитектуры, схемы потоков
- [docs/SECURITY_ARCHITECTURE.md](docs/SECURITY_ARCHITECTURE.md) — E2E-криптография и real-time слой
- [docs/API.md](docs/API.md) — документация API
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) · [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) · [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- [CLOUD_DEPLOYMENT.md](CLOUD_DEPLOYMENT.md) · [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) (Podman)

## 🗺️ Дорожная карта

- [x] Real-time сообщения и статусы присутствия
- [x] Аудио/видеозвонки (WebRTC)
- [x] Инфраструктура E2E-шифрования (ключи, ротация)
- [x] Каналы и ссылки-приглашения
- [ ] Полное включение E2E-шифрования переписки (Double Ratchet)
- [ ] Push-уведомления
- [ ] Мобильная версия / PWA

---

Пет-проект, развивается в свободное время. Автор: **[@NikDimer](https://github.com/NikDimer)** 🚀
