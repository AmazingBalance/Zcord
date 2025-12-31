-- Optimize the get_active_call function for better performance

-- Add index on calls.is_active for faster filtering
CREATE INDEX IF NOT EXISTS idx_calls_chat_id_is_active ON calls(chat_id, is_active);

-- Add index on call_participants for faster joins
CREATE INDEX IF NOT EXISTS idx_call_participants_call_id_is_active ON call_participants(call_id, is_active);

-- Optimize the get_active_call function
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
    -- Use EXPLAIN ANALYZE to verify query performance
    -- Add timeout handling to prevent long-running queries
    SET LOCAL statement_timeout = '5s';
    
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

-- Log that the optimization has been applied
DO $$
BEGIN
    RAISE NOTICE 'get_active_call function has been optimized';
END $$;