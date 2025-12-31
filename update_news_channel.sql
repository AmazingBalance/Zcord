-- Скрипт для обновления существующей базы данных
-- Добавляет канал новостей и всех пользователей в него

-- Создание или обновление канала новостей
INSERT INTO chats (id, name, avatar, description, users)
VALUES (1, 'Новости Zcord', '/news_icon.svg', 'Официальный канал новостей мессенджера Zcord', '{}')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    avatar = EXCLUDED.avatar,
    description = EXCLUDED.description;

-- Добавляем всех существующих пользователей в канал новостей
UPDATE chats SET users = (
    SELECT COALESCE(array_agg(id), '{}') FROM users
) WHERE id = 1;

-- Обновляем время последнего обновления канала
UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = 1;