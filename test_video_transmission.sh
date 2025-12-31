#!/bin/bash

# Скрипт для тестирования улучшенной передачи видео в системе звонков

echo "=== Тестирование улучшенной передачи видео ==="
echo "Этот скрипт поможет проверить, что исправления для улучшения передачи видео"
echo "между участниками звонка работают корректно."
echo ""

# Проверка наличия необходимых файлов
echo "Проверка наличия необходимых файлов..."
FILES_TO_CHECK=(
  "src/components/VideoCall/VideoCall.jsx"
  "src/services/webrtc.js"
  "VIDEO_TRANSMISSION_FIX.md"
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
check_string_in_file "src/services/webrtc.js" "if (typeof data === \"string\")" "Добавлена обработка строковых данных JSON"
check_string_in_file "src/services/webrtc.js" "const enhancedConfig" "Добавлена расширенная конфигурация ICE"
check_string_in_file "src/services/webrtc.js" "Stream tracks analysis" "Добавлен анализ треков потока"
check_string_in_file "src/services/webrtc.js" "const existingSender" "Добавлена проверка существующих отправителей"

# Проверка VideoCall.jsx
echo "Проверка VideoCall.jsx..."
check_string_in_file "src/components/VideoCall/VideoCall.jsx" "videoElement.onplaying" "Добавлен обработчик успешного воспроизведения"
check_string_in_file "src/components/VideoCall/VideoCall.jsx" "setTimeout(() => {" "Добавлены повторные попытки воспроизведения"
check_string_in_file "src/components/VideoCall/VideoCall.jsx" "if (videoElement.srcObject)" "Добавлена очистка существующих потоков"
check_string_in_file "src/components/VideoCall/VideoCall.jsx" "muted={false}" "Добавлен атрибут muted для видео"

if [ $FAILED -eq 0 ]; then
  echo ""
  echo "✅ Все необходимые изменения найдены!"
  echo ""
  echo "Инструкции по тестированию:"
  echo "1. Запустите приложение"
  echo "2. Откройте два браузера и войдите в один и тот же чат с разных аккаунтов"
  echo "3. В первом браузере начните звонок"
  echo "4. Во втором браузере присоединитесь к звонку"
  echo "5. Убедитесь, что видео передается между участниками"
  echo "6. Проверьте, что таймер звонка синхронизирован"
  echo "7. Проверьте, что звонок корректно завершается при нажатии на кнопку завершения"
  echo ""
  echo "Дополнительные тесты:"
  echo "- Попробуйте отключить и включить камеру во время звонка"
  echo "- Попробуйте отключить и включить микрофон во время звонка"
  echo "- Проверьте работу звонка при плохом интернет-соединении"
  echo ""
  echo "Если все тесты прошли успешно, значит исправления работают корректно!"
else
  echo ""
  echo "❌ Некоторые необходимые изменения не найдены!"
  echo "Пожалуйста, проверьте файлы и внесите необходимые изменения."
fi