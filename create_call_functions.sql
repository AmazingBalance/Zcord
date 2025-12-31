-- Function to join a call
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
    SELECT id, start_time INTO v_call_id, v_start_time
    FROM calls
    WHERE chat_id = p_chat_id AND is_active = TRUE
    LIMIT 1;
    
    -- If no active call, create a new one
    IF v_call_id IS NULL THEN
        INSERT INTO calls (chat_id, start_time, is_active, call_type, chat_type)
        VALUES (p_chat_id, NOW(), TRUE, p_call_type, p_chat_type)
        RETURNING id, start_time INTO v_call_id, v_start_time;
        
        v_is_new_call := TRUE;
    END IF;
    
    -- Add user to call participants or update if already exists
    INSERT INTO call_participants (call_id, user_id, join_time, is_active)
    VALUES (v_call_id, p_user_id, NOW(), TRUE)
    ON CONFLICT (call_id, user_id) 
    DO UPDATE SET join_time = NOW(), is_active = TRUE;
    
    -- Return call information
    RETURN QUERY SELECT v_call_id, v_start_time, v_is_new_call;
END;
$$ LANGUAGE plpgsql;

-- Function to leave a call
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
    SELECT id INTO v_call_id
    FROM calls
    WHERE chat_id = p_chat_id AND is_active = TRUE
    LIMIT 1;
    
    -- If no active call, return null
    IF v_call_id IS NULL THEN
        RETURN QUERY SELECT NULL::INTEGER, 0::INTEGER;
        RETURN;
    END IF;
    
    -- Mark user as inactive in call participants
    UPDATE call_participants
    SET is_active = FALSE, leave_time = NOW()
    WHERE call_id = v_call_id AND user_id = p_user_id AND is_active = TRUE;
    
    -- Count remaining active participants
    SELECT COUNT(*) INTO v_remaining
    FROM call_participants
    WHERE call_id = v_call_id AND is_active = TRUE;
    
    -- If no active participants left, mark call as inactive
    IF v_remaining = 0 THEN
        UPDATE calls
        SET is_active = FALSE, end_time = NOW()
        WHERE id = v_call_id;
    END IF;
    
    -- Return call ID and remaining participants count
    RETURN QUERY SELECT v_call_id, v_remaining;
END;
$$ LANGUAGE plpgsql;