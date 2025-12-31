#!/bin/bash

# Apply the database changes for call records
echo "Applying database changes for call records..."
psql -U postgres -d zcord -f create_calls_table.sql

# Restart the server to apply the changes
echo "Restarting the server..."
cd server
go build
./zcord

echo "Changes applied successfully!"