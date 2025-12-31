#!/bin/bash

# Скрипт для применения исправления функции leave_call к базе данных

echo "=== Применение исправления функции leave_call ==="
echo "Этот скрипт применяет исправление для функции leave_call,"
echo "чтобы избежать ошибки 'converting NULL to int is unsupported'"
echo ""

# Проверка наличия необходимых файлов
if [ ! -f "fix_leave_call.sql" ]; then
  echo "ОШИБКА: Файл fix_leave_call.sql не найден!"
  exit 1
fi

# Применение исправления к базе данных
echo "Применение исправления к базе данных..."

# Устанавливаем настройки базы данных из podman-compose.yml
DB_HOST=localhost
DB_PORT=5435
DB_NAME=zcord
DB_USER=nikdimer
DB_PASSWORD=technocraft2000

# Применяем SQL-скрипт к базе данных через Podman
echo "Применение SQL-скрипта через Podman..."

# Проверяем, запущен ли контейнер с базой данных через podman
if podman ps | grep -q zcord-postgres; then
  # Получаем ID контейнера
  CONTAINER_ID=$(podman ps | grep zcord-postgres | awk '{print $1}')
  echo "Найден контейнер PostgreSQL: $CONTAINER_ID"
  
  # Копируем SQL-файл в контейнер
  podman cp fix_leave_call.sql $CONTAINER_ID:/tmp/fix_leave_call.sql
  
  # Выполняем SQL-скрипт внутри контейнера
  podman exec -i $CONTAINER_ID psql -U $DB_USER -d $DB_NAME -f /tmp/fix_leave_call.sql
  
  if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Исправление успешно применено к базе данных!"
    exit 0
  else
    echo ""
    echo "❌ Ошибка при выполнении SQL-скрипта внутри контейнера!"
    exit 1
  fi
else
  echo "Контейнер zcord-postgres не найден."
  echo "Пробуем подключиться к базе данных напрямую..."
  
  # Пробуем использовать psql напрямую
  if command -v psql &> /dev/null; then
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f fix_leave_call.sql
    
    if [ $? -eq 0 ]; then
      echo ""
      echo "✅ Исправление успешно применено к базе данных!"
      exit 0
    else
      echo ""
      echo "❌ Ошибка при выполнении SQL-скрипта!"
      exit 1
    fi
  else
    echo "Команда psql не найдена. Невозможно применить SQL-скрипт."
    exit 1
  fi
fi

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Исправление успешно применено к базе данных!"
  echo ""
  echo "Теперь функция leave_call будет корректно обрабатывать случай,"
  echo "когда звонок не найден, возвращая 0 вместо NULL."
else
  echo ""
  echo "❌ Ошибка при применении исправления к базе данных!"
  echo "Проверьте настройки подключения к базе данных и попробуйте снова."
fi