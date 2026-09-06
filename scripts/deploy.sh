#!/bin/bash

# Zcord Deployment Script
# Автоматическое развёртывание проекта Zcord

set -e  # Остановка при ошибке

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функции для вывода
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Проверка зависимостей
check_dependencies() {
    print_info "Проверка зависимостей..."
    
    if ! command -v podman &> /dev/null; then
        print_error "Podman не установлен. Установите Podman и повторите попытку."
        exit 1
    fi
    
    if ! command -v podman-compose &> /dev/null; then
        print_error "Podman Compose не установлен. Установите Podman Compose и повторите попытку."
        exit 1
    fi
    
    print_success "Все зависимости установлены"
}

# Проверка .env файла
check_env_file() {
    print_info "Проверка файла окружения..."
    
    if [ ! -f "server/.env" ]; then
        print_warning "Файл server/.env не найден. Создание из примера..."
        cp server/.env.example server/.env
        print_warning "ВАЖНО: Отредактируйте server/.env с вашими настройками!"
        print_warning "Особенно измените JWT_SECRET для production!"
    fi
    
    print_success "Файл окружения готов"
}

# Создание необходимых директорий
create_directories() {
    print_info "Создание необходимых директорий..."
    
    mkdir -p server/uploads
    mkdir -p logs
    mkdir -p backups
    
    # Установка правильных прав
    chmod 755 server/uploads
    
    print_success "Директории созданы"
}

# Сборка образов
build_images() {
    print_info "Сборка Podman образов..."
    
    if [ "$1" = "--no-cache" ]; then
        podman-compose -f podman-compose.yml build --no-cache
    else
        podman-compose -f podman-compose.yml build
    fi
    
    print_success "Образы собраны"
}

# Запуск сервисов
start_services() {
    print_info "Запуск сервисов..."
    
    # Определение режима
    if [ "$1" = "dev" ]; then
        print_info "Запуск в режиме разработки..."
        podman-compose -f podman-compose.dev.yml up -d
    else
        print_info "Запуск в production режиме..."
        podman-compose -f podman-compose.yml up -d
    fi
    
    print_success "Сервисы запущены"
}

# Проверка здоровья сервисов
health_check() {
    print_info "Проверка здоровья сервисов..."
    
    # Ожидание запуска сервисов
    sleep 10
    
    # Проверка статуса контейнеров
    if ! podman-compose -f podman-compose.yml ps | grep -q "Up"; then
        print_error "Некоторые сервисы не запустились"
        podman-compose -f podman-compose.yml ps
        podman-compose -f podman-compose.yml logs
        exit 1
    fi
    
    # Проверка доступности frontend
    if curl -f -s http://localhost:3000 > /dev/null; then
        print_success "Frontend доступен на http://localhost:3000"
    else
        print_warning "Frontend недоступен на http://localhost:3000"
    fi
    
    # Проверка доступности backend
    if curl -f -s http://localhost:8000/api/register > /dev/null 2>&1 || [ $? -eq 22 ]; then
        print_success "Backend доступен на http://localhost:8000"
    else
        print_warning "Backend недоступен на http://localhost:8000"
    fi
    
    print_success "Проверка здоровья завершена"
}

# Показ логов
show_logs() {
    print_info "Показ логов сервисов..."
    podman-compose -f podman-compose.yml logs -f
}

# Остановка сервисов
stop_services() {
    print_info "Остановка сервисов..."
    podman-compose -f podman-compose.yml down
    print_success "Сервисы остановлены"
}

# Полная очистка
cleanup() {
    print_info "Полная очистка..."
    podman-compose -f podman-compose.yml down -v
    podman system prune -f
    print_success "Очистка завершена"
}

