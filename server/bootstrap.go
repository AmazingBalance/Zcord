package main

import (
	"database/sql"
	"log"
	"os"
	"strings"
)

const (
	newsChatID          = 1
	newsChatTag         = "news"
	newsChatName        = "Новости Zcord"
	newsChatAvatar      = "/news_icon.svg"
	newsChatDescription = "Официальный канал новостей мессенджера Zcord"
)

func ensureBootstrap() {
	if strings.EqualFold(os.Getenv("BOOTSTRAP_DISABLE"), "true") {
		return
	}

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Println("Warning: DATABASE_URL is empty; skipping bootstrap")
		return
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Printf("Warning: bootstrap DB open failed: %v", err)
		return
	}
	defer func() {
		if err := db.Close(); err != nil {
			log.Printf("Warning: bootstrap DB close failed: %v", err)
		}
	}()

	if err := db.Ping(); err != nil {
		log.Printf("Warning: bootstrap DB ping failed: %v", err)
		return
	}

	if err := ensureNewsChannel(db); err != nil {
		log.Printf("Warning: ensureNewsChannel failed: %v", err)
	}
	if err := ensureNewsMessages(db); err != nil {
		log.Printf("Warning: ensureNewsMessages failed: %v", err)
	}

	rootID, err := ensureBootstrapUser(db, bootstrapUserSpec{
		tag:         "root",
		name:        "root",
		email:       getEnvOrDefault("BOOTSTRAP_ROOT_EMAIL", "nikdm.gm@gmail.com"),
		passwordEnv: "BOOTSTRAP_ROOT_PASSWORD",
	})
	if err != nil {
		log.Printf("Warning: bootstrap root user failed: %v", err)
	}

	nikdimerID, err := ensureBootstrapUser(db, bootstrapUserSpec{
		tag:         "nikdimer",
		name:        "nikdimer",
		email:       getEnvOrDefault("BOOTSTRAP_NIKDIMER_EMAIL", "nikdimer@yandex.ru"),
		passwordEnv: "BOOTSTRAP_NIKDIMER_PASSWORD",
	})
	if err != nil {
		log.Printf("Warning: bootstrap nikdimer user failed: %v", err)
	}

	for _, uid := range []int{rootID, nikdimerID} {
		if uid <= 0 {
			continue
		}
		if err := ensureUserSubscribedToNews(db, uid); err != nil {
			log.Printf("Warning: ensureUserSubscribedToNews(%d) failed: %v", uid, err)
		}
	}
}

type bootstrapUserSpec struct {
	tag         string
	name        string
	email       string
	passwordEnv string
}

func ensureBootstrapUser(db *sql.DB, spec bootstrapUserSpec) (int, error) {
	var existingID int
	err := db.QueryRow(`SELECT id FROM users WHERE tag = $1`, spec.tag).Scan(&existingID)
	if err == nil {
		// Ensure email is set (do not override non-empty email).
		if spec.email != "" {
			if _, err := db.Exec(`UPDATE users SET email = $1 WHERE id = $2 AND (email IS NULL OR email = '')`, spec.email, existingID); err != nil {
				log.Printf("Warning: could not backfill email for %s: %v", spec.tag, err)
			}
		}
		return existingID, nil
	}
	if err != sql.ErrNoRows {
		return 0, err
	}

	password := os.Getenv(spec.passwordEnv)
	if password == "" {
		log.Printf("Bootstrap user '%s' is missing: set %s to create it", spec.tag, spec.passwordEnv)
		return 0, nil
	}
	if len(password) < 8 {
		log.Printf("Bootstrap password for '%s' is too short (< 8), skipping creation", spec.tag)
		return 0, nil
	}

	hashed, err := hashPassword(password)
	if err != nil {
		return 0, err
	}

	var id int
	if err := db.QueryRow(
		`INSERT INTO users (name, email, tag, password) VALUES ($1, $2, $3, $4) RETURNING id`,
		spec.name, spec.email, spec.tag, hashed,
	).Scan(&id); err != nil {
		return 0, err
	}
	log.Printf("Bootstrap user created: tag=%s id=%d", spec.tag, id)
	return id, nil
}

