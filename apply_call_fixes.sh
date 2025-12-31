#!/bin/bash

# Script to apply all call-related fixes and rebuild the application

echo "Applying WebRTC call fixes..."

# 1. Apply database fixes
echo "Applying database fixes..."
echo "Using Podman to connect to PostgreSQL..."

# Set default values
pguser="nikdimer"
dbname="zcord"

echo "Creating call tables..."
podman exec zcord-postgres-temp psql -U $pguser -d $dbname -f /tmp/create_calls_table.sql

# First, copy the SQL files to the container
echo "Copying SQL files to the container..."
podman cp create_calls_table.sql zcord-postgres-temp:/tmp/
podman cp create_call_functions.sql zcord-postgres-temp:/tmp/
podman cp fix_get_active_call.sql zcord-postgres-temp:/tmp/
podman cp optimize_get_active_call.sql zcord-postgres-temp:/tmp/
podman cp clean_all_calls.sql zcord-postgres-temp:/tmp/

echo "Creating call tables..."
podman exec zcord-postgres-temp psql -U $pguser -d $dbname -f /tmp/create_calls_table.sql

echo "Creating call functions..."
podman exec zcord-postgres-temp psql -U $pguser -d $dbname -f /tmp/create_call_functions.sql

echo "Applying get_active_call fix..."
podman exec zcord-postgres-temp psql -U $pguser -d $dbname -f /tmp/fix_get_active_call.sql

echo "Optimizing get_active_call function..."
podman exec zcord-postgres-temp psql -U $pguser -d $dbname -f /tmp/optimize_get_active_call.sql

echo "Cleaning up all call records..."
podman exec zcord-postgres-temp psql -U $pguser -d $dbname -f /tmp/clean_all_calls.sql

echo "Do you want to clean up calls for a specific chat? (y/n)"
read clean_specific
if [ "$clean_specific" = "y" ]; then
    echo "Enter the chat ID to clean up:"
    read chat_id
    podman exec zcord-postgres-temp psql -U $pguser -d $dbname -c "SELECT cleanup_calls_for_chat('$chat_id');"
    echo "Calls for chat $chat_id have been cleaned up."
fi

# 2. Rebuild the server
echo "Rebuilding server..."
cd server
go build -o zcord-server
cd ..

# 3. Rebuild the client
echo "Rebuilding client..."
npm run dev &
DEV_PID=$!

echo "All fixes applied and application rebuilt."
echo "Please restart both the server and client applications."
echo ""
echo "To restart the server: cd server && ./zcord-server"
echo "The client is now running in the background (PID: $DEV_PID)"
echo "To stop the client: kill $DEV_PID"