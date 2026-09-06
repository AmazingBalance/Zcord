# Установка Docker на macOS

## Способ 1: Docker Desktop (Рекомендуется)

### Скачивание и установка

1. Перейдите на официальный сайт Docker: https://www.docker.com/products/docker-desktop/
2. Нажмите "Download for Mac"
3. Выберите версию для вашего процессора:
   - **Apple Silicon (M1/M2/M3)**: Docker Desktop for Mac with Apple silicon
   - **Intel**: Docker Desktop for Mac with Intel chip

### Установка

1. Откройте скачанный файл `Docker.dmg`
2. Перетащите Docker в папку Applications
3. Запустите Docker из папки Applications
4. Следуйте инструкциям мастера установки
5. Docker Desktop запросит права администратора - введите пароль

### Проверка установки

Откройте терминал и выполните:

```bash
docker --version
docker compose version
```

## Способ 2: Homebrew (Альтернативный)

### Установка через Homebrew

```bash
# Установка Homebrew (если не установлен)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Установка Docker
brew install --cask docker

# Запуск Docker Desktop
open /Applications/Docker.app
```

## Способ 3: Colima + Docker CLI (Легковесный)

### Установка Colima

```bash
# Установка через Homebrew
brew install colima docker docker-compose

# Запуск Colima
colima start

# Проверка
docker --version
```

## Настройка после установки

### 1. Запуск Docker Desktop

- Найдите Docker в Launchpad или Applications
- Запустите приложение
- Дождитесь полной загрузки (иконка в строке меню станет активной)

### 2. Настройка ресурсов (опционально)

1. Откройте Docker Desktop
2. Перейдите в Settings (шестеренка)
3. Во вкладке "Resources" настройте:
   - **CPU**: 2-4 ядра (по умолчанию достаточно)
   - **Memory**: 4-8 GB (рекомендуется минимум 4GB)
   - **Disk**: 60GB+ (для образов и контейнеров)

### 3. Проверка работоспособности

```bash
# Проверка версии
docker --version
docker compose version

# Тестовый запуск
docker run hello-world
```

## Возможные проблемы и решения

### Проблема: "Docker daemon is not running"

**Решение**: Убедитесь, что Docker Desktop запущен и полностью загружен

### Проблема: Права доступа

**Решение**:

```bash
sudo chown -R $(whoami) ~/.docker
```

### Проблема: Медленная работа

**Решение**:

1. Увеличьте выделенную память в настройках Docker Desktop
2. Включите "Use Rosetta for x86/amd64 emulation" (для Apple Silicon)

### Проблема: Порты заняты

**Решение**: Проверьте, что порты 3000, 8000, 5435 свободны:

```bash
lsof -i :3000
lsof -i :8000
lsof -i :5435
```

## Следующие шаги

После успешной установки Docker вы сможете запустить проект Zcord:

```bash
# Переход в директорию проекта
cd ~/Documents/Zcord

# Запуск в production режиме
docker compose up --build

# Или в development режиме
docker compose -f docker-compose.dev.yml up --build
```

## Полезные команды Docker

```bash
# Просмотр запущенных контейнеров
docker ps

# Просмотр всех контейнеров
docker ps -a

# Остановка всех контейнеров
docker compose down

# Просмотр логов
docker compose logs -f

# Очистка неиспользуемых ресурсов
docker system prune -a
```
