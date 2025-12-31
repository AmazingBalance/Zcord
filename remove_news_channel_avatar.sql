-- Скрипт для удаления аватара у канала "Новости Zcord"
-- Выполните этот скрипт в вашей базе данных PostgreSQL

UPDATE chats 
SET avatar = NULL 
WHERE name = 'Новости Zcord' AND id = 1;