# Создание бэкапа
backup() {
    print_info "Создание бэкапа..."
    
    BACKUP_DIR="backups"
    DATE=$(date +%Y%m%d_%H%M%S)
    
    # Бэкап базы данных
    podman-compose -f podman-compose.yml exec -T postgres pg_dump -U zcord zcord > "$BACKUP_DIR/zcord_backup_$DATE.sql"
    
    # Бэкап загруженных файлов
    tar -czf "$BACKUP_DIR/uploads_backup_$DATE.tar.gz" server/uploads/
    
    print_success "Бэкап создан: $BACKUP_DIR/zcord_backup_$DATE.sql"
    print_success "Файлы: $BACKUP_DIR/uploads_backup_$DATE.tar.gz"
}

# Восстановление из бэкапа
restore() {
    if [ -z "$1" ]; then
        print_error "Укажите файл бэкапа: ./deploy.sh restore backup_file.sql"
        exit 1
    fi
    
    print_info "Восстановление из бэкапа: $1"
    
    if [ ! -f "$1" ]; then
        print_error "Файл бэкапа не найден: $1"
        exit 1
    fi
    
    # Восстановление базы данных
    podman-compose -f podman-compose.yml exec -T postgres psql -U zcord zcord < "$1"
    
    print_success "Восстановление завершено"
}

# Обновление проекта
update() {
    print_info "Обновление проекта..."
    
    # Остановка сервисов
    podman-compose -f podman-compose.yml down
    
    # Обновление кода (если используется git)
    if [ -d ".git" ]; then
        print_info "Обновление из git..."
        git pull
    fi
    
    # Пересборка образов
    build_images --no-cache
    
    # Запуск сервисов
    start_services
    
    print_success "Обновление завершено"
}

# Показ статуса
status() {
    print_info "Статус сервисов:"
    podman-compose -f podman-compose.yml ps
    
    print_info "Использование ресурсов:"
    podman stats --no-stream
    
    print_info "Логи (последние 10 строк):"
    podman-compose -f podman-compose.yml logs --tail=10
}

# Помощь
show_help() {
    echo "Zcord Deployment Script"
    echo ""
    echo "Использование: $0 [КОМАНДА] [ОПЦИИ]"
    echo ""
    echo "Команды:"
    echo "  start [dev]     Запуск сервисов (dev для режима разработки)"
    echo "  stop            Остановка сервисов"
    echo "  restart [dev]   Перезапуск сервисов"
    echo "  build           Сборка образов"
    echo "  logs            Показ логов"
    echo "  status          Показ статуса сервисов"
    echo "  health          Проверка здоровья сервисов"
    echo "  backup          Создание бэкапа"
    echo "  restore <file>  Восстановление из бэкапа"
    echo "  update          Обновление проекта"
    echo "  cleanup         Полная очистка"
    echo "  help            Показ этой справки"
    echo ""
    echo "Примеры:"
    echo "  $0 start        # Запуск в production режиме"
    echo "  $0 start dev    # Запуск в режиме разработки"
    echo "  $0 backup       # Создание бэкапа"
    echo "  $0 logs         # Просмотр логов"
}

# Основная логика
main() {
    case "$1" in
        "start")
            check_dependencies
            check_env_file
            create_directories
            build_images
            start_services "$2"
            health_check
            ;;
        "stop")
            stop_services
            ;;
        "restart")
            stop_services
            start_services "$2"
            health_check
            ;;
        "build")
            check_dependencies
            build_images "$2"
            ;;
        "logs")
            show_logs
            ;;
        "status")
            status
            ;;
        "health")
            health_check
            ;;
        "backup")
            backup
            ;;
        "restore")
            restore "$2"
            ;;
        "update")
            update
            ;;
        "cleanup")
            cleanup
            ;;
        "help"|"--help"|"-h")
            show_help
            ;;
        "")
            print_info "Запуск полного развёртывания..."
            check_dependencies
            check_env_file
            create_directories
            build_images
            start_services
            health_check
            print_success "Развёртывание завершено!"
            print_info "Frontend: http://localhost:3000"
            print_info "Backend: http://localhost:8000"
            print_info "Используйте '$0 logs' для просмотра логов"
            ;;
        *)
            print_error "Неизвестная команда: $1"
            show_help
            exit 1
            ;;
    esac
}

# Запуск основной функции
main "$@"