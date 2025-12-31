#!/bin/bash

# Set variables
DB_NAME="zcord"
DB_USER="postgres"
DB_HOST="localhost"
DB_PORT="5432"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting call system fixes...${NC}"

# Step 1: Clean up all active calls
echo -e "${YELLOW}Cleaning up active calls...${NC}"
psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -f clean_all_calls.sql

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to clean up active calls. Aborting.${NC}"
    exit 1
fi

echo -e "${GREEN}Successfully cleaned up active calls.${NC}"

# Step 2: Create a backup of the current functions
echo -e "${YELLOW}Creating backup of current functions...${NC}"
mkdir -p backups
pg_dump -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME --schema-only -t calls -t call_participants > backups/calls_schema_backup_$(date +%Y%m%d%H%M%S).sql

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to create backup. Proceeding with caution.${NC}"
else
    echo -e "${GREEN}Successfully created backup.${NC}"
fi

# Step 3: Apply the new database schema and functions
echo -e "${YELLOW}Applying new database functions...${NC}"

# Create the SQL for the new functions
cat > call_system_fixes.sql << 'EOF'
-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS get_active_call(VARCHAR);
DROP FUNCTION IF EXISTS join_call(VARCHAR, VARCHAR, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS leave_call(VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS cleanup_stuck_calls();

-- Create optimized indexes
CREATE INDEX IF NOT EXISTS idx_calls_chat_id_is_active ON calls(chat_id, is_active);
CREATE INDEX IF NOT EXISTS idx_call_participants_call_id_is_active ON call_participants(call_id, is_active);

-- Get Active Call Function
CREATE OR REPLACE FUNCTION get_active_call(p_chat_id VARCHAR(255))
RETURNS TABLE (
    id INTEGER,
    chat_id VARCHAR(255),
    start_time TIMESTAMP,
    call_type VARCHAR(50),
    chat_type VARCHAR(50),
    participants JSON
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.chat_id,
        c.start_time,
        c.call_type,
        c.chat_type,
        COALESCE(
            (
                SELECT json_agg(json_build_object(
                    'id', cp.user_id,
                    'join_time', cp.join_time
                ))
                FROM call_participants cp
                WHERE cp.call_id = c.id AND cp.is_active = TRUE
            ),
            '[]'::json
        ) AS participants
    FROM calls c
    WHERE c.chat_id = p_chat_id AND c.is_active = TRUE
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Join Call Function
CREATE OR REPLACE FUNCTION join_call(
    p_chat_id VARCHAR(255),
    p_user_id VARCHAR(255),
    p_call_type VARCHAR(50),
    p_chat_type VARCHAR(50)
) RETURNS TABLE (
    call_id INTEGER,
    start_time TIMESTAMP,
    is_new_call BOOLEAN
) AS $$
DECLARE
    v_call_id INTEGER;
    v_start_time TIMESTAMP;
    v_is_new_call BOOLEAN := FALSE;
BEGIN
    -- Check if there's an active call in this chat
    SELECT c.id, c.start_time INTO v_call_id, v_start_time
    FROM calls c
    WHERE c.chat_id = p_chat_id AND c.is_active = TRUE
    LIMIT 1;
    
    -- If no active call, create a new one
    IF v_call_id IS NULL THEN
        INSERT INTO calls (chat_id, start_time, is_active, call_type, chat_type)
        VALUES (p_chat_id, NOW(), TRUE, p_call_type, p_chat_type)
        RETURNING calls.id, calls.start_time INTO v_call_id, v_start_time;
        
        v_is_new_call := TRUE;
    END IF;
    
    -- Add user to call participants or update if already exists
    BEGIN
        -- Try to insert a new record
        INSERT INTO call_participants (call_id, user_id, join_time, is_active)
        VALUES (v_call_id, p_user_id, NOW(), TRUE);
    EXCEPTION WHEN unique_violation THEN
        -- If it already exists, update it
        UPDATE call_participants
        SET join_time = NOW(), is_active = TRUE, leave_time = NULL
        WHERE call_participants.call_id = v_call_id AND call_participants.user_id = p_user_id;
    END;
    
    -- Return call information
    RETURN QUERY SELECT v_call_id, v_start_time, v_is_new_call;
END;
$$ LANGUAGE plpgsql;

-- Leave Call Function
CREATE OR REPLACE FUNCTION leave_call(
    p_chat_id VARCHAR(255),
    p_user_id VARCHAR(255)
) RETURNS TABLE (
    call_id INTEGER,
    remaining_participants INTEGER
) AS $$
DECLARE
    v_call_id INTEGER;
    v_remaining INTEGER;
BEGIN
    -- Get the active call ID for this chat
    SELECT c.id INTO v_call_id
    FROM calls c
    WHERE c.chat_id = p_chat_id AND c.is_active = TRUE
    LIMIT 1;
    
    -- If no active call, return null
    IF v_call_id IS NULL THEN
        RETURN QUERY SELECT NULL::INTEGER, 0::INTEGER;
        RETURN;
    END IF;
    
    -- Mark user as inactive in call participants
    UPDATE call_participants cp
    SET is_active = FALSE, leave_time = NOW()
    WHERE cp.call_id = v_call_id AND cp.user_id = p_user_id AND cp.is_active = TRUE;
    
    -- Count remaining active participants
    SELECT COUNT(*) INTO v_remaining
    FROM call_participants cp
    WHERE cp.call_id = v_call_id AND cp.is_active = TRUE;
    
    -- If no active participants left, mark call as inactive
    IF v_remaining = 0 THEN
        UPDATE calls c
        SET is_active = FALSE, end_time = NOW()
        WHERE c.id = v_call_id;
    END IF;
    
    -- Return call ID and remaining participants count
    RETURN QUERY SELECT v_call_id, v_remaining;
END;
$$ LANGUAGE plpgsql;

-- Cleanup Function for Stuck Calls
CREATE OR REPLACE FUNCTION cleanup_stuck_calls() RETURNS VOID AS $$
BEGIN
    -- Mark calls as inactive if they've been active for more than 24 hours
    UPDATE calls
    SET is_active = FALSE, end_time = NOW()
    WHERE is_active = TRUE AND start_time < NOW() - INTERVAL '24 hours';
    
    -- Mark participants as inactive if their call is inactive
    UPDATE call_participants cp
    SET is_active = FALSE, leave_time = COALESCE(leave_time, NOW())
    FROM calls c
    WHERE cp.call_id = c.id AND cp.is_active = TRUE AND c.is_active = FALSE;
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to run cleanup_stuck_calls every hour
DO $$
BEGIN
    -- Check if pg_cron extension is available
    IF EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
    ) THEN
        -- If pg_cron is available, schedule the cleanup job
        PERFORM cron.schedule('0 * * * *', 'SELECT cleanup_stuck_calls()');
    ELSE
        -- If pg_cron is not available, just log a message
        RAISE NOTICE 'pg_cron extension not available. Manual cleanup will be required.';
    END IF;
END $$;
EOF

# Apply the SQL file
psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -f call_system_fixes.sql

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to apply database functions. Aborting.${NC}"
    exit 1
fi

echo -e "${GREEN}Successfully applied database functions.${NC}"

echo -e "${GREEN}Call system fixes completed successfully!${NC}"
echo -e "${YELLOW}Note: You will need to restart the server for the changes to take effect.${NC}"

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

exit 0