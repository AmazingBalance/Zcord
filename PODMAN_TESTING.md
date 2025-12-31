# Тестирование миграции на Podman

Этот документ содержит все команды для проверки корректности миграции с Docker на Podman.

## Предварительная проверка

### 1. Проверка установки Podman

```bash
# Проверка версии Podman
podman --version

# Проверка версии Podman Compose
podman-compose --version

# Проверка информации о системе
podman info

# Проверка машины Podman (для macOS)
podman machine list
```

**Ожидаемый результат:**

- Podman версии 4.0+
- Podman Compose версии 1.0+
- Информация о системе без ошибок
- Активная машина Podman (для macOS)

### 2. Проверка файлов проекта

```bash
# Проверка наличия Podman compose файлов
ls -la podman-compose*.yml

# Проверка наличия Containerfile
ls -la Containerfile server/Containerfile

# Проверка структуры проекта
tree -L 2
```

**Ожидаемый результат:**

- `podman-compose.yml` - production конфигурация
- `podman-compose.dev.yml` - development конфигурация
- `Containerfile` - frontend контейнер
- `server/Containerfile` - backend контейнер

## Тестирование основных команд

### 3. Тест базовых Podman команд

```bash
# Тест запуска простого контейнера
podman run --rm hello-world

# Проверка образов
podman images

# Проверка контейнеров
podman ps -a

# Очистка
podman system prune -f
```

**Ожидаемый результат:**

- Успешный запуск hello-world контейнера
- Отображение списка образов
- Отображение списка контейнеров

### 4. Тест Podman Compose

```bash
# Проверка синтаксиса compose файлов
podman-compose -f podman-compose.yml config
podman-compose -f podman-compose.dev.yml config

# Тест валидации без запуска
podman-compose -f podman-compose.yml validate
```

**Ожидаемый результат:**

- Корректный вывод конфигурации без ошибок
- Успешная валидация compose файлов

## Тестирование сборки образов

### 5. Сборка frontend образа

```bash
# Сборка frontend контейнера
podman build -f Containerfile -t zcord-frontend:test .

# Проверка созданного образа
podman images | grep zcord-frontend

# Тест запуска (без зависимостей)
podman run --rm -p 3001:3000 zcord-frontend:test &
sleep 5
curl -I http://localhost:3001
pkill -f "podman run"
```

**Ожидаемый результат:**

- Успешная сборка образа
- Образ появился в списке
- HTTP ответ от контейнера

### 6. Сборка backend образа

```bash
# Сборка backend контейнера
cd server
podman build -f Containerfile -t zcord-backend:test .
cd ..

# Проверка созданного образа
podman images | grep zcord-backend

# Тест запуска (без БД)
podman run --rm -p 8001:8000 zcord-backend:test &
sleep 5
curl -I http://localhost:8001/api/register
pkill -f "podman run"
```

**Ожидаемый результат:**

- Успешная сборка образа
- Образ появился в списке
- HTTP ответ от API (может быть ошибка БД, это нормально)

## Тестирование полного стека

### 7. Запуск development окружения

```bash
# Запуск в development режиме
podman-compose -f podman-compose.dev.yml up -d

# Проверка статуса сервисов
podman-compose -f podman-compose.dev.yml ps

# Проверка логов
podman-compose -f podman-compose.dev.yml logs --tail=10

# Проверка доступности сервисов
sleep 30
curl -I http://localhost:3000  # Frontend
curl -I http://localhost:8000/api/register  # Backend API

# Проверка базы данных
podman-compose -f podman-compose.dev.yml exec postgres psql -U nikdimer -d zcord -c "SELECT version();"

# Остановка
podman-compose -f podman-compose.dev.yml down
```

**Ожидаемый результат:**

- Все сервисы в статусе "Up"
- Логи без критических ошибок
- HTTP ответы от frontend и backend
- Успешное подключение к БД

### 8. Запуск production окружения

```bash
# Запуск в production режиме
podman-compose -f podman-compose.yml up -d

# Проверка статуса сервисов
podman-compose -f podman-compose.yml ps

# Проверка логов
podman-compose -f podman-compose.yml logs --tail=10

# Проверка доступности сервисов
sleep 30
curl -I http://localhost:3000  # Frontend
curl -I http://localhost:8000/api/register  # Backend API

# Остановка
podman-compose -f podman-compose.yml down
```

**Ожидаемый результат:**

- Все сервисы в статусе "Up"
- Логи без критических ошибок
- HTTP ответы от frontend и backend

## Тестирование скриптов

### 9. Тест deployment скрипта

```bash
# Проверка скрипта развертывания
chmod +x scripts/deploy.sh

# Тест проверки зависимостей
./scripts/deploy.sh help

# Тест сборки образов
./scripts/deploy.sh build

# Тест запуска (development)
./scripts/deploy.sh start dev

# Проверка статуса
./scripts/deploy.sh status

# Остановка
./scripts/deploy.sh stop
```

