-- Script to clean up stuck active calls in the database

-- First, mark all active calls as inactive
UPDATE calls
SET is_active = FALSE, end_time = NOW()
WHERE is_active = TRUE;

-- Then, mark all active call participants as inactive
UPDATE call_participants
SET is_active = FALSE, leave_time = NOW()
WHERE is_active = TRUE;

-- Create a function to clean up calls for a specific chat
CREATE OR REPLACE FUNCTION cleanup_calls_for_chat(p_chat_id VARCHAR(255))
RETURNS VOID AS $$
BEGIN
    -- Mark all active calls for this chat as inactive
    UPDATE calls
    SET is_active = FALSE, end_time = NOW()
    WHERE chat_id = p_chat_id AND is_active = TRUE;
    
    -- Mark all participants in calls for this chat as inactive
    UPDATE call_participants
    SET is_active = FALSE, leave_time = NOW()
    FROM calls
    WHERE call_participants.call_id = calls.id
    AND calls.chat_id = p_chat_id
    AND call_participants.is_active = TRUE;
END;
$$ LANGUAGE plpgsql;

-- Example usage:
-- SELECT cleanup_calls_for_chat('7');