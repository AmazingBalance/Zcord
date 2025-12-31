#!/bin/bash

# Скрипт для тестирования кросс-браузерной совместимости WebRTC

echo "=== Тестирование кросс-браузерной совместимости WebRTC ==="
echo "Этот скрипт поможет проверить, что исправления для улучшения"
echo "кросс-браузерной совместимости WebRTC работают корректно."
echo ""

# Проверка наличия необходимых файлов
echo "Проверка наличия необходимых файлов..."
FILES_TO_CHECK=(
  "src/components/VideoCall/VideoCall.jsx"
  "src/services/webrtc.js"
  "WEBRTC_CROSS_BROWSER_FIX.md"
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

# Проверка webrtc.js
echo "Проверка webrtc.js..."
check_string_in_file "src/services/webrtc.js" "import adapter from" "Добавлен импорт WebRTC адаптера"
check_string_in_file "src/services/webrtc.js" "turn:openrelay.metered.ca" "Добавлены TURN серверы"
check_string_in_file "src/services/webrtc.js" "preferH264" "Добавлен метод для предпочтения H.264 кодека"
check_string_in_file "src/services/webrtc.js" "checkBrowserSupport" "Добавлен метод для проверки поддержки WebRTC"

# Проверка VideoCall.jsx
echo "Проверка VideoCall.jsx..."
check_string_in_file "src/components/VideoCall/VideoCall.jsx" "const browser = browserSupport.details.browser" "Добавлено определение типа браузера"
check_string_in_file "src/components/VideoCall/VideoCall.jsx" "Специфичные настройки для Safari" "Добавлены специфичные настройки для Safari"
check_string_in_file "src/components/VideoCall/VideoCall.jsx" "webrtcLogger.persistLog(\"Using media constraints" "Добавлено логирование используемых ограничений медиа"

if [ $FAILED -eq 0 ]; then
  echo ""
  echo "✅ Все необходимые изменения найдены!"
  echo ""
  echo "Инструкции по тестированию кросс-браузерной совместимости:"
  echo ""
  echo "1. Тестирование между разными браузерами:"
  echo "   - Откройте приложение в Chrome и Firefox"
  echo "   - Откройте приложение в Chrome и Safari"
  echo "   - Откройте приложение в Firefox и Safari"
  echo "   - Откройте приложение в Яндекс Браузере и Safari"
  echo ""
  echo "2. Для каждой пары браузеров выполните следующие действия:"
  echo "   a. Войдите в один и тот же чат с разных аккаунтов"
  echo "   b. В первом браузере начните звонок"
  echo "   c. Во втором браузере присоединитесь к звонку"
  echo "   d. Убедитесь, что видео передается между браузерами"
  echo "   e. Убедитесь, что аудио передается между браузерами"
  echo "   f. Проверьте, что таймер звонка синхронизирован"
  echo "   g. Проверьте, что звонок корректно завершается при нажатии на кнопку завершения"
  echo ""
  echo "3. Дополнительные тесты:"
  echo "   - Попробуйте отключить и включить камеру во время звонка"
  echo "   - Попробуйте отключить и включить микрофон во время звонка"
  echo "   - Проверьте работу звонка при плохом интернет-соединении"
  echo "   - Проверьте работу звонка через мобильную сеть"
  echo ""
  echo "Если все тесты прошли успешно, значит исправления работают корректно!"
else
  echo ""
  echo "❌ Некоторые необходимые изменения не найдены!"
  echo "Пожалуйста, проверьте файлы и внесите необходимые изменения."
fi