**Ожидаемый результат:**

- Скрипт выполняется без ошибок
- Все команды работают корректно
- Сервисы запускаются и останавливаются

## Тестирование специфичных для Podman функций

### 10. Тест rootless режима

```bash
# Проверка rootless режима
podman info --format "{{.Host.Security.Rootless}}"

# Проверка пользователя в контейнере
podman run --rm alpine id

# Проверка маппинга пользователей
podman run --rm -v $(pwd):/test:Z alpine ls -la /test
```

**Ожидаемый результат:**

- Rootless режим активен (true)
- Контейнер запускается от непривилегированного пользователя
- Корректное маппинг файлов с SELinux метками

### 11. Тест SELinux меток

```bash
# Проверка SELinux меток на volumes
podman run --rm -v $(pwd)/server/uploads:/uploads:Z alpine ls -laZ /uploads

# Тест записи в volume
podman run --rm -v $(pwd)/test-volume:/test:Z alpine touch /test/test-file
ls -la test-volume/
rm -rf test-volume/
```

**Ожидаемый результат:**

- Корректные SELinux метки на файлах
- Успешная запись в volume

## Тестирование миграции данных

### 12. Тест совместимости данных

```bash
# Запуск с существующими данными
podman-compose -f podman-compose.yml up -d postgres

# Проверка существующих данных
podman-compose -f podman-compose.yml exec postgres psql -U nikdimer -d zcord -c "\dt"

# Проверка данных пользователей (если есть)
podman-compose -f podman-compose.yml exec postgres psql -U nikdimer -d zcord -c "SELECT COUNT(*) FROM users;"

# Остановка
podman-compose -f podman-compose.yml down
```

**Ожидаемый результат:**

- База данных запускается с существующими данными
- Таблицы доступны
- Данные сохранены

## Тестирование производительности

### 13. Базовый тест производительности

```bash
# Запуск полного стека
podman-compose -f podman-compose.yml up -d

# Ожидание готовности
sleep 30

# Тест производительности API
time curl -s http://localhost:8000/api/register > /dev/null

# Тест производительности frontend
time curl -s http://localhost:3000 > /dev/null

# Проверка использования ресурсов
podman stats --no-stream

# Остановка
podman-compose -f podman-compose.yml down
```

**Ожидаемый результат:**

- Быстрые ответы от API и frontend
- Разумное использование ресурсов

## Автоматический тест-скрипт

### 14. Полный автоматический тест

```bash
#!/bin/bash
# test-podman-migration.sh

set -e

echo "🧪 Начало тестирования миграции на Podman..."

# Проверка зависимостей
echo "1️⃣ Проверка зависимостей..."
podman --version || exit 1
podman-compose --version || exit 1

# Проверка файлов
echo "2️⃣ Проверка файлов проекта..."
test -f podman-compose.yml || exit 1
test -f podman-compose.dev.yml || exit 1
test -f Containerfile || exit 1
test -f server/Containerfile || exit 1

# Тест сборки
echo "3️⃣ Тестирование сборки образов..."
podman build -f Containerfile -t zcord-frontend:test . || exit 1
podman build -f server/Containerfile -t zcord-backend:test server/ || exit 1

# Тест запуска
echo "4️⃣ Тестирование запуска сервисов..."
podman-compose -f podman-compose.dev.yml up -d || exit 1
sleep 30

# Проверка доступности
echo "5️⃣ Проверка доступности сервисов..."
curl -f http://localhost:3000 > /dev/null || exit 1
curl -f http://localhost:8000/api/register > /dev/null 2>&1 || echo "API недоступен (ожидаемо без данных)"

# Очистка
echo "6️⃣ Очистка..."
podman-compose -f podman-compose.dev.yml down || exit 1
podman system prune -f || exit 1

echo "✅ Все тесты пройдены успешно!"
echo "🎉 Миграция на Podman завершена!"
```

Сохраните этот скрипт как `test-podman-migration.sh` и запустите:

```bash
chmod +x test-podman-migration.sh
./test-podman-migration.sh
```

## Устранение неполадок

### Частые проблемы и решения

1. **Podman machine не запускается (macOS)**

   ```bash
   podman machine stop
   podman machine rm
   podman machine init --cpus 4 --memory 8192
   podman machine start
   ```

2. **Ошибки SELinux**

   ```bash
   # Добавьте :Z к volume mounts
   volumes:
     - ./data:/app/data:Z
   ```

3. **Проблемы с правами доступа**

   ```bash
   # Используйте userns_mode: keep-id
   userns_mode: keep-id
   ```

4. **Медленная работа**
   ```bash
   # Увеличьте ресурсы машины
   podman machine stop
   podman machine rm
   podman machine init --cpus 4 --memory 8192 --disk-size 100
   podman machine start
   ```

## Заключение

После успешного прохождения всех тестов ваше приложение полностью мигрировано на Podman и готово к использованию с улучшенной безопасностью и производительностью.
