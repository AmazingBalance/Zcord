-- Исправление для функции leave_call, чтобы избежать ошибки "converting NULL to int is unsupported"
-- Эта функция теперь возвращает 0 вместо NULL, когда звонок не найден

-- Удаляем существующую функцию
DROP FUNCTION IF EXISTS leave_call(VARCHAR, VARCHAR);

-- Создаем исправленную функцию
CREATE OR REPLACE FUNCTION leave_call(
    p_chat_id VARCHAR(255),
    p_user_id VARCHAR(255)
) RETURNS TABLE (
    call_id INTEGER,
    remaining_participants INTEGER
) AS $$
DECLARE
    v_call_id INTEGER;
    v_remaining INTEGER := 0;
BEGIN
    -- Получаем ID активного звонка для этого чата
    SELECT c.id INTO v_call_id
    FROM calls c
    WHERE c.chat_id = p_chat_id AND c.is_active = TRUE
    LIMIT 1;
    
    -- Если нет активного звонка, возвращаем 0 вместо NULL
    IF v_call_id IS NULL THEN
        RETURN QUERY SELECT 0::INTEGER, 0::INTEGER;
        RETURN;
    END IF;
    
    -- Помечаем пользователя как неактивного в участниках звонка
    UPDATE call_participants cp
    SET is_active = FALSE, leave_time = NOW()
    WHERE cp.call_id = v_call_id AND cp.user_id = p_user_id AND cp.is_active = TRUE;
    
    -- Считаем оставшихся активных участников
    SELECT COUNT(*) INTO v_remaining
    FROM call_participants cp
    WHERE cp.call_id = v_call_id AND cp.is_active = TRUE;
    
    -- Если не осталось активных участников, помечаем звонок как неактивный
    IF v_remaining = 0 THEN
        UPDATE calls c
        SET is_active = FALSE, end_time = NOW()
        WHERE c.id = v_call_id;
    END IF;
    
    -- Возвращаем ID звонка и количество оставшихся участников
    RETURN QUERY SELECT v_call_id, v_remaining;
END;
$$ LANGUAGE plpgsql;