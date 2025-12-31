# Zcord - Мессенджер

Современный веб-мессенджер, построенный на Next.js (frontend) и Go (backend) с PostgreSQL базой данных.

## 🚀 Быстрый старт

### Предварительные требования

- [Podman](https://podman.io/getting-started/installation) и Podman Compose
- Git

### Установка и запуск

1. **Клонируйте репозиторий:**

```bash
git clone <repository-url>
cd Zcord-main
```

2. **Запустите проект:**

```bash
# Production режим
podman-compose -f podman-compose.yml up -d

# Или для разработки
podman-compose -f podman-compose.dev.yml up -d
```

3. **Откройте приложение:**

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- База данных: localhost:5435

## 📋 Содержание

- [Миграция на Podman](#миграция-на-podman)
- [Архитектура проекта](#архитектура-проекта)
- [Развёртывание](#развёртывание)
- [Разработка](#разработка)
- [API документация](#api-документация)
- [База данных](#база-данных)
- [Устранение неполадок](#устранение-неполадок)

## 🚀 Миграция на Podman

**Проект полностью мигрирован с Docker на Podman!**

### Преимущества Podman:

- ✅ **Rootless по умолчанию** - повышенная безопасность
- ✅ **Без демона** - меньше потребление ресурсов
- ✅ **Совместимость с Docker** - поддержка Docker команд
- ✅ **Открытый исходный код** - полностью свободное ПО

### Быстрая миграция:

1. **Установите Podman:**

   ```bash
   # macOS
   brew install podman podman-compose
   podman machine init && podman machine start

   # Linux
   sudo apt install podman podman-compose  # Ubuntu/Debian
   sudo dnf install podman podman-compose  # CentOS/RHEL
   ```

2. **Остановите Docker и запустите Podman:**

   ```bash
   # Остановка Docker
   docker-compose down

   # Запуск с Podman
   podman-compose -f podman-compose.yml up -d
   ```

3. **Автоматический тест миграции:**
   ```bash
   ./test-podman-migration.sh
   ```

### Документация по миграции:

- 📖 [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) - Полное руководство по миграции
- 📖 [PODMAN_INSTALLATION.md](PODMAN_INSTALLATION.md) - Установка Podman
- 📖 [PODMAN_README.md](PODMAN_README.md) - Использование Podman
- 📖 [PODMAN_TESTING.md](PODMAN_TESTING.md) - Тестирование

### Основные команды:

```bash
# Development
podman-compose -f podman-compose.dev.yml up -d

# Production
podman-compose -f podman-compose.yml up -d

# Через скрипт
./scripts/deploy.sh start dev
```

**Примечание:** Docker файлы сохранены для совместимости, но рекомендуется использовать Podman.

## 🏗️ Архитектура проекта

```
Zcord/
├── src/                    # Next.js frontend приложение
│   ├── app/               # App Router страницы
│   ├── components/        # React компоненты
│   └── ...
├── server/                # Go backend сервер
│   ├── main.go           # Основной файл сервера
│   ├── auth.go           # Аутентификация
│   ├── chats.go          # Чаты и сообщения
│   ├── friends.go        # Система друзей
│   └── uploads/          # Загруженные файлы
├── public/               # Статические файлы
├── my_postgres_data/     # Данные PostgreSQL
├── init.sql             # Инициализация БД
├── docker-compose.yml   # Production конфигурация
├── docker-compose.dev.yml # Development конфигурация
└── docs/                # Документация
```

### Технологический стек

**Frontend:**

- Next.js 15 (React 19)
- Redux Toolkit для управления состоянием
- CSS Modules для стилизации

**Backend:**

- Go 1.22.1
- JWT для аутентификации
- PostgreSQL драйвер
- bcrypt для хеширования паролей

**База данных:**

- PostgreSQL 15

**Инфраструктура:**

- Podman & Podman Compose
- Nginx (для production)

## 🚀 Развёртывание

### Production развёртывание

1. **Подготовка сервера:**

```bash
# Установите Podman и Podman Compose
brew install podman podman-compose
podman machine init
podman machine start
```

2. **Клонирование и настройка:**

```bash
git clone <repository-url>
cd Zcord-main

# Настройте переменные окружения
cp server/.env.example server/.env
# Отредактируйте server/.env с вашими настройками
```

3. **Запуск:**

```bash
podman-compose -f podman-compose.yml up -d
```

4. **Проверка:**

```bash
podman-compose -f podman-compose.yml ps
podman-compose -f podman-compose.yml logs
```

### Environment переменные

Создайте файл `server/.env`:

```env
JWT_SECRET=your-super-secret-jwt-key-change-in-production
DATABASE_URL=postgres://nikdimer:technocraft2000@postgres:5432/zcord?sslmode=disable
```

### SSL/HTTPS настройка

Для production рекомендуется использовать reverse proxy (Nginx) с SSL сертификатами:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 💻 Разработка

### Настройка среды разработки

1. **Установите зависимости:**

```bash
# Frontend зависимости
npm install

# Go зависимости (если разрабатываете без Docker)
cd server
go mod download
```

2. **Запуск в режиме разработки:**

```bash
# С Podman (рекомендуется)
podman-compose -f podman-compose.dev.yml up -d

# Или без Podman
# Terminal 1: Frontend
npm run dev

# Terminal 2: Backend
cd server
go run .

# Terminal 3: PostgreSQL
podman run -d --name postgres \
  -e POSTGRES_DB=zcord \
  -e POSTGRES_USER=nikdimer \
  -e POSTGRES_PASSWORD=technocraft2000 \
  -p 5435:5432 \
  postgres:15-alpine
```

### Структура разработки

**Frontend разработка:**

- Файлы в `src/app/` - страницы приложения
- Компоненты в `src/components/`
- Стили в соответствующих `.module.css` файлах
- Redux store в `src/app/store/`

**Backend разработка:**

- `server/main.go` - основной сервер и роутинг
- `server/auth.go` - аутентификация и авторизация
- `server/chats.go` - функционал чатов
- `server/friends.go` - система друзей
- `server/uploads/` - загруженные файлы

### Горячая перезагрузка

В development режиме:

- Frontend автоматически перезагружается при изменениях
- Backend требует перезапуска контейнера при изменениях в коде Go

### Тестирование

```bash
# Запуск тестов frontend
npm test

# Запуск тестов backend
cd server
go test ./...

# Интеграционные тесты
podman-compose -f podman-compose.test.yml up --abort-on-container-exit
```

## 📡 API документация

### Аутентификация

**POST /api/register**

```json
{
  "name": "Имя пользователя",
  "email": "user@example.com",
  "password": "password123",
  "tag": "username"
}
```

**POST /api/login**

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**GET /api/validate-token**

- Требует Cookie с JWT токеном
- Возвращает информацию о пользователе

### Чаты и сообщения

**GET /chats**

- Получить список чатов пользователя
- Требует аутентификации

**GET /chat?tag=CHAT_TAG**

- Получить детали чата и сообщения
- Требует аутентификации

**POST /api/send**

```json
{
  "chatId": "chat_id",
  "text": "Текст сообщения",
  "type": "text"
}
```

### Друзья

**POST /api/friends/add**

```json
{
  "tag": "friend_username"
}
```

**POST /api/friends/accept**
**POST /api/friends/reject**
**POST /api/friends/remove**
**POST /api/friends/cancel**

### Пользователи

**POST /api/user/update**

- Multipart form для обновления профиля
- Поддерживает загрузку аватара

## 🗄️ База данных

### Схема базы данных

**Таблица users:**

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(50),
    tag VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    description TEXT,
    avatar VARCHAR(500),
    friends_list INTEGER[] DEFAULT '{}',
    friends_list_in INTEGER[] DEFAULT '{}',
    friends_list_out INTEGER[] DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Таблица chats:**

```sql
CREATE TABLE chats (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    avatar VARCHAR(500),
    description TEXT,
    users INTEGER[] DEFAULT '{}',
    last_message_id VARCHAR(100),
    last_user_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Таблица messages:**

```sql
CREATE TABLE messages (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    text TEXT,
    type VARCHAR(50) DEFAULT 'text',
    user_id INTEGER REFERENCES users(id),
    chat_id INTEGER REFERENCES chats(id),
    image_src VARCHAR(500),
    prev_message_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Миграции

Инициализация базы данных происходит автоматически при первом запуске через файл [`init.sql`](init.sql).

Для добавления новых миграций:

1. Создайте SQL файл в папке `migrations/`
2. Добавьте его в docker-compose.yml в volumes PostgreSQL

### Бэкап и восстановление

```bash
# Создание бэкапа
podman-compose -f podman-compose.yml exec postgres pg_dump -U nikdimer zcord > backup.sql

# Восстановление из бэкапа
podman-compose -f podman-compose.yml exec -T postgres psql -U nikdimer zcord < backup.sql
```

## 🔧 Устранение неполадок

### Частые проблемы

**1. Контейнеры не запускаются:**

```bash
# Проверьте логи
podman-compose -f podman-compose.yml logs

# Пересоберите образы
podman-compose -f podman-compose.yml build --no-cache
podman-compose -f podman-compose.yml up -d
```

**2. База данных недоступна:**

```bash
# Проверьте статус PostgreSQL
podman-compose -f podman-compose.yml ps postgres
podman-compose -f podman-compose.yml logs postgres

# Пересоздайте том базы данных
podman-compose -f podman-compose.yml down -v
podman-compose -f podman-compose.yml up -d
```

**3. Frontend не подключается к Backend:**

- Проверьте, что backend запущен на порту 8000
- Убедитесь, что CORS настроен правильно
- Проверьте переменные окружения

**4. Ошибки аутентификации:**

- Проверьте JWT_SECRET в .env файле
- Убедитесь, что таблица users создана
- Проверьте логи backend сервера

### Полезные команды

```bash
# Просмотр логов всех сервисов
podman-compose -f podman-compose.yml logs -f

# Просмотр логов конкретного сервиса
podman-compose -f podman-compose.yml logs -f backend

# Подключение к базе данных
podman-compose -f podman-compose.yml exec postgres psql -U nikdimer zcord

# Перезапуск сервиса
podman-compose -f podman-compose.yml restart backend

# Очистка всех данных
podman-compose -f podman-compose.yml down -v
podman system prune -a
```

### Мониторинг

Для production рекомендуется настроить мониторинг:

- Логирование через ELK Stack или Grafana Loki
- Метрики через Prometheus + Grafana
- Алерты через Alertmanager

## 📞 Поддержка

Если у вас возникли проблемы:

1. Проверьте [раздел устранения неполадок](#устранение-неполадок)
2. Посмотрите логи: `podman-compose -f podman-compose.yml logs`
3. Создайте issue в репозитории с описанием проблемы и логами

## 📄 Лицензия

[Укажите лицензию проекта]

---

**Версия документации:** 1.0  
**Последнее обновление:** 28 июля 2025
