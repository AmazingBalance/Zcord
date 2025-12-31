-- Zcord: schema + seed data

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(50),
    tag VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    description TEXT,
    avatar VARCHAR(500),
    friends_list INTEGER[] DEFAULT '{}',
    friends_list_in INTEGER[] DEFAULT '{}',
    friends_list_out INTEGER[] DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'offline',
    last_seen TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- WebSocket sessions
CREATE TABLE IF NOT EXISTS websocket_sessions (
    session_id VARCHAR(100) PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_ping TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_websocket_sessions_user_id ON websocket_sessions(user_id);

-- Chat invite links (created after chats/messages to satisfy FK constraints)

-- Chats (includes channels)
CREATE TABLE IF NOT EXISTS chats (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    tag VARCHAR(100) UNIQUE NOT NULL,
    chat_type VARCHAR(50) DEFAULT 'chat',
    owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    avatar VARCHAR(500),
    description TEXT,
    users INTEGER[] DEFAULT '{}',
    last_message_id VARCHAR(100),
    last_user_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Messages are stored as a linked list via prev_message_id
CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    text TEXT,
    type VARCHAR(50) DEFAULT 'text',
    user_id INTEGER REFERENCES users(id),
    chat_id INTEGER REFERENCES chats(id),
    image_src VARCHAR(500),
    prev_message_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chat invite links
CREATE TABLE IF NOT EXISTS chat_invites (
    id SERIAL PRIMARY KEY,
    invite_code VARCHAR(100) UNIQUE NOT NULL,
    chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT true,
    max_uses INTEGER,
    current_uses INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_chat_invites_code ON chat_invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_chat_invites_chat_id ON chat_invites(chat_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tag ON users(tag);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_users ON chats USING GIN(users);

-- updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chats_updated_at BEFORE UPDATE ON chats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed: "News" channel (id=1)
INSERT INTO chats (id, name, tag, chat_type, owner_id, avatar, description, users)
VALUES (
    1,
    'Новости Zcord',
    'news',
    'channel',
    NULL,
    '/news_icon.svg',
    'Официальный канал новостей мессенджера Zcord',
    '{}'
)
ON CONFLICT (id) DO NOTHING;

-- If users already exist (e.g. during a manual re-run), ensure they are subscribed
UPDATE chats
SET users = (SELECT COALESCE(array_agg(id), '{}') FROM users)
WHERE id = 1;

-- Seed: initial posts for the news channel (as messages)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM messages WHERE chat_id = 1) THEN
        INSERT INTO messages (id, text, type, chat_id, image_src, prev_message_id, created_at)
        VALUES
            ('a187fca1-5bd6-47a8-bc8f-5be435ae3f53', 'Добро пожаловать в Новости Zcord!', 'system', 1, NULL, NULL, '2025-12-26 00:30:40.524934'),
            ('809725ea-3e7c-498e-80ce-3dfbabf9ca07', 'Здесь будут публиковаться обновления и важные объявления.', 'system', 1, NULL, 'a187fca1-5bd6-47a8-bc8f-5be435ae3f53', '2025-12-26 00:30:40.524934'),
            ('6f4237a7-7a66-4dda-baf9-a7c881ffd82d', 'Первый пост: проект успешно запускается на Podman.', 'system', 1, NULL, '809725ea-3e7c-498e-80ce-3dfbabf9ca07', '2025-12-26 00:30:40.524934'),
            ('ee451a1b-7e57-4130-b37d-23f2e7402607', 'v1.0 — Вы в безопасности

Всем привет! Это самая первая версия приложения, всё сырое, но сообщения писать можно и я считаю это круто.
Проект находится в тестовом состоянии, постепенно буду пилить новые фичи и выкладывать новости о них сюда, многое предстоит сделать до первого релиза.

С прошедшим Новым Годом, ещё увидимся :)', 'user', 1, 'https://i.postimg.cc/DzLfkYFQ/2017-Nature-Beautiful-clouds-reflected-in-the-blue-water-of-the-ocean-115872.jpg', '6f4237a7-7a66-4dda-baf9-a7c881ffd82d', '2025-12-26 01:48:51.509476');

        UPDATE chats
        SET last_message_id = 'ee451a1b-7e57-4130-b37d-23f2e7402607',
            last_user_id = NULL
        WHERE id = 1;
    END IF;
END $$;

-- Sync sequences after manual inserts
SELECT setval(
    pg_get_serial_sequence('users', 'id'),
    COALESCE((SELECT MAX(id) FROM users), 1),
    EXISTS(SELECT 1 FROM users)
);
SELECT setval(
    pg_get_serial_sequence('chats', 'id'),
    COALESCE((SELECT MAX(id) FROM chats), 1),
    EXISTS(SELECT 1 FROM chats)
);
