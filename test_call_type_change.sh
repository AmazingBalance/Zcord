#!/bin/bash

# Скрипт для тестирования исправления проблемы с изменением типа звонка
# Этот скрипт проверяет, что тип звонка не меняется при выходе участников

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Тест исправления проблемы с изменением типа звонка ===${NC}"

# Проверяем, запущен ли сервер
if ! curl -s http://localhost:8000/api/validate-token > /dev/null; then
    echo -e "${RED}Ошибка: Сервер не запущен. Запустите сервер перед выполнением теста.${NC}"
    exit 1
fi

# Функция для выполнения SQL-запроса
execute_sql() {
    psql -U postgres -d zcord -c "$1"
}

# Функция для получения типа звонка по ID чата
get_call_type() {
    local chat_id=$1
    execute_sql "SELECT call_type, chat_type FROM calls WHERE chat_id = '$chat_id' AND is_active = TRUE;" | grep -v "call_type\|---\|rows\)"
}

# Функция для получения количества активных участников звонка по ID чата
get_active_participants() {
    local chat_id=$1
    execute_sql "SELECT COUNT(*) FROM call_participants cp JOIN calls c ON cp.call_id = c.id WHERE c.chat_id = '$chat_id' AND c.is_active = TRUE AND cp.is_active = TRUE;" | grep -v "count\|---\|rows\)"
}

# Функция для получения логов звонка по ID чата
get_call_logs() {
    local chat_id=$1
    execute_sql "SELECT cl.log_time, cl.action, cl.user_id, cl.remaining_participants, cl.call_type, cl.chat_type FROM call_logs cl JOIN calls c ON cl.call_id = c.id WHERE c.chat_id = '$chat_id' ORDER BY cl.log_time ASC;"
}

# Создаем тестовый чат, если он не существует
echo -e "${YELLOW}Создаем тестовый чат...${NC}"
chat_id="test_call_type_$(date +%s)"
execute_sql "INSERT INTO chats (id, name, type, created_at) VALUES ('$chat_id', 'Test Chat', 'chat', NOW()) ON CONFLICT DO NOTHING;"

# Добавляем тестовых пользователей в чат
echo -e "${YELLOW}Добавляем тестовых пользователей в чат...${NC}"
for i in {1..3}; do
    user_id="test_user_$i"
    execute_sql "INSERT INTO users (id, name, tag, created_at) VALUES ('$user_id', 'Test User $i', 'test$i', NOW()) ON CONFLICT DO NOTHING;"
    execute_sql "INSERT INTO chat_participants (chat_id, user_id, joined_at) VALUES ('$chat_id', '$user_id', NOW()) ON CONFLICT DO NOTHING;"
done

# Создаем тестовый звонок
echo -e "${YELLOW}Создаем тестовый групповой звонок...${NC}"
execute_sql "SELECT * FROM join_call('$chat_id', 'test_user_1', 'video', 'chat');"

# Проверяем тип звонка после создания
echo -e "${YELLOW}Проверяем тип звонка после создания...${NC}"
initial_call_type=$(get_call_type "$chat_id")
echo "Тип звонка после создания: $initial_call_type"

# Добавляем второго пользователя в звонок
echo -e "${YELLOW}Добавляем второго пользователя в звонок...${NC}"
execute_sql "SELECT * FROM join_call('$chat_id', 'test_user_2', 'video', 'chat');"

# Проверяем тип звонка после добавления второго пользователя
echo -e "${YELLOW}Проверяем тип звонка после добавления второго пользователя...${NC}"
call_type_after_join=$(get_call_type "$chat_id")
echo "Тип звонка после добавления второго пользователя: $call_type_after_join"

# Добавляем третьего пользователя в звонок
echo -e "${YELLOW}Добавляем третьего пользователя в звонок...${NC}"
execute_sql "SELECT * FROM join_call('$chat_id', 'test_user_3', 'video', 'chat');"

# Проверяем тип звонка после добавления третьего пользователя
echo -e "${YELLOW}Проверяем тип звонка после добавления третьего пользователя...${NC}"
call_type_after_join2=$(get_call_type "$chat_id")
echo "Тип звонка после добавления третьего пользователя: $call_type_after_join2"

# Проверяем количество активных участников
echo -e "${YELLOW}Проверяем количество активных участников...${NC}"
active_participants=$(get_active_participants "$chat_id")
echo "Количество активных участников: $active_participants"

# Третий пользователь покидает звонок
echo -e "${YELLOW}Третий пользователь покидает звонок...${NC}"
execute_sql "SELECT * FROM leave_call('$chat_id', 'test_user_3');"

# Проверяем тип звонка после выхода третьего пользователя
echo -e "${YELLOW}Проверяем тип звонка после выхода третьего пользователя...${NC}"
call_type_after_leave=$(get_call_type "$chat_id")
echo "Тип звонка после выхода третьего пользователя: $call_type_after_leave"

# Проверяем количество активных участников
echo -e "${YELLOW}Проверяем количество активных участников...${NC}"
active_participants=$(get_active_participants "$chat_id")
echo "Количество активных участников: $active_participants"

# Второй пользователь покидает звонок
echo -e "${YELLOW}Второй пользователь покидает звонок...${NC}"
execute_sql "SELECT * FROM leave_call('$chat_id', 'test_user_2');"

# Проверяем тип звонка после выхода второго пользователя
echo -e "${YELLOW}Проверяем тип звонка после выхода второго пользователя...${NC}"
call_type_after_leave2=$(get_call_type "$chat_id")
echo "Тип звонка после выхода второго пользователя: $call_type_after_leave2"

# Проверяем количество активных участников
echo -e "${YELLOW}Проверяем количество активных участников...${NC}"
active_participants=$(get_active_participants "$chat_id")
echo "Количество активных участников: $active_participants"

# Первый пользователь покидает звонок
echo -e "${YELLOW}Первый пользователь покидает звонок...${NC}"
execute_sql "SELECT * FROM leave_call('$chat_id', 'test_user_1');"

# Проверяем логи звонка
echo -e "${YELLOW}Проверяем логи звонка...${NC}"
get_call_logs "$chat_id"

# Проверяем результаты теста
echo -e "${YELLOW}Проверяем результаты теста...${NC}"
if [[ "$initial_call_type" == "$call_type_after_leave" && "$initial_call_type" == "$call_type_after_leave2" ]]; then
    echo -e "${GREEN}Тест пройден! Тип звонка не изменился при выходе участников.${NC}"
else
    echo -e "${RED}Тест не пройден! Тип звонка изменился при выходе участников.${NC}"
    echo "Исходный тип звонка: $initial_call_type"
    echo "Тип звонка после выхода третьего пользователя: $call_type_after_leave"
    echo "Тип звонка после выхода второго пользователя: $call_type_after_leave2"
fi

echo -e "${YELLOW}=== Тест завершен ===${NC}"