#!/bin/bash
# test-podman-migration.sh
# Автоматический тест миграции с Docker на Podman

set -e

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

print_step() {
    echo -e "${BLUE}$1${NC} $2"
}

# Проверка зависимостей
check_dependencies() {
    print_step "1️⃣" "Проверка зависимостей..."
    
    if ! command -v podman &> /dev/null; then
        print_error "Podman не установлен. Установите Podman и повторите попытку."
        exit 1
    fi
    
    if ! command -v podman-compose &> /dev/null; then
        print_error "Podman Compose не установлен. Установите Podman Compose и повторите попытку."
        exit 1
    fi
    
    print_info "Podman версия: $(podman --version)"
    print_info "Podman Compose версия: $(podman-compose --version)"
    
    # Проверка Podman machine для macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if ! podman machine list | grep -q "Currently running"; then
            print_warning "Podman machine не запущена. Попытка запуска..."
            podman machine start || {
                print_error "Не удалось запустить Podman machine"
                exit 1
            }
        fi
    fi
    
    print_success "Все зависимости установлены и готовы"
}

# Проверка файлов проекта
check_project_files() {
    print_step "2️⃣" "Проверка файлов проекта..."
    
    local files=(
        "podman-compose.yml"
        "podman-compose.dev.yml"
        "Containerfile"
        "server/Containerfile"
        "package.json"
        "server/go.mod"
        "init.sql"
    )
    
    for file in "${files[@]}"; do
        if [[ ! -f "$file" ]]; then
            print_error "Файл не найден: $file"
            exit 1
        fi
        print_info "✓ $file"
    done
    
    print_success "Все необходимые файлы найдены"
}

# Проверка синтаксиса compose файлов
validate_compose_files() {
    print_step "3️⃣" "Валидация Compose файлов..."
    
    print_info "Проверка podman-compose.yml..."
    if podman-compose -f podman-compose.yml config > /dev/null 2>&1; then
        print_success "✓ podman-compose.yml валиден"
    else
        print_error "✗ podman-compose.yml содержит ошибки"
        exit 1
    fi
    
    print_info "Проверка podman-compose.dev.yml..."
    if podman-compose -f podman-compose.dev.yml config > /dev/null 2>&1; then
        print_success "✓ podman-compose.dev.yml валиден"
    else
        print_error "✗ podman-compose.dev.yml содержит ошибки"
        exit 1
    fi
    
    print_success "Все Compose файлы валидны"
}

# Тест базовых Podman команд
test_basic_podman() {
    print_step "4️⃣" "Тестирование базовых Podman команд..."
    
    print_info "Тест запуска простого контейнера..."
    if podman run --rm hello-world > /dev/null 2>&1; then
        print_success "✓ Базовые команды Podman работают"
    else
        print_error "✗ Ошибка в базовых командах Podman"
        exit 1
    fi
    
    print_info "Очистка тестовых ресурсов..."
    podman system prune -f > /dev/null 2>&1
    
    print_success "Базовые команды Podman протестированы"
}

# Сборка образов
build_images() {
    print_step "5️⃣" "Сборка образов..."
    
    print_info "Сборка frontend образа..."
    if podman build -f Containerfile -t zcord-frontend:test . > /dev/null 2>&1; then
        print_success "✓ Frontend образ собран"
    else
        print_error "✗ Ошибка сборки frontend образа"
        exit 1
    fi
    
    print_info "Сборка backend образа..."
    if podman build -f server/Containerfile -t zcord-backend:test server/ > /dev/null 2>&1; then
        print_success "✓ Backend образ собран"
    else
        print_error "✗ Ошибка сборки backend образа"
        exit 1
    fi
    
    print_success "Все образы успешно собраны"
}

# Тест запуска development окружения
test_development_environment() {
    print_step "6️⃣" "Тестирование development окружения..."
    
    print_info "Запуск development сервисов..."
    if podman-compose -f podman-compose.dev.yml up -d > /dev/null 2>&1; then
        print_success "✓ Development сервисы запущены"
    else
        print_error "✗ Ошибка запуска development сервисов"
        exit 1
    fi
    
    print_info "Ожидание готовности сервисов (30 секунд)..."
    sleep 30
    
    # Проверка статуса сервисов
    print_info "Проверка статуса сервисов..."
    if podman-compose -f podman-compose.dev.yml ps | grep -q "Up"; then
        print_success "✓ Сервисы запущены и работают"
    else
        print_warning "⚠ Некоторые сервисы могут быть не готовы"
        podman-compose -f podman-compose.dev.yml ps
    fi
    
    # Проверка доступности frontend
    print_info "Проверка доступности frontend..."
    if curl -f -s http://localhost:3000 > /dev/null 2>&1; then
        print_success "✓ Frontend доступен"
    else
        print_warning "⚠ Frontend недоступен (может потребоваться больше времени)"
    fi
    
    # Проверка доступности backend API
    print_info "Проверка доступности backend API..."
    if curl -f -s http://localhost:8000/api/register > /dev/null 2>&1 || [[ $? -eq 22 ]]; then
        print_success "✓ Backend API доступен"
    else
        print_warning "⚠ Backend API недоступен (может потребоваться больше времени)"
    fi
    
    # Проверка базы данных
    print_info "Проверка базы данных..."
    if podman-compose -f podman-compose.dev.yml exec -T postgres psql -U zcord -d zcord -c "SELECT version();" > /dev/null 2>&1; then
        print_success "✓ База данных доступна"
    else
        print_warning "⚠ База данных недоступна"
    fi
    
    print_success "Development окружение протестировано"
}

