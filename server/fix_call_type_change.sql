-- Добавляем логирование для отслеживания изменений типа звонка
-- и исправляем функцию leave_call, чтобы она не меняла тип звонка при выходе участников

-- Создаем таблицу для логирования звонков, если её еще нет
CREATE TABLE IF NOT EXISTS call_logs (
    id SERIAL PRIMARY KEY,
    call_id INTEGER NOT NULL,
    log_time TIMESTAMP NOT NULL DEFAULT NOW(),
    action VARCHAR(50) NOT NULL,
    user_id VARCHAR(255),
    remaining_participants INTEGER,
    call_type VARCHAR(50),
    chat_type VARCHAR(50),
    details JSONB
);

-- Создаем индекс для быстрого поиска по call_id
CREATE INDEX IF NOT EXISTS idx_call_logs_call_id ON call_logs(call_id);

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
    v_call_type VARCHAR(50);
    v_chat_type VARCHAR(50);
    v_log_details JSONB;
BEGIN
    -- Получаем ID активного звонка для этого чата и его типы
    SELECT c.id, c.call_type, c.chat_type INTO v_call_id, v_call_type, v_chat_type
    FROM calls c
    WHERE c.chat_id = p_chat_id AND c.is_active = TRUE
    LIMIT 1;
    
    -- Если нет активного звонка, возвращаем 0 вместо NULL
    IF v_call_id IS NULL THEN
        -- Логируем попытку выхода из несуществующего звонка
        INSERT INTO call_logs (call_id, action, user_id, remaining_participants, details)
        VALUES (0, 'leave_nonexistent_call', p_user_id, 0, jsonb_build_object(
            'chat_id', p_chat_id,
            'error', 'No active call found'
        ));
        
        RETURN QUERY SELECT 0::INTEGER, 0::INTEGER;
        RETURN;
    END IF;
    
    -- Логируем состояние до выхода пользователя
    SELECT jsonb_build_object(
        'chat_id', p_chat_id,
        'call_type_before', v_call_type,
        'chat_type_before', v_chat_type,
        'participants_before', (
            SELECT COUNT(*) FROM call_participants 
            WHERE call_id = v_call_id AND is_active = TRUE
        )
    ) INTO v_log_details;
    
    -- Помечаем пользователя как неактивного в участниках звонка
    UPDATE call_participants cp
    SET is_active = FALSE, leave_time = NOW()
    WHERE cp.call_id = v_call_id AND cp.user_id = p_user_id AND cp.is_active = TRUE;
    
    -- Считаем оставшихся активных участников
    SELECT COUNT(*) INTO v_remaining
    FROM call_participants cp
    WHERE cp.call_id = v_call_id AND cp.is_active = TRUE;
    
    -- Обновляем детали лога
    v_log_details = v_log_details || jsonb_build_object(
        'participants_after', v_remaining
    );
    
    -- Если не осталось активных участников, помечаем звонок как неактивный
    IF v_remaining = 0 THEN
        UPDATE calls c
        SET is_active = FALSE, end_time = NOW()
        WHERE c.id = v_call_id;
        
        -- Добавляем информацию о завершении звонка в лог
        v_log_details = v_log_details || jsonb_build_object(
            'call_ended', TRUE
        );
    END IF;
    
    -- Логируем выход пользователя из звонка
    INSERT INTO call_logs (call_id, action, user_id, remaining_participants, call_type, chat_type, details)
    VALUES (v_call_id, 'leave_call', p_user_id, v_remaining, v_call_type, v_chat_type, v_log_details);
    
    -- Возвращаем ID звонка и количество оставшихся участников
    RETURN QUERY SELECT v_call_id, v_remaining;
END;
$$ LANGUAGE plpgsql;

-- Добавляем функцию для получения логов звонка
CREATE OR REPLACE FUNCTION get_call_logs(p_call_id INTEGER)
RETURNS TABLE (
    log_id INTEGER,
    log_time TIMESTAMP,
    action VARCHAR(50),
    user_id VARCHAR(255),
    remaining_participants INTEGER,
    call_type VARCHAR(50),
    chat_type VARCHAR(50),
    details JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cl.id,
        cl.log_time,
        cl.action,
        cl.user_id,
        cl.remaining_participants,
        cl.call_type,
        cl.chat_type,
        cl.details
    FROM call_logs cl
    WHERE cl.call_id = p_call_id
    ORDER BY cl.log_time ASC;
END;
$$ LANGUAGE plpgsql;