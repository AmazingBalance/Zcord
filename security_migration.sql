-- Миграция для внедрения системы безопасности и расширенных возможностей сообщений
-- Выполнять после остановки приложения

BEGIN;

-- 1. Создание таблиц для криптографических ключей

-- Ключи пользователей для E2E шифрования
CREATE TABLE IF NOT EXISTS user_keys (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    identity_public_key TEXT NOT NULL,
    signed_pre_key TEXT NOT NULL,
    signed_pre_key_signature TEXT NOT NULL,
    one_time_pre_keys TEXT[] DEFAULT '{}', -- массив одноразовых ключей
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Ключи чатов для групповых сообщений
CREATE TABLE IF NOT EXISTS chat_keys (
    id SERIAL PRIMARY KEY,
    chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    root_key TEXT NOT NULL,
    chain_key TEXT NOT NULL,
    message_number INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_id, user_id)
);

-- 2. WebSocket сессии для real-time соединений
CREATE TABLE IF NOT EXISTS websocket_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    session_id TEXT UNIQUE NOT NULL,
    connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_ping TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- 3. Статусы прочтения сообщений
CREATE TABLE IF NOT EXISTS message_read_status (
    id SERIAL PRIMARY KEY,
    message_id VARCHAR(100) REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id)
);

