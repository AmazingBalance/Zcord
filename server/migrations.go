package main

import (
	"database/sql"
	"log"
	"os"

	_ "github.com/lib/pq"
)

func ensureSchema() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Println("Warning: DATABASE_URL is empty; skipping schema migrations")
		return
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Printf("Warning: failed to open DB for migrations: %v", err)
		return
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Printf("Warning: failed to ping DB for migrations: %v", err)
		return
	}

	stmts := []string{
		`ALTER TABLE chats ADD COLUMN IF NOT EXISTS chat_type VARCHAR(50) DEFAULT 'chat'`,
		`ALTER TABLE chats ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL`,
		`UPDATE chats SET chat_type = 'channel' WHERE tag = 'news' AND (chat_type IS NULL OR chat_type <> 'channel')`,

		// Call system tables
		`CREATE TABLE IF NOT EXISTS calls (
			id SERIAL PRIMARY KEY,
			chat_id VARCHAR(255) NOT NULL,
			start_time TIMESTAMP NOT NULL DEFAULT NOW(),
			end_time TIMESTAMP,
			is_active BOOLEAN NOT NULL DEFAULT TRUE,
			call_type VARCHAR(50) NOT NULL DEFAULT 'video',
			chat_type VARCHAR(50) NOT NULL DEFAULT 'chat'
		)`,
		`CREATE TABLE IF NOT EXISTS call_participants (
			call_id INTEGER NOT NULL REFERENCES calls(id),
			user_id VARCHAR(255) NOT NULL,
			join_time TIMESTAMP NOT NULL DEFAULT NOW(),
			leave_time TIMESTAMP,
			is_active BOOLEAN NOT NULL DEFAULT TRUE,
			PRIMARY KEY (call_id, user_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_calls_chat_id ON calls(chat_id)`,
		`CREATE INDEX IF NOT EXISTS idx_calls_is_active ON calls(is_active)`,
		`CREATE INDEX IF NOT EXISTS idx_calls_chat_id_is_active ON calls(chat_id, is_active)`,
		// Ensure we never have more than one active call per chat_id
		`UPDATE calls c
		 SET is_active = FALSE, end_time = COALESCE(end_time, NOW())
		 WHERE c.is_active = TRUE
		   AND EXISTS (
		     SELECT 1
		     FROM calls c2
		     WHERE c2.chat_id = c.chat_id
		       AND c2.is_active = TRUE
		       AND c2.id > c.id
		   )`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_calls_chat_id_active_unique ON calls(chat_id) WHERE is_active = TRUE`,
		`CREATE INDEX IF NOT EXISTS idx_call_participants_is_active ON call_participants(is_active)`,
		`CREATE INDEX IF NOT EXISTS idx_call_participants_call_id_is_active ON call_participants(call_id, is_active)`,

		// Call system functions used by websocket.go
		`DROP FUNCTION IF EXISTS get_active_call(VARCHAR)`,
		`DROP FUNCTION IF EXISTS join_call(VARCHAR, VARCHAR, VARCHAR, VARCHAR)`,
		`DROP FUNCTION IF EXISTS leave_call(VARCHAR, VARCHAR)`,
		`CREATE OR REPLACE FUNCTION get_active_call(p_chat_id VARCHAR(255))
		RETURNS TABLE (
			id INTEGER,
			chat_id VARCHAR(255),
			start_time TIMESTAMP,
			call_type VARCHAR(50),
			chat_type VARCHAR(50),
			participants JSON
		) AS $$
		BEGIN
			RETURN QUERY
			SELECT
				c.id,
				c.chat_id,
				c.start_time,
				c.call_type,
				c.chat_type,
				COALESCE(
					(
						SELECT json_agg(json_build_object(
							'id', cp.user_id,
							'join_time', cp.join_time
						))
						FROM call_participants cp
						WHERE cp.call_id = c.id AND cp.is_active = TRUE
					),
					'[]'::json
				) AS participants
			FROM calls c
			WHERE c.chat_id = p_chat_id AND c.is_active = TRUE
			ORDER BY c.start_time DESC, c.id DESC
			LIMIT 1;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE OR REPLACE FUNCTION join_call(
			p_chat_id VARCHAR(255),
			p_user_id VARCHAR(255),
			p_call_type VARCHAR(50),
			p_chat_type VARCHAR(50)
		) RETURNS TABLE (
			call_id INTEGER,
			start_time TIMESTAMP,
			is_new_call BOOLEAN
		) AS $$
		DECLARE
			v_call_id INTEGER;
			v_start_time TIMESTAMP;
			v_is_new_call BOOLEAN := FALSE;
		BEGIN
			-- Serialize call creation per chat to avoid race conditions creating multiple active calls.
			PERFORM pg_advisory_xact_lock(hashtext(p_chat_id));

			SELECT c.id, c.start_time INTO v_call_id, v_start_time
			FROM calls c
			WHERE c.chat_id = p_chat_id AND c.is_active = TRUE
			ORDER BY c.start_time DESC, c.id DESC
			LIMIT 1;

			IF v_call_id IS NULL THEN
				BEGIN
					INSERT INTO calls (chat_id, start_time, is_active, call_type, chat_type)
					VALUES (p_chat_id, NOW(), TRUE, p_call_type, p_chat_type)
					RETURNING calls.id, calls.start_time INTO v_call_id, v_start_time;

					v_is_new_call := TRUE;
				EXCEPTION WHEN unique_violation THEN
					-- Another transaction may have created a call; fetch it.
					SELECT c.id, c.start_time INTO v_call_id, v_start_time
					FROM calls c
					WHERE c.chat_id = p_chat_id AND c.is_active = TRUE
					ORDER BY c.start_time DESC, c.id DESC
					LIMIT 1;
				END;

			END IF;

			BEGIN
				INSERT INTO call_participants (call_id, user_id, join_time, is_active)
				VALUES (v_call_id, p_user_id, NOW(), TRUE);
			EXCEPTION WHEN unique_violation THEN
				UPDATE call_participants
				SET join_time = NOW(), is_active = TRUE, leave_time = NULL
				WHERE call_participants.call_id = v_call_id AND call_participants.user_id = p_user_id;
			END;

			RETURN QUERY SELECT v_call_id, v_start_time, v_is_new_call;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE OR REPLACE FUNCTION leave_call(
			p_chat_id VARCHAR(255),
			p_user_id VARCHAR(255)
		) RETURNS TABLE (
			call_id INTEGER,
			remaining_participants INTEGER
		) AS $$
			DECLARE
				v_call_id INTEGER;
				v_remaining INTEGER := 0;
			BEGIN
				SELECT c.id INTO v_call_id
				FROM calls c
				WHERE c.chat_id = p_chat_id AND c.is_active = TRUE
				ORDER BY c.start_time DESC, c.id DESC
				LIMIT 1;

			IF v_call_id IS NULL THEN
				RETURN QUERY SELECT 0::INTEGER, 0::INTEGER;
				RETURN;
			END IF;

			UPDATE call_participants cp
			SET is_active = FALSE, leave_time = NOW()
			WHERE cp.call_id = v_call_id AND cp.user_id = p_user_id AND cp.is_active = TRUE;

			SELECT COUNT(*) INTO v_remaining
			FROM call_participants cp
			WHERE cp.call_id = v_call_id AND cp.is_active = TRUE;

			IF v_remaining = 0 THEN
				UPDATE calls c
				SET is_active = FALSE, end_time = NOW()
				WHERE c.id = v_call_id;
			END IF;

			RETURN QUERY SELECT v_call_id, v_remaining;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE OR REPLACE FUNCTION cleanup_stuck_calls() RETURNS VOID AS $$
		BEGIN
			UPDATE calls
			SET is_active = FALSE, end_time = NOW()
			WHERE is_active = TRUE AND start_time < NOW() - INTERVAL '24 hours';

			UPDATE call_participants cp
			SET is_active = FALSE, leave_time = COALESCE(leave_time, NOW())
			FROM calls c
			WHERE cp.call_id = c.id AND cp.is_active = TRUE AND c.is_active = FALSE;
		END;
		$$ LANGUAGE plpgsql`,

		// Unread messages / read status (per user + chat)
		`CREATE TABLE IF NOT EXISTS chat_read_status (
			chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
			user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			last_read_message_id VARCHAR(100) REFERENCES messages(id) ON DELETE SET NULL,
			last_read_at TIMESTAMP NOT NULL DEFAULT NOW(),
			PRIMARY KEY (chat_id, user_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_chat_read_status_user_id ON chat_read_status(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_chat_read_status_chat_id ON chat_read_status(chat_id)`,
		`CREATE INDEX IF NOT EXISTS idx_messages_chat_id_created_at ON messages(chat_id, created_at)`,
		// Seed existing memberships so unread counts start from 0 after adding this feature.
		`INSERT INTO chat_read_status (chat_id, user_id, last_read_message_id, last_read_at)
		 SELECT c.id, unnest(c.users) AS user_id, c.last_message_id, NOW()
		 FROM chats c
		 WHERE c.users IS NOT NULL
		 ON CONFLICT (chat_id, user_id) DO NOTHING`,
	}

	for _, stmt := range stmts {
		if _, err := db.Exec(stmt); err != nil {
			log.Printf("Warning: migration failed (%s): %v", stmt, err)
		}
	}
}
