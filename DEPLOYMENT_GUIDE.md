# Руководство по развертыванию системы безопасности Zcord

## Обзор

Данное руководство описывает процесс развертывания обновленной версии Zcord с поддержкой:

- Сквозного шифрования (E2E encryption)
- WebSocket соединений для real-time обновлений
- Pub/Sub системы для массовых рассылок
- Расширенных возможностей сообщений (вложения, статусы прочтения, ответы)

## Предварительные требования

### Системные требования

- **Go**: версия 1.22.1 или выше
- **Node.js**: версия 18 или выше
- **PostgreSQL**: версия 13 или выше
- **Redis**: версия 6 или выше (для WebSocket и pub/sub)

### Новые зависимости

#### Backend (Go)

```bash
go mod tidy
```

Новые пакеты:

- `github.com/gorilla/websocket` - для WebSocket соединений
- `github.com/redis/go-redis/v9` - для работы с Redis

#### Frontend (Next.js)

Криптографические функции используют встроенный Web Crypto API браузера.

## Пошаговое развертывание

### 1. Подготовка базы данных

#### Остановите приложение

```bash
# Если используете Docker/Podman
podman-compose -f podman-compose.dev.yml down
# или
docker-compose -f docker-compose.dev.yml down
```

#### Выполните миграцию базы данных

```bash
# Подключитесь к PostgreSQL
psql -h localhost -U your_username -d zcord_db

# Выполните миграцию
\i security_migration.sql
```

#### Проверьте результат миграции

```sql
-- Проверьте, что новые таблицы созданы
\dt

-- Должны появиться таблицы:
-- user_keys, chat_keys, websocket_sessions, message_read_status, message_attachments
```

### 2. Настройка Redis

#### Установка Redis (если не установлен)

**Ubuntu/Debian:**

```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

**macOS:**

```bash
brew install redis
brew services start redis
```

**Docker:**

```bash
docker run -d --name redis -p 6379:6379 redis:alpine
```

#### Настройка переменных окружения

Обновите файл `server/.env`:

```env
# Существующие переменные
DATABASE_URL=postgres://username:password@localhost/zcord_db
JWT_SECRET=your_jwt_secret

# Новые переменные для Redis
REDIS_URL=localhost:6379
REDIS_PASSWORD=
```

### 3. Обновление кода

#### Обновите зависимости Go

```bash
cd server
go mod tidy
go mod download
```

#### Соберите приложение

```bash
go build -o zcord
```

### 4. Обновление фронтенда

#### Установите зависимости (если нужно)

```bash
npm install
```

#### Соберите фронтенд

```bash
npm run build
```

### 5. Запуск обновленного приложения

#### Запуск через Docker/Podman

```bash
# Обновите docker-compose файлы для включения Redis
podman-compose -f podman-compose.dev.yml up -d
```

#### Ручной запуск

**Запуск Redis:**

```bash
redis-server
```

**Запуск бэкенда:**

```bash
cd server
./zcord
```

**Запуск фронтенда:**

```bash
npm run dev
```

### 6. Проверка развертывания

#### Проверьте логи сервера

Должны появиться сообщения:

```
Redis connected successfully
WebSocket Hub initialized
Server started on port 8000
WebSocket endpoint: ws://localhost:8000/ws
```

#### Проверьте WebSocket соединение

Откройте браузер и перейдите в консоль разработчика:

```javascript
// Проверка WebSocket соединения
const ws = new WebSocket("ws://localhost:8000/ws?token=YOUR_JWT_TOKEN");
ws.onopen = () => console.log("WebSocket connected");
ws.onmessage = (event) => console.log("Message:", event.data);
```

#### Проверьте Redis

```bash
redis-cli ping
# Должен вернуть: PONG
```

## Конфигурация Docker

### Обновленный docker-compose.dev.yml

```yaml
version: "3.8"

services:
  postgres:
    image: postgres:15
    container_name: zcord-postgres-dev
    environment:
      POSTGRES_DB: zcord_db
      POSTGRES_USER: zcord_user
      POSTGRES_PASSWORD: zcord_password
    ports:
      - "5432:5432"
    volumes:
      - ./my_postgres_data:/var/lib/postgresql/data
      - ./security_migration.sql:/docker-entrypoint-initdb.d/security_migration.sql

  redis:
    image: redis:7-alpine
    container_name: zcord-redis-dev
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

  backend:
    build:
      context: ./server
      dockerfile: Dockerfile
    container_name: zcord-backend-dev
    environment:
      DATABASE_URL: postgres://zcord_user:zcord_password@postgres:5432/zcord_db
      JWT_SECRET: your_jwt_secret_here
      REDIS_URL: redis:6379
      REDIS_PASSWORD: ""
    ports:
      - "8000:8000"
    depends_on:
      - postgres
      - redis
    volumes:
      - ./server/uploads:/app/uploads

  frontend:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: zcord-frontend-dev
    ports:
      - "3000:3000"
    depends_on:
      - backend
    environment:
      - NODE_ENV=development

