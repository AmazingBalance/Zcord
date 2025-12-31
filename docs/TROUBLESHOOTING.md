# 🔧 Руководство по устранению неполадок Zcord

Подробное руководство по диагностике и решению проблем в проекте Zcord.

## 📋 Содержание

- [Общие проблемы](#общие-проблемы)
- [Проблемы с Docker](#проблемы-с-docker)
- [Проблемы с базой данных](#проблемы-с-базой-данных)
- [Проблемы с Backend](#проблемы-с-backend)
- [Проблемы с Frontend](#проблемы-с-frontend)
- [Проблемы с сетью](#проблемы-с-сетью)
- [Проблемы производительности](#проблемы-производительности)
- [Инструменты диагностики](#инструменты-диагностики)

## 🚨 Общие проблемы

### Проблема: Приложение не запускается

**Симптомы:**

- Контейнеры не стартуют
- Ошибки при выполнении `docker compose up`
- Сервисы недоступны

**Диагностика:**

```bash
# Проверка статуса контейнеров
docker compose ps

# Просмотр логов всех сервисов
docker compose logs

# Проверка использования портов
netstat -tulpn | grep -E ':(3000|8000|5435)'
# или на macOS
lsof -i :3000 -i :8000 -i :5435
```

**Решения:**

1. **Порты заняты:**

```bash
# Найти процесс, использующий порт
sudo lsof -i :3000
# Завершить процесс
sudo kill -9 <PID>
```

2. **Недостаточно ресурсов Docker:**

```bash
# Проверка ресурсов Docker
docker system df
docker system prune -a  # Очистка неиспользуемых ресурсов
```

3. **Проблемы с правами доступа:**

```bash
# Исправление прав на файлы
sudo chown -R $USER:$USER .
chmod -R 755 server/uploads
```

### Проблема: "Permission denied" ошибки

**Симптомы:**

- Ошибки доступа к файлам
- Невозможность записи в директории
- Docker не может монтировать volumes

**Решения:**

1. **Linux/macOS:**

```bash
# Добавление пользователя в группу docker
sudo usermod -aG docker $USER
newgrp docker

# Исправление прав на проект
sudo chown -R $USER:$USER /path/to/Zcord-main
```

2. **Windows (WSL2):**

```bash
# В WSL2 терминале
sudo chown -R $USER:$USER /mnt/c/path/to/Zcord-main
```

## 🐳 Проблемы с Docker

### Проблема: "Cannot connect to the Docker daemon"

**Симптомы:**

```
Cannot connect to the Docker daemon at unix:///var/run/docker.sock
```

**Решения:**

1. **Запуск Docker daemon:**

```bash
# Linux
sudo systemctl start docker
sudo systemctl enable docker

# macOS
open /Applications/Docker.app

# Windows
# Запустите Docker Desktop
```

2. **Проверка статуса Docker:**

```bash
docker version
docker info
```

### Проблема: Контейнеры постоянно перезапускаются

**Симптомы:**

```bash
docker compose ps
# STATUS: Restarting (1) 5 seconds ago
```

**Диагностика:**

```bash
# Просмотр логов проблемного контейнера
docker compose logs backend --tail=50

# Проверка ресурсов контейнера
docker stats
```

**Решения:**

1. **Проблемы с переменными окружения:**

```bash
# Проверка .env файла
cat server/.env
# Убедитесь, что все переменные заданы корректно
```

2. **Проблемы с зависимостями:**

```bash
# Пересборка образов
docker compose build --no-cache
docker compose up -d
```

### Проблема: Медленная сборка образов

**Симптомы:**

- Долгое время сборки
- Таймауты при загрузке зависимостей

**Решения:**

1. **Использование Docker BuildKit:**

```bash
export DOCKER_BUILDKIT=1
docker compose build
```

2. **Многоэтапная сборка с кешированием:**

```dockerfile
# В Dockerfile добавить --mount=type=cache
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download
```

3. **Использование .dockerignore:**

```bash
# Убедитесь, что .dockerignore исключает ненужные файлы
echo "node_modules" >> .dockerignore
echo ".git" >> .dockerignore
```

## 🗄️ Проблемы с базой данных

### Проблема: "relation does not exist"

**Симптомы:**

```
ERROR: relation "users" does not exist
```

**Диагностика:**

```bash
# Подключение к базе данных
docker compose exec postgres psql -U nikdimer -d zcord

# Проверка существующих таблиц
\dt

# Проверка схемы базы данных
\d users
```

**Решения:**

1. **Пересоздание базы данных:**

```bash
# Остановка и удаление volumes
docker compose down -v

# Запуск с инициализацией
docker compose up -d
```

2. **Ручная инициализация:**

```bash
# Выполнение init.sql
docker compose exec -T postgres psql -U nikdimer -d zcord < init.sql
```

### Проблема: Подключение к базе данных отклонено

**Симптомы:**

```
connection refused
could not connect to server
```

**Диагностика:**

```bash
# Проверка статуса PostgreSQL
docker compose logs postgres

# Проверка сетевого подключения
docker compose exec backend ping postgres
```

**Решения:**

1. **Проверка настроек подключения:**

```bash
# В server/.env
DATABASE_URL=postgres://nikdimer:technocraft2000@postgres:5432/zcord?sslmode=disable
```

2. **Ожидание готовности базы данных:**

```yaml
# В docker-compose.yml добавить healthcheck
postgres:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U nikdimer -d zcord"]
    interval: 30s
    timeout: 10s
    retries: 3
```

### Проблема: Медленные запросы к базе данных

**Диагностика:**

```sql
-- Включение логирования медленных запросов
ALTER SYSTEM SET log_min_duration_statement = 1000; -- 1 секунда
SELECT pg_reload_conf();

-- Просмотр активных запросов
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';
```

**Решения:**

1. **Добавление индексов:**

```sql
-- Анализ использования индексов
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE tablename = 'messages';

-- Создание недостающих индексов
CREATE INDEX CONCURRENTLY idx_messages_chat_created
ON messages(chat_id, created_at DESC);
```

2. **Оптимизация запросов:**

```sql
-- Использование EXPLAIN ANALYZE
EXPLAIN ANALYZE SELECT * FROM messages WHERE chat_id = 1;
```

## ⚙️ Проблемы с Backend

### Проблема: "panic: Error loading .env file"

**Симптомы:**

```
panic: Error loading .env file
goroutine 1 [running]:
main.init.0()
```

**Решения:**

1. **Создание .env файла:**

```bash
# Создание server/.env
cat > server/.env << EOF
JWT_SECRET=your-super-secret-jwt-key-change-in-production
DATABASE_URL=postgres://nikdimer:technocraft2000@postgres:5432/zcord?sslmode=disable
EOF
```

2. **Проверка .dockerignore:**

```bash
# Убедитесь, что .env не исключен
grep -v "^#" server/.dockerignore | grep -v "^$"
```

### Проблема: JWT токены не работают

**Симптомы:**

- Ошибки аутентификации
- "Invalid token" сообщения
- Пользователи не могут войти в систему

**Диагностика:**

```bash
# Проверка JWT_SECRET
docker compose exec backend env | grep JWT_SECRET

# Проверка логов аутентификации
docker compose logs backend | grep -i "token\|auth"
```

**Решения:**

1. **Проверка JWT_SECRET:**

```bash
# JWT_SECRET должен быть одинаковым между перезапусками
# Используйте стабильный секрет в production
JWT_SECRET=stable-secret-key-for-production
```

2. **Проверка времени жизни токена:**

```go
// В auth.go проверьте время жизни токена
expirationTime := time.Now().Add(24 * time.Hour) // 24 часа
```

### Проблема: CORS ошибки

**Симптомы:**

```
Access to fetch at 'http://localhost:8000/api/login' from origin 'http://localhost:3000' has been blocked by CORS policy
```

**Решения:**

1. **Проверка CORS настроек:**

```go
// В main.go функция enableCORS
func enableCORS(h http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
        w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS, POST")
        w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
        w.Header().Set("Access-Control-Allow-Credentials", "true")

        if r.Method == http.MethodOptions {
            w.WriteHeader(http.StatusNoContent)
            return
        }

        h.ServeHTTP(w, r)
    })
}
```

2. **Для production обновите origin:**

```go
w.Header().Set("Access-Control-Allow-Origin", "https://yourdomain.com")
```

## 🎨 Проблемы с Frontend

### Проблема: "Module not found" ошибки

**Симптомы:**

```
Module not found: Can't resolve '@/components/ChatZone'
```

**Решения:**

1. **Проверка jsconfig.json:**

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"]
    }
  }
}
```

2. **Переустановка зависимостей:**

```bash
rm -rf node_modules package-lock.json
npm install
```

### Проблема: Redux состояние не обновляется

**Симптомы:**

- UI не отражает изменения данных
- Состояние "застревает"
- Компоненты не перерендериваются

**Диагностика:**

```javascript
// Добавьте логирование в Redux middleware
import { configureStore } from "@reduxjs/toolkit";

const store = configureStore({
  reducer: {
    // ваши reducers
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ["persist/PERSIST"],
      },
    }).concat(
      // Добавьте logger middleware для отладки
      (store) => (next) => (action) => {
        console.log("Dispatching:", action);
        const result = next(action);
        console.log("Next state:", store.getState());
        return result;
      }
    ),
});
```

**Решения:**

1. **Проверка immutability:**

```javascript
// Неправильно - мутация состояния
state.user.name = action.payload.name;

// Правильно - создание нового объекта
state.user = {
  ...state.user,
  name: action.payload.name,
};
```

2. **Использование Redux DevTools:**

```bash
# Установка расширения Redux DevTools в браузере
# Chrome: Redux DevTools Extension
# Firefox: Redux DevTools Add-on
```

### Проблема: CSS стили не применяются

**Симптомы:**

- Компоненты выглядят неправильно
- Стили не загружаются
- CSS Modules не работают

**Решения:**

1. **Проверка импорта CSS Modules:**

```javascript
// Правильный импорт
import styles from './Component.module.css'

// Использование
<div className={styles.container}>
```

2. **Проверка next.config.mjs:**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Убедитесь, что CSS Modules включены (по умолчанию включены)
  cssModules: true,
};
```

## 🌐 Проблемы с сетью

### Проблема: Сервисы не могут связаться друг с другом

**Симптомы:**

- Frontend не может подключиться к Backend
- Backend не может подключиться к базе данных
- Таймауты соединений

**Диагностика:**

```bash
# Проверка Docker сетей
docker network ls
docker network inspect zcord-main_zcord-network

# Проверка подключения между контейнерами
docker compose exec frontend ping backend
docker compose exec backend ping postgres
```

**Решения:**

1. **Проверка docker-compose.yml:**

```yaml
services:
  frontend:
    networks:
      - zcord-network
  backend:
    networks:
      - zcord-network
  postgres:
    networks:
      - zcord-network

networks:
  zcord-network:
    driver: bridge
```

2. **Использование правильных hostname:**

```javascript
// В frontend коде используйте имя сервиса
const API_URL =
  process.env.NODE_ENV === "production"
    ? "https://yourdomain.com/api"
    : "http://localhost:8000/api";
```

### Проблема: DNS resolution не работает

**Симптомы:**

```
getaddrinfo: Name or service not known
```

**Решения:**

1. **Перезапуск Docker daemon:**

```bash
sudo systemctl restart docker
```

2. **Очистка DNS кеша Docker:**

```bash
docker system prune --volumes
```

## 📊 Проблемы производительности

### Проблема: Медленная загрузка страниц

**Диагностика:**

```bash
# Проверка времени ответа API
curl -w "@curl-format.txt" -o /dev/null -s "http://localhost:8000/api/chats"

# Создайте файл curl-format.txt:
cat > curl-format.txt << EOF
     time_namelookup:  %{time_namelookup}\n
        time_connect:  %{time_connect}\n
     time_appconnect:  %{time_appconnect}\n
    time_pretransfer:  %{time_pretransfer}\n
       time_redirect:  %{time_redirect}\n
  time_starttransfer:  %{time_starttransfer}\n
                     ----------\n
          time_total:  %{time_total}\n
EOF
```

**Решения:**

1. **Оптимизация запросов к базе данных:**

```sql
-- Добавление индексов
CREATE INDEX CONCURRENTLY idx_messages_chat_created
ON messages(chat_id, created_at DESC);

-- Анализ медленных запросов
SELECT query, mean_time, calls
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

2. **Кеширование на уровне приложения:**

```go
// Простой in-memory кеш
var cache = make(map[string]interface{})
var cacheMutex = sync.RWMutex{}

func getCachedData(key string) (interface{}, bool) {
    cacheMutex.RLock()
    defer cacheMutex.RUnlock()

    data, exists := cache[key]
    return data, exists
}
```

### Проблема: Высокое использование памяти

**Диагностика:**

```bash
# Мониторинг использования ресурсов
docker stats

# Проверка логов на memory leaks
docker compose logs backend | grep -i "memory\|leak\|oom"
```

**Решения:**

1. **Ограничение ресурсов контейнеров:**

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
```

2. **Оптимизация Go приложения:**

```go
// Принудительная сборка мусора
import "runtime"

func forceGC() {
    runtime.GC()
    runtime.GC() // Двойной вызов для более агрессивной очистки
}
```

## 🛠️ Инструменты диагностики

### Логирование

**1. Централизованные логи:**

```bash
# Просмотр всех логов
docker compose logs -f

# Логи конкретного сервиса
docker compose logs -f backend

# Логи с временными метками
docker compose logs -f -t backend

# Последние N строк
docker compose logs --tail=100 backend
```

**2. Структурированное логирование в Go:**

```go
import "log/slog"

func main() {
    logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

    logger.Info("Server starting",
        slog.String("port", "8000"),
        slog.String("env", os.Getenv("APP_ENV")))
}
```

### Мониторинг

**1. Health checks:**

```yaml
services:
  backend:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

**2. Метрики производительности:**

```bash
# Создание endpoint для метрик
curl http://localhost:8000/metrics
```

### Отладка

**1. Подключение к контейнеру:**

```bash
# Запуск shell в контейнере
docker compose exec backend sh
docker compose exec postgres psql -U nikdimer -d zcord

# Выполнение команд в контейнере
docker compose exec backend ls -la /root/
```

**2. Копирование файлов:**

```bash
# Из контейнера на хост
docker compose cp backend:/root/uploads/file.jpg ./local-file.jpg

# С хоста в контейнер
docker compose cp ./local-file.jpg backend:/root/uploads/
```

### Профилирование

**1. Go pprof:**

```go
import _ "net/http/pprof"

func main() {
    go func() {
        log.Println(http.ListenAndServe("localhost:6060", nil))
    }()

    // Ваш основной код
}
```

**2. Анализ производительности:**

```bash
# CPU профиль
go tool pprof http://localhost:6060/debug/pprof/profile

# Memory профиль
go tool pprof http://localhost:6060/debug/pprof/heap
```

## 📞 Получение помощи

### Сбор информации для отчета об ошибке

```bash
#!/bin/bash
# debug-info.sh - Скрипт для сбора отладочной информации

echo "=== System Information ==="
uname -a
docker --version
docker compose version

echo "=== Container Status ==="
docker compose ps

echo "=== Container Logs ==="
docker compose logs --tail=50

echo "=== Network Information ==="
docker network ls
docker network inspect zcord-main_zcord-network

echo "=== Volume Information ==="
docker volume ls
docker volume inspect zcord-main_postgres_data

echo "=== Resource Usage ==="
docker stats --no-stream

echo "=== Environment Variables ==="
docker compose config
```

### Контрольный список для диагностики

- [ ] Проверены логи всех сервисов
- [ ] Проверен статус всех контейнеров
- [ ] Проверены переменные окружения
- [ ] Проверены сетевые подключения
- [ ] Проверены права доступа к файлам
- [ ] Проверены порты и их доступность
- [ ] Проверена конфигурация Docker Compose
- [ ] Проверены ресурсы системы (CPU, память, диск)

---

**Версия документации:** 1.0  
**Последнее обновление:** 28 июля 2025

Если проблема не решена, создайте issue в репозитории с подробным описанием проблемы и выводом скрипта `debug-info.sh`.
