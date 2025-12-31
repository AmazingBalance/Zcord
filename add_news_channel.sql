-- Скрипт для добавления канала "Новости Zcord" в существующую базу данных
-- Выполните этот скрипт в вашей базе данных PostgreSQL

-- Создаем канал новостей с ID = 1
INSERT INTO chats (id, name, avatar, description, users) 
VALUES (1, 'Новости Zcord', '/news_icon.svg', 'Официальный канал новостей мессенджера Zcord', '{}')
ON CONFLICT (id) DO UPDATE SET
    name = 'Новости Zcord',
    avatar = '/news_icon.svg',
    description = 'Официальный канал новостей мессенджера Zcord';

-- Добавляем ВСЕХ существующих пользователей в канал новостей
UPDATE chats 
SET users = (
    SELECT COALESCE(array_agg(id ORDER BY id), '{}') 
    FROM users
) 
WHERE id = 1;

-- Обновляем время последнего обновления канала
UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = 1;

-- Проверяем результат
SELECT 
    c.id,
    c.name,
    c.description,
    array_length(c.users, 1) as user_count,
    c.users
FROM chats c 
WHERE c.id = 1;