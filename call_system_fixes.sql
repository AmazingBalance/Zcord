-- Исправления для системы звонков
-- Этот скрипт удаляет существующие функции и создает новые, оптимизированные версии

-- Шаг 1: Удаляем существующие функции, если они существуют
DROP FUNCTION IF EXISTS get_active_call(VARCHAR);
DROP FUNCTION IF EXISTS join_call(VARCHAR, VARCHAR, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS leave_call(VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS cleanup_stuck_calls();

-- Шаг 2: Создаем оптимизированные индексы
CREATE INDEX IF NOT EXISTS idx_calls_chat_id_is_active ON calls(chat_id, is_active);
CREATE INDEX IF NOT EXISTS idx_call_participants_call_id_is_active ON call_participants(call_id, is_active);

-- Шаг 3: Создаем функцию для получения активного звонка
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
    -- Возвращаем информацию об активном звонке и его участниках
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

-- Шаг 4: Создаем функцию для присоединения к звонку
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
    -- Проверяем, есть ли активный звонок в этом чате
    SELECT c.id, c.start_time INTO v_call_id, v_start_time
    FROM calls c
    WHERE c.chat_id = p_chat_id AND c.is_active = TRUE
    LIMIT 1;
    
    -- Если нет активного звонка, создаем новый
    IF v_call_id IS NULL THEN
        INSERT INTO calls (chat_id, start_time, is_active, call_type, chat_type)
        VALUES (p_chat_id, NOW(), TRUE, p_call_type, p_chat_type)
        RETURNING calls.id, calls.start_time INTO v_call_id, v_start_time;
        
        v_is_new_call := TRUE;
    END IF;
    
    -- Добавляем пользователя к участникам звонка или обновляем, если уже существует
    BEGIN
        -- Пробуем вставить новую запись
        INSERT INTO call_participants (call_id, user_id, join_time, is_active)
        VALUES (v_call_id, p_user_id, NOW(), TRUE);
    EXCEPTION WHEN unique_violation THEN
        -- Если запись уже существует, обновляем ее
        UPDATE call_participants
        SET join_time = NOW(), is_active = TRUE, leave_time = NULL
        WHERE call_participants.call_id = v_call_id AND call_participants.user_id = p_user_id;
    END;
    
    -- Возвращаем информацию о звонке
    RETURN QUERY SELECT v_call_id, v_start_time, v_is_new_call;
END;
$$ LANGUAGE plpgsql;

-- Шаг 5: Создаем функцию для выхода из звонка
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

-- Шаг 6: Создаем функцию для очистки зависших звонков
CREATE OR REPLACE FUNCTION cleanup_stuck_calls() RETURNS VOID AS $$
BEGIN
    -- Помечаем звонки как неактивные, если они были активны более 24 часов
    UPDATE calls
    SET is_active = FALSE, end_time = NOW()
    WHERE is_active = TRUE AND start_time < NOW() - INTERVAL '24 hours';
    
    -- Помечаем участников как неактивных, если их звонок неактивен
    UPDATE call_participants cp
    SET is_active = FALSE, leave_time = COALESCE(leave_time, NOW())
    FROM calls c
    WHERE cp.call_id = c.id AND cp.is_active = TRUE AND c.is_active = FALSE;
END;
$$ LANGUAGE plpgsql;

-- Шаг 7: Создаем запланированное задание для запуска cleanup_stuck_calls каждый час
DO $$
BEGIN
    -- Проверяем, доступно ли расширение pg_cron
    IF EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
    ) THEN
        -- Если pg_cron доступен, планируем задание очистки
        PERFORM cron.schedule('0 * * * *', 'SELECT cleanup_stuck_calls()');
    ELSE
        -- Если pg_cron недоступен, просто выводим сообщение
        RAISE NOTICE 'Расширение pg_cron недоступно. Потребуется ручная очистка.';
    END IF;
END $$;