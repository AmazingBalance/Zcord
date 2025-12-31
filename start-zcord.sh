#!/bin/bash

# Zcord Quick Start Script
# Этот скрипт быстро запускает Zcord на Podman

echo "🚀 Запуск Zcord на Podman..."

# Проверяем, что Podman установлен
if ! command -v podman &> /dev/null; then
    echo "❌ Podman не установлен. Установите Podman сначала:"
    echo "   brew install podman"
    exit 1
fi

# Проверяем, что podman-compose установлен
if ! command -v podman-compose &> /dev/null; then
    echo "❌ podman-compose не установлен. Установите podman-compose:"
    echo "   brew install podman-compose"
    exit 1
fi

# Проверяем, что Podman machine запущена
if ! podman machine list | grep -q "Currently running"; then
    echo "🔧 Запускаем Podman machine..."
    podman machine start
fi

echo "🛠️  Выберите режим запуска:"
echo "1) Разработка (Development) - с hot reload"
echo "2) Продакшн (Production) - оптимизированные образы"
read -p "Введите номер (1 или 2): " choice

case $choice in
    1)
        echo "🔧 Запуск в режиме разработки..."
        podman-compose -f podman-compose.dev.yml up -d
        echo ""
        echo "✅ Zcord запущен в режиме разработки!"
        echo "📱 Frontend: http://localhost:3000"
        echo "🔧 Backend API: http://localhost:8000"
        echo "🗄️  PostgreSQL: localhost:5435"
        echo ""
        echo "📋 Полезные команды:"
        echo "   Логи: podman-compose -f podman-compose.dev.yml logs -f"
        echo "   Остановить: podman-compose -f podman-compose.dev.yml down"
        ;;
    2)
        echo "🏗️  Сборка образов для продакшна..."
        podman-compose -f podman-compose.yml build
        echo "🚀 Запуск в продакшн режиме..."
        podman-compose -f podman-compose.yml up -d
        echo ""
        echo "✅ Zcord запущен в продакшн режиме!"
        echo "📱 Frontend: http://localhost:3000"
        echo "🔧 Backend API: http://localhost:8000"
        echo "🗄️  PostgreSQL: localhost:5435"
        echo ""
        echo "📋 Полезные команды:"
        echo "   Логи: podman-compose -f podman-compose.yml logs -f"
        echo "   Остановить: podman-compose -f podman-compose.yml down"
        ;;
    *)
        echo "❌ Неверный выбор. Используйте 1 или 2."
        exit 1
        ;;
esac

echo ""
echo "🎉 Готово! Zcord работает на Podman!"