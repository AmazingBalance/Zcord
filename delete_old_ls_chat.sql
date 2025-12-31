-- Удаление старого LS чата с тегом ls_2_3
DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE tag = 'ls_2_3');
DELETE FROM chats WHERE tag = 'ls_2_3';

-- Проверяем что чат удален
SELECT * FROM chats WHERE tag = 'ls_2_3';