-- Быстрое исправление: добавляем пользователя с ID=2 в канал новостей

-- Сначала создаем канал новостей если его нет
INSERT INTO chats (id, name, avatar, description, users) 
VALUES (1, 'Новости Zcord', '/news_icon.svg', 'Официальный канал новостей мессенджера Zcord', ARRAY[2])
ON CONFLICT (id) DO UPDATE SET
    users = array_append(chats.users, 2)
    WHERE NOT (2 = ANY(chats.users));

-- Проверяем результат
SELECT 
    c.id,
    c.name,
    c.description,
    c.users,
    array_length(c.users, 1) as user_count
FROM chats c 
WHERE c.id = 1;

-- Также проверяем всех пользователей
SELECT id, name, tag FROM users;