# 📋 Логи Podman в Zcord

## 🔍 Где хранятся логи

Podman использует **journald** для хранения логов контейнеров. Логи не сохраняются в отдельные файлы, а управляются системой журналирования.

## 📱 Просмотр логов через npm команды

### Разработка (Development)

```bash
# Показать команды для просмотра логов
npm run podman:dev:logs

# Логи отдельных сервисов в реальном времени
npm run podman:dev:logs:backend    # Go сервер
npm run podman:dev:logs:frontend   # Next.js приложение
npm run podman:dev:logs:postgres   # База данных
```

### Продакшн (Production)

```bash
# Показать команды для просмотра логов
npm run podman:prod:logs

# Логи отдельных сервисов в реальном времени
npm run podman:prod:logs:backend   # Go сервер
npm run podman:prod:logs:frontend  # Next.js приложение
npm run podman:prod:logs:postgres  # База данных
```

## 🛠️ Прямые команды Podman

### Просмотр логов в реальном времени (-f)

```bash
# Разработка
podman logs -f zcord-backend-dev
podman logs -f zcord-frontend-dev
podman logs -f zcord-postgres-dev

# Продакшн
podman logs -f zcord-backend
podman logs -f zcord-frontend
podman logs -f zcord-postgres
```

### Просмотр последних N строк

```bash
# Последние 50 строк
podman logs --tail 50 zcord-backend-dev

# Последние 100 строк
podman logs --tail 100 zcord-frontend-dev
```

### Просмотр логов за определенный период

```bash
# Логи за последний час
podman logs --since 1h zcord-backend-dev

# Логи с определенного времени
podman logs --since "2025-01-07T10:00:00" zcord-backend-dev

# Логи до определенного времени
podman logs --until "2025-01-07T12:00:00" zcord-backend-dev
```

## 📊 Системные логи через journalctl

Поскольку Podman использует journald, можно также использовать journalctl:

```bash
# Логи конкретного контейнера
journalctl CONTAINER_NAME=zcord-backend-dev

# Логи всех контейнеров Podman
journalctl -u podman

# Логи в реальном времени
journalctl -f CONTAINER_NAME=zcord-backend-dev
```

## 🔧 Полезные опции для логов

### Форматирование времени

```bash
# С временными метками
podman logs -t zcord-backend-dev

# Только с определенного времени
podman logs --since "10m ago" zcord-backend-dev
```

### Фильтрация логов

```bash
# Поиск ошибок в логах
podman logs zcord-backend-dev | grep -i error

# Поиск конкретных запросов
podman logs zcord-backend-dev | grep "POST /api"

# Сохранение логов в файл
podman logs zcord-backend-dev > backend-logs.txt
```

## 🚨 Отладка проблем

### Проверка статуса контейнеров

```bash
# Статус всех контейнеров
podman ps -a

# Детальная информация о контейнере
podman inspect zcord-backend-dev
```

### Проверка ресурсов

```bash
# Использование ресурсов
podman stats

# Информация о конкретном контейнере
podman stats zcord-backend-dev
```

## 📝 Примеры типичных логов

### Backend (Go сервер)

```
2025/08/07 09:15:18 Сервер запущен на порту 8000...
2025/08/07 09:15:28 Received request: POST /api/login
2025/08/07 09:15:28 Error querying user: pq: relation "users" does not exist
```

### Frontend (Next.js)

```
▲ Next.js 15.0.4
- Local:        http://localhost:3000
✓ Ready in 2.2s
GET / 200 in 2654ms
```

### PostgreSQL

```
2025-08-07 09:06:25.283 UTC [1] LOG:  database system is ready to accept connections
```

## 💡 Советы по работе с логами

1. **Используйте `-f` для мониторинга в реальном времени**
2. **Комбинируйте с `grep` для поиска конкретных событий**
3. **Сохраняйте важные логи в файлы для анализа**
4. **Используйте `--tail` для просмотра только последних записей**
5. **Проверяйте логи при возникновении проблем**

## 🔄 Ротация логов

Podman автоматически управляет ротацией логов через journald. Настройки можно изменить в `/etc/systemd/journald.conf` на хост-системе.
