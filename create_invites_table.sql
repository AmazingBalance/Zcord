-- Создание таблицы для пригласительных ссылок
CREATE TABLE IF NOT EXISTS chat_invites (
    id SERIAL PRIMARY KEY,
    invite_code VARCHAR(32) UNIQUE NOT NULL,
    chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    max_uses INTEGER DEFAULT NULL, -- NULL означает неограниченное количество использований
    current_uses INTEGER DEFAULT 0
);

-- Индексы для оптимизации запросов
CREATE INDEX IF NOT EXISTS idx_chat_invites_code ON chat_invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_chat_invites_chat_id ON chat_invites(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_invites_expires_at ON chat_invites(expires_at);
CREATE INDEX IF NOT EXISTS idx_chat_invites_active ON chat_invites(is_active);

-- Функция для автоматической очистки истекших приглашений
CREATE OR REPLACE FUNCTION cleanup_expired_invites()
RETURNS void AS $$
BEGIN
    UPDATE chat_invites 
    SET is_active = FALSE 
    WHERE expires_at < CURRENT_TIMESTAMP AND is_active = TRUE;
END;
$$ LANGUAGE plpgsql;

-- Создание задачи для периодической очистки (можно запускать через cron или другой планировщик)
-- SELECT cleanup_expired_invites();