-- 4. Прикрепленные файлы и ссылки к сообщениям
CREATE TABLE IF NOT EXISTS message_attachments (
    id SERIAL PRIMARY KEY,
    message_id VARCHAR(100) REFERENCES messages(id) ON DELETE CASCADE,
    attachment_type VARCHAR(50) NOT NULL, -- 'link', 'file', 'image', 'video', 'audio'
    url TEXT,
    title TEXT,
    description TEXT,
    thumbnail_url TEXT,
    file_size BIGINT,
    mime_type VARCHAR(100),
    width INTEGER, -- для изображений и видео
    height INTEGER, -- для изображений и видео
    duration INTEGER, -- для аудио и видео в секундах
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Таблица для приглашений в чаты (если еще не создана)
CREATE TABLE IF NOT EXISTS chat_invites (
    id SERIAL PRIMARY KEY,
    invite_code TEXT UNIQUE NOT NULL,
    chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
    created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT true,
    max_uses INTEGER, -- NULL означает неограниченное количество использований
    current_uses INTEGER DEFAULT 0
);

-- 6. Обновление существующих таблиц

-- Добавляем поля для зашифрованных сообщений
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS encrypted_content TEXT,
ADD COLUMN IF NOT EXISTS message_key_id TEXT,
ADD COLUMN IF NOT EXISTS signature TEXT,
ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS reply_to_message_id VARCHAR(100) REFERENCES messages(id);

-- Добавляем статус пользователя и время последней активности
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'offline',
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Добавляем поля для чатов
ALTER TABLE chats
ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS chat_type VARCHAR(20) DEFAULT 'group'; -- 'group', 'direct', 'channel'

-- 7. Создание индексов для оптимизации

-- Индексы для криптографических ключей
CREATE INDEX IF NOT EXISTS idx_user_keys_user_id ON user_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_keys_chat_user ON chat_keys(chat_id, user_id);

-- Индексы для WebSocket сессий
CREATE INDEX IF NOT EXISTS idx_websocket_sessions_user_id ON websocket_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_websocket_sessions_active ON websocket_sessions(is_active);

-- Индексы для статусов прочтения
CREATE INDEX IF NOT EXISTS idx_message_read_status_message ON message_read_status(message_id);
CREATE INDEX IF NOT EXISTS idx_message_read_status_user ON message_read_status(user_id);

-- Индексы для вложений
CREATE INDEX IF NOT EXISTS idx_message_attachments_message ON message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_message_attachments_type ON message_attachments(attachment_type);

-- Индексы для приглашений
CREATE INDEX IF NOT EXISTS idx_chat_invites_code ON chat_invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_chat_invites_chat ON chat_invites(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_invites_active ON chat_invites(is_active, expires_at);

-- Индексы для новых полей сообщений
CREATE INDEX IF NOT EXISTS idx_messages_encrypted ON messages(is_encrypted);
CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON messages(sent_at);
CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON messages(reply_to_message_id);

-- Индексы для статуса пользователей
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen);

-- 8. Функции для обновления временных меток
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Триггеры для автоматического обновления updated_at
DROP TRIGGER IF EXISTS update_user_keys_updated_at ON user_keys;
CREATE TRIGGER update_user_keys_updated_at 
    BEFORE UPDATE ON user_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_chat_keys_updated_at ON chat_keys;
CREATE TRIGGER update_chat_keys_updated_at 
    BEFORE UPDATE ON chat_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 9. Функция для автоматической очистки неактивных WebSocket сессий
CREATE OR REPLACE FUNCTION cleanup_inactive_websocket_sessions()
RETURNS void AS $$
BEGIN
    UPDATE websocket_sessions 
    SET is_active = false 
    WHERE last_ping < NOW() - INTERVAL '5 minutes' AND is_active = true;
    
    DELETE FROM websocket_sessions 
    WHERE last_ping < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- 10. Функция для получения непрочитанных сообщений пользователя
CREATE OR REPLACE FUNCTION get_unread_messages_count(p_user_id INTEGER, p_chat_id INTEGER DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
    unread_count INTEGER;
BEGIN
    IF p_chat_id IS NULL THEN
        -- Считаем все непрочитанные сообщения пользователя
        SELECT COUNT(*)
        INTO unread_count
        FROM messages m
        JOIN chats c ON m.chat_id = c.id
        WHERE c.users @> ARRAY[p_user_id]
        AND m.user_id != p_user_id
        AND NOT EXISTS (
            SELECT 1 FROM message_read_status mrs 
            WHERE mrs.message_id = m.id AND mrs.user_id = p_user_id
        );
    ELSE
        -- Считаем непрочитанные сообщения в конкретном чате
        SELECT COUNT(*)
        INTO unread_count
        FROM messages m
        WHERE m.chat_id = p_chat_id
        AND m.user_id != p_user_id
        AND NOT EXISTS (
            SELECT 1 FROM message_read_status mrs 
            WHERE mrs.message_id = m.id AND mrs.user_id = p_user_id
        );
    END IF;
    
    RETURN COALESCE(unread_count, 0);
END;
$$ LANGUAGE plpgsql;

-- 11. Функция для пометки сообщений как прочитанных
CREATE OR REPLACE FUNCTION mark_messages_as_read(p_user_id INTEGER, p_chat_id INTEGER, p_up_to_message_id VARCHAR(100) DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
    marked_count INTEGER;
BEGIN
    IF p_up_to_message_id IS NULL THEN
        -- Помечаем все сообщения в чате как прочитанные
        INSERT INTO message_read_status (message_id, user_id)
        SELECT m.id, p_user_id
        FROM messages m
        WHERE m.chat_id = p_chat_id
        AND m.user_id != p_user_id
        AND NOT EXISTS (
            SELECT 1 FROM message_read_status mrs 
            WHERE mrs.message_id = m.id AND mrs.user_id = p_user_id
        )
        ON CONFLICT (message_id, user_id) DO NOTHING;
    ELSE
        -- Помечаем сообщения до определенного ID как прочитанные
        INSERT INTO message_read_status (message_id, user_id)
        SELECT m.id, p_user_id
        FROM messages m
        WHERE m.chat_id = p_chat_id
        AND m.user_id != p_user_id
        AND m.created_at <= (SELECT created_at FROM messages WHERE id = p_up_to_message_id)
        AND NOT EXISTS (
            SELECT 1 FROM message_read_status mrs 
            WHERE mrs.message_id = m.id AND mrs.user_id = p_user_id
        )
        ON CONFLICT (message_id, user_id) DO NOTHING;
    END IF;
    
    GET DIAGNOSTICS marked_count = ROW_COUNT;
    RETURN marked_count;
END;
$$ LANGUAGE plpgsql;

-- 12. Обновляем существующие данные
-- Устанавливаем sent_at для существующих сообщений
UPDATE messages SET sent_at = created_at WHERE sent_at IS NULL;

-- Устанавливаем тип чата для существующих чатов
UPDATE chats SET chat_type = CASE 
    WHEN array_length(users, 1) = 2 AND name = 'LS Chat' THEN 'direct'
    WHEN id = 1 THEN 'channel'
    ELSE 'group'
END WHERE chat_type = 'group';

COMMIT;

-- Выводим информацию о миграции
DO $$
BEGIN
    RAISE NOTICE 'Миграция системы безопасности завершена успешно!';
    RAISE NOTICE 'Созданы таблицы: user_keys, chat_keys, websocket_sessions, message_read_status, message_attachments';
    RAISE NOTICE 'Обновлены таблицы: messages, users, chats';
    RAISE NOTICE 'Созданы функции: cleanup_inactive_websocket_sessions, get_unread_messages_count, mark_messages_as_read';
END $$;