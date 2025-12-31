# Установка Podman на macOS

## Способ 1: Homebrew (Рекомендуется)

### Установка Podman

```bash
# Установка Homebrew (если не установлен)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Установка Podman
brew install podman

# Установка podman-compose
brew install podman-compose
```

### Инициализация Podman машины

```bash
# Создание и запуск Podman машины
podman machine init
podman machine start

# Проверка статуса
podman machine list
```

### Проверка установки

```bash
podman --version
podman-compose --version
```

## Способ 2: Podman Desktop (GUI)

### Скачивание и установка

1. Перейдите на официальный сайт: https://podman-desktop.io/
2. Нажмите "Download for macOS"
3. Выберите версию для вашего процессора:
   - **Apple Silicon (M1/M2/M3)**: macOS Apple Silicon
   - **Intel**: macOS Intel

### Установка

1. Откройте скачанный файл `.dmg`
2. Перетащите Podman Desktop в папку Applications
3. Запустите Podman Desktop из папки Applications
4. Следуйте инструкциям мастера установки

## Способ 3: Установка из исходников

### Требования

```bash
# Установка зависимостей
brew install go git make
```

### Сборка и установка

```bash
# Клонирование репозитория
git clone https://github.com/containers/podman.git
cd podman

# Сборка
make BUILDTAGS="selinux seccomp"
sudo make install PREFIX=/usr/local
```

## Настройка после установки

### 1. Настройка Podman машины

```bash
# Создание машины с дополнительными ресурсами
podman machine init --cpus 4 --memory 8192 --disk-size 100

# Запуск машины
podman machine start

# Проверка информации о системе
podman info
```

### 2. Настройка rootless режима

```bash
# Проверка rootless режима
podman info --format "{{.Host.Security.Rootless}}"

# Настройка subuid и subgid (если нужно)
echo "$USER:100000:65536" | sudo tee -a /etc/subuid
echo "$USER:100000:65536" | sudo tee -a /etc/subgid
```

### 3. Настройка совместимости с Docker

```bash
# Создание алиаса для совместимости с Docker командами
echo 'alias docker=podman' >> ~/.zshrc
echo 'alias docker-compose=podman-compose' >> ~/.zshrc

# Перезагрузка shell
source ~/.zshrc
```

### 4. Настройка Docker Socket (опционально)

```bash
# Запуск Podman socket для совместимости с Docker API
podman system service --time=0 unix:///tmp/podman.sock &

# Установка переменной окружения
export DOCKER_HOST=unix:///tmp/podman.sock
```

## Проверка работоспособности

### Базовые тесты

```bash
# Проверка версии
podman --version
podman-compose --version

# Тестовый запуск контейнера
podman run hello-world

# Проверка образов
podman images

# Проверка запущенных контейнеров
podman ps
```

### Тест с compose

```bash
# Создание тестового compose файла
cat > test-compose.yml << EOF
services:
  test:
    image: nginx:alpine
    ports:
      - "8080:80"
EOF

# Запуск
podman-compose -f test-compose.yml up -d

# Проверка
curl http://localhost:8080

# Остановка
podman-compose -f test-compose.yml down
```

## Возможные проблемы и решения

### Проблема: "podman machine" не найдена

**Решение**: Обновите Podman до последней версии:

```bash
brew upgrade podman
```

### Проблема: Права доступа к файлам

**Решение**: Используйте правильные SELinux метки:

```bash
# В compose файлах используйте :Z для volumes
volumes:
  - ./data:/app/data:Z
```

### Проблема: Медленная работа

**Решение**: Увеличьте ресурсы машины:

```bash
podman machine stop
podman machine rm
podman machine init --cpus 4 --memory 8192 --disk-size 100
podman machine start
```

### Проблема: Порты заняты

**Решение**: Проверьте, что порты свободны:

```bash
lsof -i :3000
lsof -i :8000
lsof -i :5435
```

### Проблема: Сеть недоступна в контейнерах

**Решение**: Перезапустите Podman машину:

```bash
podman machine stop
podman machine start
```

## Миграция с Docker

### Остановка Docker

```bash
# Остановка Docker Desktop
# Через GUI или:
sudo launchctl unload /Library/LaunchDaemons/com.docker.vmnetd.plist
```

### Импорт Docker образов

```bash
# Сохранение Docker образов
docker save -o images.tar image1 image2

# Загрузка в Podman
podman load -i images.tar
```

### Миграция volumes

```bash
# Docker volumes обычно находятся в:
# ~/Library/Containers/com.docker.docker/Data/vms/0/data/docker/volumes/

# Скопируйте данные в новое расположение для Podman
```

## Следующие шаги

После успешной установки Podman вы сможете запустить проект Zcord:

```bash
# Переход в директорию проекта
cd /Users/nikdimer/Documents/Zcord-main

# Запуск в production режиме
podman-compose -f podman-compose.yml up --build

# Или в development режиме
podman-compose -f podman-compose.dev.yml up --build
```

## Полезные команды Podman

```bash
# Просмотр запущенных контейнеров
podman ps

# Просмотр всех контейнеров
podman ps -a

# Остановка всех контейнеров
podman-compose -f podman-compose.yml down

# Просмотр логов
podman-compose -f podman-compose.yml logs -f

# Очистка неиспользуемых ресурсов
podman system prune -a

# Информация о системе
podman info

# Управление машиной
podman machine list
podman machine stop
podman machine start
```

## Преимущества Podman над Docker

1. **Rootless по умолчанию** - лучшая безопасность
2. **Без демона** - не требует постоянно работающего сервиса
3. **Совместимость с Docker** - поддерживает Docker команды и API
4. **Лучшая интеграция с systemd** - на Linux системах
5. **Поддержка pods** - группировка контейнеров как в Kubernetes
6. **Открытый исходный код** - полностью свободное ПО