func ensureNewsChannel(db *sql.DB) error {
	var exists bool
	if err := db.QueryRow(`SELECT EXISTS(SELECT 1 FROM chats WHERE id = $1)`, newsChatID).Scan(&exists); err != nil {
		return err
	}
	if exists {
		// Ensure tag/name/metadata are correct.
		_, err := db.Exec(`
			UPDATE chats
			SET name = $2, tag = $3, chat_type = 'channel', owner_id = NULL, avatar = $4, description = $5
			WHERE id = $1
		`, newsChatID, newsChatName, newsChatTag, newsChatAvatar, newsChatDescription)
		return err
	}

	_, err := db.Exec(`
		INSERT INTO chats (id, name, tag, chat_type, owner_id, avatar, description, users)
		VALUES ($1, $2, $3, 'channel', NULL, $4, $5, '{}')
	`, newsChatID, newsChatName, newsChatTag, newsChatAvatar, newsChatDescription)
	return err
}

func ensureNewsMessages(db *sql.DB) error {
	var any bool
	if err := db.QueryRow(`SELECT EXISTS(SELECT 1 FROM messages WHERE chat_id = $1)`, newsChatID).Scan(&any); err != nil {
		return err
	}
	if any {
		return nil
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	seed := []struct {
		id      string
		msgType string
		text    string
		image   *string
		prev    *string
		created string
	}{
		{
			id:      "a187fca1-5bd6-47a8-bc8f-5be435ae3f53",
			msgType: "system",
			text:    "Добро пожаловать в Новости Zcord!",
			created: "2025-12-26 00:30:40.524934",
		},
		{
			id:      "809725ea-3e7c-498e-80ce-3dfbabf9ca07",
			msgType: "system",
			text:    "Здесь будут публиковаться обновления и важные объявления.",
			prev:    ptr("a187fca1-5bd6-47a8-bc8f-5be435ae3f53"),
			created: "2025-12-26 00:30:40.524934",
		},
		{
			id:      "6f4237a7-7a66-4dda-baf9-a7c881ffd82d",
			msgType: "system",
			text:    "Первый пост: проект успешно запускается на Podman.",
			prev:    ptr("809725ea-3e7c-498e-80ce-3dfbabf9ca07"),
			created: "2025-12-26 00:30:40.524934",
		},
		{
			id:      "ee451a1b-7e57-4130-b37d-23f2e7402607",
			msgType: "user",
			text: "v1.0 — Вы в безопасности\n\n" +
				"Всем привет! Это самая первая версия приложения, всё сырое, но сообщения писать можно и я считаю это круто.\n" +
				"Проект находится в тестовом состоянии, постепенно буду пилить новые фичи и выкладывать новости о них сюда, многое предстоит сделать до первого релиза.\n\n" +
				"С прошедшим Новым Годом, ещё увидимся :)",
			image:   ptr("https://i.postimg.cc/DzLfkYFQ/2017-Nature-Beautiful-clouds-reflected-in-the-blue-water-of-the-ocean-115872.jpg"),
			prev:    ptr("6f4237a7-7a66-4dda-baf9-a7c881ffd82d"),
			created: "2025-12-26 01:48:51.509476",
		},
	}

	for _, m := range seed {
		if _, err := tx.Exec(`
			INSERT INTO messages (id, text, type, user_id, chat_id, image_src, prev_message_id, created_at)
			VALUES ($1, $2, $3, NULL, $4, $5, $6, $7)
		`, m.id, m.text, m.msgType, newsChatID, m.image, m.prev, m.created); err != nil {
			return err
		}
	}

	lastID := seed[len(seed)-1].id
	if _, err := tx.Exec(`UPDATE chats SET last_message_id = $1, last_user_id = NULL WHERE id = $2`, lastID, newsChatID); err != nil {
		return err
	}

	return tx.Commit()
}

func ensureUserSubscribedToNews(db *sql.DB, userID int) error {
	// Ensure membership.
	if _, err := db.Exec(
		`UPDATE chats SET users = array_append(users, $1) WHERE id = $2 AND NOT ($1 = ANY(users))`,
		userID, newsChatID,
	); err != nil {
		return err
	}

	// Ensure read status exists (unread counts should start from 0).
	if _, err := db.Exec(`
		INSERT INTO chat_read_status (chat_id, user_id, last_read_message_id, last_read_at)
		SELECT $2, $1, c.last_message_id, NOW()
		FROM chats c
		WHERE c.id = $2
		ON CONFLICT (chat_id, user_id) DO UPDATE
		SET last_read_message_id = EXCLUDED.last_read_message_id,
		    last_read_at = EXCLUDED.last_read_at
	`, userID, newsChatID); err != nil {
		return err
	}

	return nil
}

func ptr[T any](v T) *T { return &v }

