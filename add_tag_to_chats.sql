-- Migration to add tag column to chats table
-- This fixes the "column tag does not exist" error

-- Add tag column to chats table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'chats' AND column_name = 'tag'
    ) THEN
        ALTER TABLE chats ADD COLUMN tag VARCHAR(100) UNIQUE;
        
        -- Update existing chats with generated tags based on their names
        -- This ensures existing chats get valid tags
        UPDATE chats SET tag = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g')) WHERE tag IS NULL;
        
        -- Make the tag column NOT NULL after updating existing records
        ALTER TABLE chats ALTER COLUMN tag SET NOT NULL;
        
        -- Create index for tag column
        CREATE INDEX IF NOT EXISTS idx_chats_tag ON chats(tag);
        
        RAISE NOTICE 'Tag column added to chats table successfully';
    ELSE
        RAISE NOTICE 'Tag column already exists in chats table';
    END IF;
END $$;