-- Fix the PostgreSQL sequence synchronization issue for chats table
-- This happens when we manually insert records with explicit IDs

-- Reset the sequence to the correct value based on the maximum ID in the table
SELECT setval('chats_id_seq', COALESCE((SELECT MAX(id) FROM chats), 1), true);

-- Verify the sequence is now correct
SELECT currval('chats_id_seq') as current_sequence_value;