volumes:
  redis_data:
```

## Безопасность

### Настройки производственной среды

#### 1. Переменные окружения

```env
# Используйте сильные пароли
JWT_SECRET=very_strong_random_secret_key_here
REDIS_PASSWORD=strong_redis_password

# Настройки CORS для продакшена
ALLOWED_ORIGINS=https://yourdomain.com

# SSL/TLS настройки
SSL_CERT_PATH=/path/to/cert.pem
SSL_KEY_PATH=/path/to/key.pem
```

#### 2. Redis безопасность

```bash
# Настройте аутентификацию Redis
redis-cli CONFIG SET requirepass "your_strong_password"

# Отключите опасные команды
redis-cli CONFIG SET rename-command FLUSHDB ""
redis-cli CONFIG SET rename-command FLUSHALL ""
```

#### 3. PostgreSQL безопасность

```sql
-- Создайте отдельного пользователя для приложения
CREATE USER zcord_app WITH PASSWORD 'strong_password';
GRANT CONNECT ON DATABASE zcord_db TO zcord_app;
GRANT USAGE ON SCHEMA public TO zcord_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO zcord_app;
```

## Мониторинг и логирование

### Настройка логов

#### Backend логирование

```go
// Добавьте в main.go
log.SetFlags(log.LstdFlags | log.Lshortfile)
log.SetOutput(os.Stdout)
```

#### Мониторинг WebSocket соединений

```bash
# Проверка активных соединений
redis-cli CLIENT LIST

# Мониторинг pub/sub каналов
redis-cli PUBSUB CHANNELS
```

### Метрики производительности

#### Мониторинг Redis

```bash
# Информация о памяти
redis-cli INFO memory

# Статистика команд
redis-cli INFO commandstats
```

#### Мониторинг PostgreSQL

```sql
-- Активные соединения
SELECT count(*) FROM pg_stat_activity;

-- Размер базы данных
SELECT pg_size_pretty(pg_database_size('zcord_db'));
```

## Устранение неполадок

### Частые проблемы

#### 1. WebSocket не подключается

```bash
# Проверьте, что сервер запущен
curl -I http://localhost:8000/ws

# Проверьте логи сервера
tail -f server.log
```

#### 2. Redis недоступен

```bash
# Проверьте статус Redis
redis-cli ping

# Проверьте конфигурацию
redis-cli CONFIG GET "*"
```

#### 3. Ошибки шифрования

```javascript
// Проверьте поддержку Web Crypto API
console.log("Web Crypto API supported:", !!window.crypto.subtle);

// Проверьте HTTPS (требуется для Web Crypto API)
console.log("HTTPS:", location.protocol === "https:");
```

### Логи для отладки

#### Включение подробного логирования

```go
// В main.go добавьте
log.SetLevel(log.DebugLevel)
```

#### Мониторинг WebSocket сообщений

```javascript
// В браузере
websocketService.addEventListener("onMessage", (message) => {
  console.log("WebSocket message:", message);
});
```

## Резервное копирование

### База данных

```bash
# Создание бэкапа
pg_dump -h localhost -U zcord_user zcord_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Восстановление
psql -h localhost -U zcord_user zcord_db < backup_file.sql
```

### Redis данные

```bash
# Создание снимка
redis-cli BGSAVE

# Копирование файла дампа
cp /var/lib/redis/dump.rdb /backup/redis_backup_$(date +%Y%m%d_%H%M%S).rdb
```

## Масштабирование

### Горизонтальное масштабирование WebSocket

#### Настройка кластера Redis

```bash
# Настройка Redis Cluster для pub/sub
redis-cli --cluster create 127.0.0.1:7000 127.0.0.1:7001 127.0.0.1:7002
```

#### Балансировка нагрузки WebSocket

```nginx
# Nginx конфигурация для WebSocket
upstream websocket_backend {
    server 127.0.0.1:8000;
    server 127.0.0.1:8001;
    server 127.0.0.1:8002;
}

server {
    location /ws {
        proxy_pass http://websocket_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

Развертывание завершено! Система готова к использованию с полной поддержкой безопасности и real-time функций.
