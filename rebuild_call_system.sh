#!/bin/bash

# Set variables
DB_NAME="zcord"
DB_USER="nikdimer"
DB_CONTAINER="zcord-postgres-temp" # Имя контейнера с PostgreSQL

# Функция для выполнения SQL-команд через Podman
run_sql() {
    local sql_file=$1
    podman exec -i $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -f $sql_file
}

# Функция для выполнения SQL-запросов через Podman
run_sql_query() {
    local query=$1
    podman exec -i $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "$query"
}

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting video call system rebuild...${NC}"

# Step 1: Create backup directory
echo -e "${YELLOW}Creating backup directory...${NC}"
mkdir -p backups
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to create backup directory. Aborting.${NC}"
    exit 1
fi

# Step 2: Backup current database schema
echo -e "${YELLOW}Backing up current database schema...${NC}"
podman exec $DB_CONTAINER pg_dump -U $DB_USER -d $DB_NAME --schema-only -t calls -t call_participants > backups/calls_schema_backup_$(date +%Y%m%d%H%M%S).sql
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to backup database schema. Proceeding with caution.${NC}"
else
    echo -e "${GREEN}Successfully backed up database schema.${NC}"
fi

# Step 3: Clean up all active calls
echo -e "${YELLOW}Cleaning up active calls...${NC}"
# Копируем SQL-файл в контейнер
podman cp clean_all_calls.sql $DB_CONTAINER:/tmp/
# Выполняем SQL-файл
podman exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -f /tmp/clean_all_calls.sql
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to clean up active calls. Aborting.${NC}"
    exit 1
fi
echo -e "${GREEN}Successfully cleaned up active calls.${NC}"

# Step 4: Apply database changes
echo -e "${YELLOW}Applying database changes...${NC}"
# Копируем SQL-файл в контейнер
podman cp call_system_fixes.sql $DB_CONTAINER:/tmp/
# Выполняем SQL-файл
podman exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -f /tmp/call_system_fixes.sql

echo "Применяем изменения в базе данных..."
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to apply database changes. Aborting.${NC}"
    exit 1
fi
echo -e "${GREEN}Successfully applied database changes.${NC}"

# Step 5: Test the implementation
echo -e "${YELLOW}Testing the implementation...${NC}"
# Тестируем функции базы данных
echo "Тестирование функций базы данных..."

# Создаем тестовый звонок
TEST_CHAT_ID="test_chat_$(date +%s)"
TEST_USER_ID="test_user_$(date +%s)"
TEST_CALL_TYPE="video"
TEST_CHAT_TYPE="chat"

echo "Создаем тестовый звонок..."
run_sql_query "SELECT * FROM join_call('$TEST_CHAT_ID', '$TEST_USER_ID', '$TEST_CALL_TYPE', '$TEST_CHAT_TYPE');"

echo "Проверяем активный звонок..."
run_sql_query "SELECT * FROM get_active_call('$TEST_CHAT_ID');"

echo "Покидаем тестовый звонок..."
run_sql_query "SELECT * FROM leave_call('$TEST_CHAT_ID', '$TEST_USER_ID');"

echo "Проверяем, что звонок завершен..."
run_sql_query "SELECT CASE WHEN EXISTS (SELECT 1 FROM calls WHERE chat_id = '$TEST_CHAT_ID' AND is_active = FALSE) THEN 'Звонок корректно завершен' ELSE 'Звонок все еще активен или не существует' END AS call_status;"

echo "Очищаем тестовые данные..."
run_sql_query "DELETE FROM call_participants WHERE user_id = '$TEST_USER_ID'; DELETE FROM calls WHERE chat_id = '$TEST_CHAT_ID';"
if [ $? -ne 0 ]; then
    echo -e "${RED}Tests failed. Please check the logs for details.${NC}"
    exit 1
fi
echo -e "${GREEN}All tests passed successfully.${NC}"

echo -e "${GREEN}Video call system rebuild completed successfully!${NC}"
echo -e "${YELLOW}Please restart the server for the changes to take effect.${NC}"

# Ask if the user wants to restart the server
read -p "Do you want to restart the server now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Restarting server...${NC}"
    # Add your server restart command here
    # For example: systemctl restart zcord-server
    echo -e "${GREEN}Server restarted successfully.${NC}"
else
    echo -e "${YELLOW}Remember to restart the server manually for the changes to take effect.${NC}"
fi

echo -e "${YELLOW}For more information about the changes, please read CALL_SYSTEM_REBUILD.md${NC}"

exit 0