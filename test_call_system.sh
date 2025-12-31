#!/bin/bash

# Скрипт для тестирования системы звонков
# Проверяет исправления проблемы с автоматическим присоединением к звонкам

echo "=== Тестирование системы звонков ==="
echo "Этот скрипт поможет проверить, что исправления для предотвращения"
echo "автоматического присоединения к звонкам и циклов присоединения/выхода работают корректно."
echo ""

# Проверка наличия необходимых файлов
echo "Проверка наличия необходимых файлов..."
FILES_TO_CHECK=(
  "src/components/ChatZone/ChatZone.jsx"
  "src/components/VideoCall/VideoCall.jsx"
  "src/services/webrtc.js"
)

for file in "${FILES_TO_CHECK[@]}"; do
  if [ ! -f "$file" ]; then
    echo "ОШИБКА: Файл $file не найден!"
    exit 1
  fi
done
echo "Все необходимые файлы найдены."
echo ""

# Проверка наличия изменений в файлах
echo "Проверка наличия необходимых изменений в файлах..."

# Функция для проверки наличия строки в файле
check_string_in_file() {
  local file=$1
  local string=$2
  local description=$3
  
  if grep -q "$string" "$file"; then
    echo "✅ $description"
  else
    echo "❌ $description - НЕ НАЙДЕНО!"
    echo "   Ожидаемая строка: $string"
    echo "   в файле: $file"
    FAILED=1
  fi
}

FAILED=0

# Проверка ChatZone.jsx
echo "Проверка ChatZone.jsx..."
check_string_in_file "src/components/ChatZone/ChatZone.jsx" "lastCallEndTimeRef" "Добавлена переменная lastCallEndTimeRef"
check_string_in_file "src/components/ChatZone/ChatZone.jsx" "// Мы только проверяем наличие активного звонка, но НЕ присоединяемся к нему автоматически" "ОТКЛЮЧЕНО автоматическое присоединение к звонкам"
check_string_in_file "src/components/ChatZone/ChatZone.jsx" "NOT auto-joining call" "Добавлено логирование отключения автоприсоединения"
check_string_in_file "src/components/ChatZone/ChatZone.jsx" "if (recentlyEndedCall)" "Добавлена проверка в handleStartCall"

# Проверка VideoCall.jsx
echo "Проверка VideoCall.jsx..."
check_string_in_file "src/components/VideoCall/VideoCall.jsx" "callEndTimeRef" "Добавлена переменная callEndTimeRef"
check_string_in_file "src/components/VideoCall/VideoCall.jsx" "callEndTimeRef.current = Date.now()" "Добавлено обновление времени завершения звонка"
check_string_in_file "src/components/VideoCall/VideoCall.jsx" "const recentlyEndedCall = timeSinceLastCallEnd < 5000" "Добавлена проверка недавно завершенного звонка"

# Проверка webrtc.js
echo "Проверка webrtc.js..."
check_string_in_file "src/services/webrtc.js" "this.lastCallEndTime" "Добавлена переменная lastCallEndTime"
check_string_in_file "src/services/webrtc.js" "this.currentChatId" "Добавлена переменная currentChatId"
check_string_in_file "src/services/webrtc.js" "resetCallbacks" "Добавлен метод resetCallbacks"
check_string_in_file "src/services/webrtc.js" "const recentlyEndedCall = timeSinceLastCallEnd < 5000" "Добавлена проверка недавно завершенного звонка"

if [ $FAILED -eq 0 ]; then
  echo ""
  echo "✅ Все необходимые изменения найдены!"
  echo ""
  echo "Инструкции по тестированию:"
  echo "1. Запустите приложение"
  echo "2. Войдите в чат и убедитесь, что звонок НЕ начинается автоматически"
  echo "3. Нажмите на кнопку звонка, чтобы начать звонок"
  echo "4. Завершите звонок и сразу попробуйте начать новый"
  echo "5. Убедитесь, что новый звонок не начинается автоматически"
  echo "6. Подождите 5 секунд и попробуйте начать звонок снова"
  echo "7. Убедитесь, что теперь звонок начинается нормально"
  echo ""
  echo "ВАЖНО: Пользователь должен присоединяться к звонку ТОЛЬКО при явном нажатии на кнопку звонка!"
  echo ""
  echo "Если все тесты прошли успешно, значит исправления работают корректно!"
else
  echo ""
  echo "❌ Некоторые необходимые изменения не найдены!"
  echo "Пожалуйста, проверьте файлы и внесите необходимые изменения."
fi