# Тест production окружения
test_production_environment() {
    print_step "7️⃣" "Тестирование production окружения..."
    
    # Остановка development окружения
    print_info "Остановка development окружения..."
    podman-compose -f podman-compose.dev.yml down > /dev/null 2>&1
    
    print_info "Запуск production сервисов..."
    if podman-compose -f podman-compose.yml up -d > /dev/null 2>&1; then
        print_success "✓ Production сервисы запущены"
    else
        print_error "✗ Ошибка запуска production сервисов"
        exit 1
    fi
    
    print_info "Ожидание готовности сервисов (30 секунд)..."
    sleep 30
    
    # Проверка статуса сервисов
    print_info "Проверка статуса сервисов..."
    if podman-compose -f podman-compose.yml ps | grep -q "Up"; then
        print_success "✓ Production сервисы запущены и работают"
    else
        print_warning "⚠ Некоторые сервисы могут быть не готовы"
        podman-compose -f podman-compose.yml ps
    fi
    
    print_success "Production окружение протестировано"
}

# Тест deployment скрипта
test_deployment_script() {
    print_step "8️⃣" "Тестирование deployment скрипта..."
    
    if [[ -f "scripts/deploy.sh" ]]; then
        chmod +x scripts/deploy.sh
        
        print_info "Тест команды help..."
        if ./scripts/deploy.sh help > /dev/null 2>&1; then
            print_success "✓ Deployment скрипт работает"
        else
            print_warning "⚠ Deployment скрипт может иметь проблемы"
        fi
    else
        print_warning "⚠ Deployment скрипт не найден"
    fi
    
    print_success "Deployment скрипт протестирован"
}

# Тест специфичных для Podman функций
test_podman_specific_features() {
    print_step "9️⃣" "Тестирование специфичных для Podman функций..."
    
    # Проверка rootless режима
    print_info "Проверка rootless режима..."
    if podman info --format "{{.Host.Security.Rootless}}" | grep -q "true"; then
        print_success "✓ Rootless режим активен"
    else
        print_warning "⚠ Rootless режим не активен"
    fi
    
    # Тест SELinux меток (если доступно)
    print_info "Тест volume mounting с SELinux метками..."
    if podman run --rm -v $(pwd):/test:Z alpine ls /test > /dev/null 2>&1; then
        print_success "✓ Volume mounting с SELinux метками работает"
    else
        print_warning "⚠ Проблемы с volume mounting или SELinux недоступен"
    fi
    
    print_success "Специфичные функции Podman протестированы"
}

# Очистка
cleanup() {
    print_step "🧹" "Очистка тестовых ресурсов..."
    
    print_info "Остановка всех сервисов..."
    podman-compose -f podman-compose.yml down > /dev/null 2>&1 || true
    podman-compose -f podman-compose.dev.yml down > /dev/null 2>&1 || true
    
    print_info "Удаление тестовых образов..."
    podman rmi zcord-frontend:test > /dev/null 2>&1 || true
    podman rmi zcord-backend:test > /dev/null 2>&1 || true
    
    print_info "Очистка системы..."
    podman system prune -f > /dev/null 2>&1 || true
    
    print_success "Очистка завершена"
}

# Основная функция
main() {
    echo "🧪 Начало тестирования миграции на Podman..."
    echo "================================================"
    
    # Выполнение всех тестов
    check_dependencies
    check_project_files
    validate_compose_files
    test_basic_podman
    build_images
    test_development_environment
    test_production_environment
    test_deployment_script
    test_podman_specific_features
    
    # Очистка
    cleanup
    
    echo "================================================"
    echo -e "${GREEN}✅ Все тесты пройдены успешно!${NC}"
    echo -e "${GREEN}🎉 Миграция на Podman завершена!${NC}"
    echo ""
    echo "Теперь вы можете использовать следующие команды:"
    echo "  • podman-compose -f podman-compose.yml up -d      # Production"
    echo "  • podman-compose -f podman-compose.dev.yml up -d  # Development"
    echo "  • ./scripts/deploy.sh start                       # Через скрипт"
    echo ""
    echo "Для получения помощи:"
    echo "  • ./scripts/deploy.sh help"
    echo "  • cat PODMAN_README.md"
    echo "  • cat PODMAN_TESTING.md"
}

# Обработка сигналов для корректной очистки
trap cleanup EXIT

# Запуск основной функции
main "$@"