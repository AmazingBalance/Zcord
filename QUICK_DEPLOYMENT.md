# 🚀 Быстрое развертывание Zcord с системой безопасности

## Пошаговая инструкция для полного развертывания

### ⚠️ ВАЖНО: Сделайте резервную копию перед началом!

```bash
# Создайте бэкап базы данных
pg_dump -h localhost -U your_username zcord_db > backup_before_security_$(date +%Y%m%d_%H%M%S).sql
```

---

## 🔧 Шаг 1: Подготовка системы

### 1.1 Остановите текущее приложение

```bash
# Если используете Podman
podman-compose -f podman-compose.dev.yml down

# Если используете Docker
docker-compose -f docker-compose.dev.yml down

# Если запущено вручную - остановите процессы
pkill -f "go run" || pkill -f "npm run dev"
```

### 1.2 Установите Redis (если не установлен)

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

**Проверьте Redis:**

```bash
redis-cli ping
# Должен вернуть: PONG
```

---

## 🗄️ Шаг 2: Обновление базы данных

### 2.1 Подключитесь к PostgreSQL

```bash
# Замените на ваши данные
psql -h localhost -U your_username -d zcord_db
```

### 2.2 Выполните миграцию

```sql
-- В psql выполните:
\i security_migration.sql
```

### 2.3 Проверьте результат

```sql
-- Проверьте новые таблицы
\dt

-- Должны появиться:
-- user_keys, chat_keys, websocket_sessions, message_read_status, message_attachments

-- Проверьте новые столбцы в messages
\d messages

-- Выйдите из psql
\q
```

---

## ⚙️ Шаг 3: Настройка переменных окружения

### 3.1 Обновите server/.env

```bash
cd server
```

Создайте или обновите файл `.env`:

```env
# Существующие переменные
DATABASE_URL=postgres://your_username:your_password@localhost/zcord_db
JWT_SECRET=your_jwt_secret_here

# НОВЫЕ переменные для Redis и WebSocket
REDIS_URL=localhost:6379
REDIS_PASSWORD=
```

---

## 🔨 Шаг 4: Обновление бэкенда

### 4.1 Обновите зависимости Go

```bash
cd server
go mod tidy
go mod download
```

### 4.2 Соберите приложение

```bash
go build -o zcord
```

### 4.3 Проверьте сборку

```bash
# Должно показать версию Go и отсутствие ошибок
go version
ls -la zcord
```

---

## 🎨 Шаг 5: Обновление фронтенда

### 5.1 Вернитесь в корневую папку

```bash
cd ..
```

### 5.2 Установите зависимости (если нужно)

```bash
npm install
```

### 5.3 Соберите фронтенд

```bash
npm run build
```

---

## 🚀 Шаг 6: Запуск приложения

### Вариант A: Запуск через Docker/Podman (Рекомендуется)

#### 6.1 Обновите docker-compose файл

Создайте или обновите `docker-compose.dev.yml`:

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

#### 6.2 Запустите контейнеры

```bash
# Podman
podman-compose -f docker-compose.dev.yml up -d

# Docker
docker-compose -f docker-compose.dev.yml up -d
```

### Вариант B: Ручной запуск

#### 6.1 Запустите Redis (в отдельном терминале)

```bash
redis-server
```

#### 6.2 Запустите бэкенд (в отдельном терминале)

```bash
cd server
./zcord
```

#### 6.3 Запустите фронтенд (в отдельном терминале)

```bash
npm run dev
```

---

## ✅ Шаг 7: Проверка развертывания

### 7.1 Проверьте логи бэкенда

Должны появиться сообщения:

```
Redis connected successfully
WebSocket Hub initialized
Server started on port 8000
WebSocket endpoint: ws://localhost:8000/ws
```

### 7.2 Проверьте доступность сервисов

```bash
# Проверьте бэкенд
curl http://localhost:8000/api/validate-token

# Проверьте фронтенд
curl http://localhost:3000

# Проверьте Redis
redis-cli ping
```

### 7.3 Проверьте в браузере

1. Откройте http://localhost:3000
2. Войдите в аккаунт
3. Откройте консоль разработчика (F12)
4. Должны появиться сообщения о подключении WebSocket

---

## 🔍 Шаг 8: Тестирование новых функций

### 8.1 Проверьте WebSocket соединение

В консоли браузера:

```javascript
// Проверьте, что WebSocket подключен
console.log("WebSocket status:", websocketService?.getConnectionStatus());
```

### 8.2 Проверьте шифрование

1. Отправьте сообщение в любой чат
2. В консоли должны появиться сообщения о генерации ключей
3. Проверьте в базе данных:

```sql
-- Проверьте, что ключи созданы
SELECT COUNT(*) FROM user_keys;

-- Проверьте зашифрованные сообщения
SELECT id, is_encrypted, encrypted_content FROM messages WHERE is_encrypted = true LIMIT 5;
```

### 8.3 Проверьте статусы прочтения

1. Отправьте сообщение
2. Прочитайте его с другого аккаунта
3. Проверьте статус:

```sql
SELECT * FROM message_read_status ORDER BY read_at DESC LIMIT 5;
```

---

## 🚨 Устранение проблем

### Проблема: Redis не подключается

```bash
# Проверьте статус Redis
sudo systemctl status redis-server

# Перезапустите Redis
sudo systemctl restart redis-server

# Проверьте порт
netstat -tlnp | grep 6379
```

### Проблема: WebSocket не работает

```bash
# Проверьте логи бэкенда
tail -f server.log

# Проверьте переменные окружения
echo $REDIS_URL
```

### Проблема: Ошибки миграции базы данных

```bash
# Восстановите из бэкапа
psql -h localhost -U your_username -d zcord_db < backup_before_security_*.sql

# Повторите миграцию
psql -h localhost -U your_username -d zcord_db -f security_migration.sql
```

### Проблема: Ошибки сборки Go

```bash
# Очистите модули
go clean -modcache
go mod download
go mod tidy

# Пересоберите
go build -o zcord
```

---

## 📊 Мониторинг после запуска

### Проверьте производительность

```bash
# Мониторинг Redis
redis-cli INFO memory
redis-cli INFO clients

# Мониторинг PostgreSQL
psql -c "SELECT count(*) FROM pg_stat_activity;"

# Проверьте использование портов
netstat -tlnp | grep -E "(3000|8000|5432|6379)"
```

### Логи для мониторинга

```bash
# Логи контейнеров (если используете Docker/Podman)
podman logs -f zcord-backend-dev
podman logs -f zcord-frontend-dev
podman logs -f zcord-redis-dev

# Логи системы
journalctl -u redis-server -f
```

---

## 🎉 Готово!

Ваше приложение Zcord теперь работает с:

- ✅ Сквозным шифрованием
- ✅ WebSocket real-time обновлениями
- ✅ Pub/Sub системой для массовых рассылок
- ✅ Расширенными возможностями сообщений
- ✅ Статусами прочтения
- ✅ Поддержкой вложений

**Доступ к приложению:** http://localhost:3000

**API документация:** Смотрите `docs/SECURITY_ARCHITECTURE.md`

**Подробное руководство:** Смотрите `DEPLOYMENT_GUIDE.md`
