-- Fix the news channel to have a proper tag instead of using ID as tag
UPDATE chats SET tag = 'news' WHERE id = 1 AND tag IS NULL;

-- If the tag column doesn't exist or is using ID, update it
UPDATE chats SET tag = 'news' WHERE id = 1;

-- Ensure all existing chats have proper tags if they don't have them
UPDATE chats SET tag = 'chat_' || id::text WHERE tag IS NULL OR tag = id::text;