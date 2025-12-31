-- Fix the join_call function to resolve ambiguous column references
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
    -- Fix: Qualify the column name with the table name
    SELECT c.id, c.start_time INTO v_call_id, v_start_time
    FROM calls c
    WHERE c.chat_id = p_chat_id AND c.is_active = TRUE
    LIMIT 1;
    
    -- If no active call, create a new one
    IF v_call_id IS NULL THEN
        -- Fix: Use column aliases in the RETURNING clause
        INSERT INTO calls (chat_id, start_time, is_active, call_type, chat_type)
        VALUES (p_chat_id, NOW(), TRUE, p_call_type, p_chat_type)
        RETURNING calls.id, calls.start_time INTO v_call_id, v_start_time;
        
        v_is_new_call := TRUE;
    END IF;
    
    -- Add user to call participants or update if already exists
    -- Fix: Use a different approach to avoid ambiguity in ON CONFLICT
    BEGIN
        -- Try to insert a new record
        INSERT INTO call_participants (call_id, user_id, join_time, is_active)
        VALUES (v_call_id, p_user_id, NOW(), TRUE);
    EXCEPTION WHEN unique_violation THEN
        -- If it already exists, update it
        UPDATE call_participants
        SET join_time = NOW(), is_active = TRUE
        WHERE call_participants.call_id = v_call_id AND call_participants.user_id = p_user_id;
    END;
    
    -- Return call information
    RETURN QUERY SELECT v_call_id, v_start_time, v_is_new_call;
END;
$$ LANGUAGE plpgsql;