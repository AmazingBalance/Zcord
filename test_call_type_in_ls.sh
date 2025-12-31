#!/bin/bash

# Скрипт для тестирования исправления проблемы с типом звонка в личных чатах
# Этот скрипт проверяет, что тип звонка в личных чатах определяется правильно

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Тест исправления проблемы с типом звонка в личных чатах ===${NC}"

# Проверяем, запущен ли сервер
if ! curl -s http://localhost:8000/api/validate-token > /dev/null; then
    echo -e "${RED}Ошибка: Сервер не запущен. Запустите сервер перед выполнением теста.${NC}"
    exit 1
fi

# Функция для выполнения SQL-запроса
execute_sql() {
    psql -U postgres -d zcord -c "$1"
}

# Функция для получения типа чата по ID
get_chat_type() {
    local chat_id=$1
    execute_sql "SELECT type FROM chats WHERE id = '$chat_id';" | grep -v "type\|---\|rows\)"
}

# Функция для получения типа звонка по ID чата
get_call_type() {
    local chat_id=$1
    execute_sql "SELECT * FROM get_active_call('$chat_id');" | grep -v "id\|---\|rows\)"
}

# Функция для получения логов звонка по ID чата
get_call_logs() {
    local chat_id=$1
    execute_sql "SELECT cl.log_time, cl.action, cl.user_id, cl.remaining_participants, cl.call_type, cl.chat_type FROM call_logs cl JOIN calls c ON cl.call_id = c.id WHERE c.chat_id = '$chat_id' ORDER BY cl.log_time ASC;"
}

# Создаем тестовый личный чат, если он не существует
echo -e "${YELLOW}Создаем тестовый личный чат...${NC}"
ls_chat_id="test_ls_chat_$(date +%s)"
execute_sql "INSERT INTO chats (id, name, type, created_at) VALUES ('$ls_chat_id', 'Test LS Chat', 'ls', NOW()) ON CONFLICT DO NOTHING;"

# Добавляем тестовых пользователей в личный чат
echo -e "${YELLOW}Добавляем тестовых пользователей в личный чат...${NC}"
for i in {1..2}; do
    user_id="test_user_$i"
    execute_sql "INSERT INTO users (id, name, tag, created_at) VALUES ('$user_id', 'Test User $i', 'test$i', NOW()) ON CONFLICT DO NOTHING;"
    execute_sql "INSERT INTO chat_participants (chat_id, user_id, joined_at) VALUES ('$ls_chat_id', '$user_id', NOW()) ON CONFLICT DO NOTHING;"
done

# Проверяем тип чата
echo -e "${YELLOW}Проверяем тип чата...${NC}"
chat_type=$(get_chat_type "$ls_chat_id")
echo "Тип чата: $chat_type"

# Создаем тестовый звонок в личном чате
echo -e "${YELLOW}Создаем тестовый звонок в личном чате...${NC}"
execute_sql "SELECT * FROM join_call('$ls_chat_id', 'test_user_1', 'video', 'ls');"

# Проверяем тип звонка после создания
echo -e "${YELLOW}Проверяем тип звонка после создания...${NC}"
call_info=$(get_call_type "$ls_chat_id")
echo "Информация о звонке: $call_info"

# Добавляем второго пользователя в звонок
echo -e "${YELLOW}Добавляем второго пользователя в звонок...${NC}"
execute_sql "SELECT * FROM join_call('$ls_chat_id', 'test_user_2', 'video', 'ls');"

# Проверяем тип звонка после добавления второго пользователя
echo -e "${YELLOW}Проверяем тип звонка после добавления второго пользователя...${NC}"
call_info=$(get_call_type "$ls_chat_id")
echo "Информация о звонке: $call_info"

# Проверяем логи звонка
echo -e "${YELLOW}Проверяем логи звонка...${NC}"
get_call_logs "$ls_chat_id"

# Создаем тестовый групповой чат, если он не существует
echo -e "${YELLOW}Создаем тестовый групповой чат...${NC}"
group_chat_id="test_group_chat_$(date +%s)"
execute_sql "INSERT INTO chats (id, name, type, created_at) VALUES ('$group_chat_id', 'Test Group Chat', 'chat', NOW()) ON CONFLICT DO NOTHING;"

# Добавляем тестовых пользователей в групповой чат
echo -e "${YELLOW}Добавляем тестовых пользователей в групповой чат...${NC}"
for i in {1..3}; do
    user_id="test_user_$i"
    execute_sql "INSERT INTO chat_participants (chat_id, user_id, joined_at) VALUES ('$group_chat_id', '$user_id', NOW()) ON CONFLICT DO NOTHING;"
done

# Проверяем тип чата
echo -e "${YELLOW}Проверяем тип группового чата...${NC}"
chat_type=$(get_chat_type "$group_chat_id")
echo "Тип чата: $chat_type"

# Создаем тестовый звонок в групповом чате
echo -e "${YELLOW}Создаем тестовый звонок в групповом чате...${NC}"
execute_sql "SELECT * FROM join_call('$group_chat_id', 'test_user_1', 'video', 'chat');"

# Проверяем тип звонка после создания
echo -e "${YELLOW}Проверяем тип звонка после создания...${NC}"
call_info=$(get_call_type "$group_chat_id")
echo "Информация о звонке: $call_info"

# Добавляем второго и третьего пользователей в звонок
echo -e "${YELLOW}Добавляем второго и третьего пользователей в звонок...${NC}"
execute_sql "SELECT * FROM join_call('$group_chat_id', 'test_user_2', 'video', 'chat');"
execute_sql "SELECT * FROM join_call('$group_chat_id', 'test_user_3', 'video', 'chat');"

# Проверяем тип звонка после добавления пользователей
echo -e "${YELLOW}Проверяем тип звонка после добавления пользователей...${NC}"
call_info=$(get_call_type "$group_chat_id")
echo "Информация о звонке: $call_info"

# Проверяем логи звонка
echo -e "${YELLOW}Проверяем логи звонка...${NC}"
get_call_logs "$group_chat_id"

echo -e "${YELLOW}=== Тест завершен ===${NC}"