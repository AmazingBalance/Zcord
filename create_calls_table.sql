-- Create calls table if it doesn't exist
CREATE TABLE IF NOT EXISTS calls (
    id SERIAL PRIMARY KEY,
    chat_id VARCHAR(255) NOT NULL,
    start_time TIMESTAMP NOT NULL DEFAULT NOW(),
    end_time TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    call_type VARCHAR(50) NOT NULL DEFAULT 'video',
    chat_type VARCHAR(50) NOT NULL DEFAULT 'chat'
);

-- Create call_participants table if it doesn't exist
CREATE TABLE IF NOT EXISTS call_participants (
    call_id INTEGER NOT NULL REFERENCES calls(id),
    user_id VARCHAR(255) NOT NULL,
    join_time TIMESTAMP NOT NULL DEFAULT NOW(),
    leave_time TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (call_id, user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_calls_chat_id ON calls(chat_id);
CREATE INDEX IF NOT EXISTS idx_calls_is_active ON calls(is_active);
CREATE INDEX IF NOT EXISTS idx_call_participants_is_active ON call_participants(is_active);