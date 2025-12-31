-- Исправление проблемы с типом звонка в личных чатах
-- Проблема: в личных чатах инициализируется групповой звонок

-- Модифицируем функцию get_active_call, чтобы она всегда возвращала правильный тип звонка
-- в зависимости от типа чата, а не от значения в таблице calls

CREATE OR REPLACE FUNCTION get_active_call(p_chat_id VARCHAR(255))
RETURNS TABLE (
    id INTEGER,
    chat_id VARCHAR(255),
    start_time TIMESTAMP,
    call_type VARCHAR(50),
    chat_type VARCHAR(50),
    participants JSON
) AS $$
DECLARE
    v_chat_type VARCHAR(50);
BEGIN
    -- Сначала определяем реальный тип чата
    -- Проверяем, является ли чат личным сообщением (ls)
    SELECT 
        CASE 
            WHEN EXISTS (
                SELECT 1 FROM chats 
                WHERE id = p_chat_id AND type = 'ls'
            ) THEN 'ls'
            WHEN EXISTS (
                SELECT 1 FROM chats 
                WHERE id = p_chat_id AND type = 'channel'
            ) THEN 'channel'
            ELSE 'chat'
        END INTO v_chat_type;
    
    -- Логируем информацию для отладки
    RAISE NOTICE 'Chat ID: %, Determined chat type: %', p_chat_id, v_chat_type;
    
    -- Возвращаем данные о звонке, но с правильным типом чата
    RETURN QUERY
    SELECT
        c.id,
        c.chat_id,
        c.start_time,
        c.call_type,
        v_chat_type, -- Используем определенный тип чата вместо значения из таблицы
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

-- Добавляем логирование для отслеживания вызовов функции get_active_call
CREATE OR REPLACE FUNCTION log_get_active_call() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO call_logs (
        call_id, 
        action, 
        user_id, 
        remaining_participants, 
        call_type, 
        chat_type, 
        details
    )
    VALUES (
        NEW.id, 
        'get_active_call', 
        NULL, 
        (SELECT COUNT(*) FROM call_participants WHERE call_id = NEW.id AND is_active = TRUE), 
        NEW.call_type, 
        NEW.chat_type, 
        jsonb_build_object(
            'chat_id', NEW.chat_id,
            'start_time', NEW.start_time,
            'is_active', NEW.is_active
        )
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создаем триггер для логирования вызовов get_active_call
DROP TRIGGER IF EXISTS log_get_active_call_trigger ON calls;
CREATE TRIGGER log_get_active_call_trigger
AFTER SELECT ON calls
FOR EACH ROW
WHEN (OLD.is_active = TRUE)
EXECUTE FUNCTION log_get_active_call();

-- Логируем применение исправления
DO $$
BEGIN
    RAISE NOTICE 'Fix for call type in LS chats has been applied';
END $$;