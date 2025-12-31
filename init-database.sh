#!/bin/bash

# Скрипт для инициализации базы данных Zcord в Podman

echo "🗄️  Инициализация базы данных Zcord..."

# Проверяем, что PostgreSQL контейнер запущен
if ! podman ps | grep -q "zcord-postgres-dev"; then
    echo "❌ PostgreSQL контейнер не запущен. Запустите сначала:"
    echo "   npm run podman:dev"
    exit 1
fi

echo "📋 Создание таблиц..."

# Создание основных таблиц
podman-compose -f podman-compose.dev.yml exec postgres psql -h localhost -U nikdimer -d zcord -c "
-- Создание базы данных и таблиц для Zcord

-- Таблица пользователей
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица чатов
CREATE TABLE IF NOT EXISTS chats (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    tag VARCHAR(100) UNIQUE NOT NULL,
    avatar VARCHAR(500),
    description TEXT,
    users INTEGER[] DEFAULT '{}',
    last_message_id VARCHAR(100),
    last_user_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица сообщений
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

-- Таблица пригласительных ссылок
CREATE TABLE IF NOT EXISTS chat_invites (
    id SERIAL PRIMARY KEY,
    invite_code VARCHAR(32) UNIQUE NOT NULL,
    chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    max_uses INTEGER DEFAULT NULL,
    current_uses INTEGER DEFAULT 0
);
"

echo "📊 Создание индексов..."

# Создание индексов и функций
podman-compose -f podman-compose.dev.yml exec postgres psql -h localhost -U nikdimer -d zcord -c "
-- Индексы для оптимизации
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tag ON users(tag);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_users ON chats USING GIN(users);

-- Индексы для таблицы приглашений
CREATE INDEX IF NOT EXISTS idx_chat_invites_code ON chat_invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_chat_invites_chat_id ON chat_invites(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_invites_expires_at ON chat_invites(expires_at);
CREATE INDEX IF NOT EXISTS idx_chat_invites_active ON chat_invites(is_active);

-- Функция для обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS \$\$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
\$\$ language 'plpgsql';

-- Триггеры для автоматического обновления updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_chats_updated_at ON chats;
CREATE TRIGGER update_chats_updated_at BEFORE UPDATE ON chats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Функция для автоматической очистки истекших приглашений
CREATE OR REPLACE FUNCTION cleanup_expired_invites()
RETURNS void AS \$\$
BEGIN
    UPDATE chat_invites
    SET is_active = FALSE
    WHERE expires_at < CURRENT_TIMESTAMP AND is_active = TRUE;
END;
\$\$ LANGUAGE plpgsql;
"

echo "📰 Создание канала новостей..."

# Создание канала новостей
podman-compose -f podman-compose.dev.yml exec postgres psql -h localhost -U nikdimer -d zcord -c "
-- Создание специального канала новостей с тегом
INSERT INTO chats (id, name, tag, avatar, description, users)
VALUES (1, 'Новости Zcord', 'news', '/news_icon.svg', 'Официальный канал новостей мессенджера Zcord', '{}')
ON CONFLICT (id) DO UPDATE SET
    name = 'Новости Zcord',
    tag = 'news',
    avatar = '/news_icon.svg',
    description = 'Официальный канал новостей мессенджера Zcord';

-- Исправляем последовательность для ID чатов
SELECT setval('chats_id_seq', (SELECT MAX(id) FROM chats));
"

echo "✅ База данных успешно инициализирована!"

# Проверка результата
echo "📋 Проверка созданных таблиц:"
podman-compose -f podman-compose.dev.yml exec postgres psql -h localhost -U nikdimer -d zcord -c "
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
"

echo "📰 Проверка канала новостей:"
podman-compose -f podman-compose.dev.yml exec postgres psql -h localhost -U nikdimer -d zcord -c "
SELECT id, name, tag, description FROM chats WHERE id = 1;
"

echo ""
echo "🎉 Готово! Теперь можно использовать приложение."
echo "📱 Frontend: http://localhost:3000"
echo "🔧 Backend API: http://localhost:8000"