package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/lib/pq"
	_ "github.com/lib/pq" // Импортируем драйвер для PostgreSQL
)

// Структуры данных
type Chat struct {
	ID           string `json:"id"`
	Tag          string `json:"tag"`
	Name         string `json:"name"`
	ImageSrc     string `json:"imageSrc"`
	LastUserName string `json:"lastUserName"`
	LastMessage  string `json:"lastMessage"`
	UnreadCount  int    `json:"unreadCount"`
	Type         string `json:"type"`
}

type Message struct {
	ID       string  `json:"id"`
	Text     string  `json:"text"`
	Type     string  `json:"type"`
	UserID   *string `json:"userId,omitempty"`
	ImageSrc *string `json:"imageSrc,omitempty"`
}

type RequestMessage struct {
	UserID string `json:"userId"`
	Text   string `json:"text"`
	Type   string `json:"type"`
}

type ChatDetail struct {
	ID                string    `json:"id"`
	Tag               string    `json:"tag"`
	Name              string    `json:"name"`
	ImageSrc          string    `json:"imageSrc"`
	Description       string    `json:"description"`
	CanWrite          bool      `json:"canWrite"`
	UnreadCount       int       `json:"unreadCount"`
	LastReadMessageID *string   `json:"lastReadMessageId,omitempty"`
	Messages          []Message `json:"messages"`
	Users             []User    `json:"users"`
}

func isPrivilegedNewsWriter(db *sql.DB, userID string) bool {
	var tag string
	if err := db.QueryRow("SELECT tag FROM users WHERE id = $1::integer", userID).Scan(&tag); err != nil {
		return false
	}
	return tag == "root" || tag == "nikdimer"
}

func GetChats(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value("userId").(string)
	log.Printf("GetChats called for userID: %s", userID)

	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Println("Error connecting to database:", err)
		http.Error(w, "Error connecting to database", http.StatusInternalServerError)
		return
	}
	defer func() {
		if err := db.Close(); err != nil {
			log.Println("Error closing database connection:", err)
		}
	}()

	// Проверяем подключение к базе данных
	if err := db.Ping(); err != nil {
		log.Println("Error pinging database:", err)
		http.Error(w, "Database connection failed", http.StatusInternalServerError)
		return
	}
	log.Println("Database connection successful")

	chatsQuery := `
	SELECT
		c.id,
		c.tag,
		c.name,
		COALESCE(c.avatar, '') as avatar,
		COALESCE(m.text, 'Нет сообщений') AS last_message,
		COALESCE(u.name, '') AS last_user_name,
		COALESCE((
			SELECT COUNT(*)
			FROM messages m2
			WHERE m2.chat_id = c.id
			AND COALESCE(m2.user_id, -1) <> $1::integer
			AND m2.created_at > COALESCE((
				SELECT crs.last_read_at
				FROM chat_read_status crs
				WHERE crs.chat_id = c.id AND crs.user_id = $1::integer
			), 'epoch'::timestamp)
		), 0) AS unread_count,
		CASE
			WHEN c.name = 'LS Chat' THEN 'ls'
			WHEN COALESCE(c.chat_type, 'chat') = 'channel' THEN 'channel'
			ELSE 'chat'
		END as type,
		c.users
	FROM
		chats c
	LEFT JOIN
		messages m ON c.last_message_id = m.id
	LEFT JOIN
		users u ON m.user_id = u.id
	WHERE
		$1 = ANY(c.users)
	ORDER BY
		CASE WHEN c.id = 1 THEN 0 ELSE 1 END,
		c.updated_at DESC
	`

	log.Printf("Executing query with userID: %s", userID)
	rows, err := db.Query(chatsQuery, userID)
	if err != nil {
		log.Printf("Error executing query for userID %s: %v", userID, err)
		http.Error(w, "Error querying database", http.StatusInternalServerError)
		return
	}
	defer func() {
		if err := rows.Close(); err != nil {
			log.Println("Error closing rows:", err)
		}
	}()

	var chats []Chat
	for rows.Next() {
		var chat Chat
		var users pq.Int64Array
		if err := rows.Scan(&chat.ID, &chat.Tag, &chat.Name, &chat.ImageSrc, &chat.LastMessage, &chat.LastUserName, &chat.UnreadCount, &chat.Type, &users); err != nil {
			log.Println("Error scanning row:", err)
			http.Error(w, "Error scanning row", http.StatusInternalServerError)
			return
		}

		// Для LS чатов динамически устанавливаем имя и аватар собеседника
		if chat.Type == "ls" {
			// Находим ID собеседника (не текущего пользователя)
			var friendID int64
			currentUserIDInt, _ := strconv.ParseInt(userID, 10, 64)
			for _, uid := range users {
				if uid != currentUserIDInt {
					friendID = uid
					break
				}
			}

			// Получаем имя, аватар и тег собеседника
			var friendName, friendAvatar, friendTag string
			err := db.QueryRow(`
				SELECT name, COALESCE(avatar, '') as avatar, tag
				FROM users WHERE id = $1`, friendID).Scan(&friendName, &friendAvatar, &friendTag)
			if err == nil {
				chat.Name = friendName
				chat.ImageSrc = friendAvatar
				// Для LS чатов используем тег друга вместо тега чата
				chat.Tag = friendTag
			}
		}

		// Fix avatar URL path
		if chat.ImageSrc != "" && chat.ImageSrc != "/news_icon.svg" {
			chat.ImageSrc = publicAssetURL(chat.ImageSrc)
		}

		chats = append(chats, chat)
	}

	if rows.Err() != nil {
		log.Println("Error iterating rows:", rows.Err())
		http.Error(w, "Error reading query results", http.StatusInternalServerError)
		return
	}

	log.Printf("Successfully retrieved %d chats for userID: %s", len(chats), userID)

	// Логируем каждый найденный чат
	for i, chat := range chats {
		log.Printf("Chat %d: ID=%s, Name=%s, Type=%s", i+1, chat.ID, chat.Name, chat.Type)
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(chats); err != nil {
		log.Println("Error encoding JSON response:", err)
	}
}

func ifNilString(str *string, defaultVal string) string {
	if str == nil {
		return defaultVal
	}
	return *str
}

func GetChatByTag(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value("userId").(string)
	tag := r.URL.Query().Get("tag")
	log.Printf("GetChatByTag called for userID: %s, tag: '%s', full URL: %s", userID, tag, r.URL.String())
	if tag == "" {
		log.Printf("Tag is required but not provided. URL: %s, Query: %v", r.URL.String(), r.URL.Query())
		http.Error(w, "Tag is required", http.StatusBadRequest)
		return
	}

	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Println("Error connecting to database:", err)
		http.Error(w, "Error connecting to database", http.StatusInternalServerError)
		return
	}
	defer func() {
		if err := db.Close(); err != nil {
			log.Println("Error closing database connection:", err)
		}
	}()

	var chatID int
	err = db.QueryRow(`
		SELECT c.id
		FROM chats c
		WHERE c.tag = $1 AND $2 = ANY (SELECT unnest(c.users))`, tag, userID).Scan(&chatID)
	if err != nil {
		if err == sql.ErrNoRows {
			log.Println("Access denied or chat not found")
			http.Error(w, "Access denied or chat not found", http.StatusForbidden)
			return
		}
		log.Println("Error querying database:", err)
		http.Error(w, "Error querying database", http.StatusInternalServerError)
		return
	}

	var chatDetail ChatDetail
	var chatType sql.NullString
	var ownerID sql.NullInt64
	if err := db.QueryRow(`SELECT id, tag, name, avatar, description, chat_type, owner_id FROM chats WHERE id = $1`, chatID).Scan(
		&chatDetail.ID, &chatDetail.Tag, &chatDetail.Name, &chatDetail.ImageSrc, &chatDetail.Description, &chatType, &ownerID); err != nil {
		log.Println("Error querying chat details:", err)
		http.Error(w, "Error querying chat details", http.StatusInternalServerError)
		return
	}

	chatDetail.CanWrite = true
	if chatType.Valid && chatType.String == "channel" {
		chatDetail.CanWrite = ownerID.Valid && strconv.FormatInt(ownerID.Int64, 10) == userID
		if !chatDetail.CanWrite && chatDetail.Tag == "news" && isPrivilegedNewsWriter(db, userID) {
			chatDetail.CanWrite = true
		}
	}

	// Fix avatar URL path
	if chatDetail.ImageSrc != "" && chatDetail.ImageSrc != "/news_icon.svg" {
		chatDetail.ImageSrc = publicAssetURL(chatDetail.ImageSrc)
	}

	if err := GetMessagesForChat(db, chatID, &chatDetail.Messages); err != nil {
		log.Println("Error querying messages for chat:", err)
		http.Error(w, "Error querying messages", http.StatusInternalServerError)
		return
	}
	if err := GetUsersForChat(db, chatID, &chatDetail.Users); err != nil {
		log.Println("Error querying users for chat:", err)
		http.Error(w, "Error querying users", http.StatusInternalServerError)
		return
	}

	// Populate read status for unread divider/badges.
	if userIDInt, err := strconv.Atoi(userID); err == nil {
		var lastReadMessageID sql.NullString
		var lastReadAt sql.NullTime
		effectiveLastReadAt := time.Unix(0, 0)

		if err := db.QueryRow(`
			SELECT last_read_message_id, last_read_at
			FROM chat_read_status
			WHERE chat_id = $1 AND user_id = $2
		`, chatID, userIDInt).Scan(&lastReadMessageID, &lastReadAt); err == nil {
			if lastReadMessageID.Valid && lastReadMessageID.String != "" {
				chatDetail.LastReadMessageID = &lastReadMessageID.String
			}

			if lastReadAt.Valid {
				effectiveLastReadAt = lastReadAt.Time
			}
		}

		var unreadCount int
		if err := db.QueryRow(`
			SELECT COUNT(*)
			FROM messages m
			WHERE m.chat_id = $1
			  AND COALESCE(m.user_id, -1) <> $2
			  AND m.created_at > $3
		`, chatID, userIDInt, effectiveLastReadAt).Scan(&unreadCount); err == nil {
			chatDetail.UnreadCount = unreadCount
		}
	}

	log.Printf("Successfully retrieved details for chatID: %d\n", chatID)
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(chatDetail); err != nil {
		log.Println("Error encoding JSON response:", err)
	}
}

func GetMessagesForChat(db *sql.DB, chatID int, messages *[]Message) error {
	log.Printf("Fetching messages for chatID: %d\n", chatID)

	var lastMessageID *string
	err := db.QueryRow(`SELECT last_message_id FROM chats WHERE id = $1`, chatID).Scan(&lastMessageID)
	if err != nil {
		log.Println("Error fetching last message ID:", err)
		return err
	}

	if lastMessageID == nil {
		log.Printf("No messages found for chatID: %d\n", chatID)
		return nil
	}

	err = fetchMessagesRecursive(db, *lastMessageID, messages)
	if err != nil {
		log.Println("Error fetching message chain:", err)
		return err
	}

	log.Printf("Successfully fetched %d messages for chatID: %d\n", len(*messages), chatID)
	return nil
}

func fetchMessagesRecursive(db *sql.DB, messageID string, messages *[]Message) error {
	log.Printf("Fetching message with ID: %s\n", messageID)

	messageQuery := `
	SELECT id, text, type, user_id, image_src, prev_message_id
	FROM messages
	WHERE id = $1`

	var message Message
	var prevMessageID *string
	err := db.QueryRow(messageQuery, messageID).Scan(&message.ID, &message.Text, &message.Type, &message.UserID, &message.ImageSrc, &prevMessageID)
	if err != nil {
		log.Println("Error fetching message details:", err)
		return err
	}

	*messages = append([]Message{message}, *messages...) // Добавляем в начало списка

	if prevMessageID != nil {
		return fetchMessagesRecursive(db, *prevMessageID, messages)
	}

	log.Printf("Message chain completed for starting message ID: %s\n", messageID)
	return nil
}

func GetUsersForChat(db *sql.DB, chatID int, users *[]User) error {
	log.Printf("Fetching users for chatID: %d\n", chatID)

	usersQuery := `
	SELECT id, name, tag, description, avatar
	FROM users
	WHERE id = ANY (SELECT unnest(users) FROM chats WHERE id = $1)`

	usrRows, err := db.Query(usersQuery, chatID)
	if err != nil {
		log.Println("Error executing users query:", err)
		return err
	}
	defer func() {
		if err := usrRows.Close(); err != nil {
			log.Println("Error closing users rows:", err)
		}
	}()

	for usrRows.Next() {
		var user User
		var description sql.NullString

		if err := usrRows.Scan(&user.ID, &user.Name, &user.Tag, &description, &user.ImageSrc); err != nil {
			log.Println("Error scanning user row:", err)
			return err
		}

		if description.Valid {
			user.Description = description.String
		} else {
			user.Description = ""
		}

		*users = append(*users, user)
	}

	if err = usrRows.Err(); err != nil {
		log.Println("Error iterating over user rows:", err)
		return err
	}

	log.Printf("Successfully retrieved %d users for chatID: %d\n", len(*users), chatID)
	return nil
}

func AddMessage(w http.ResponseWriter, r *http.Request) {
	log.Println("Received request to add a message")

	var requestBody struct {
		ChatID  string `json:"chatID"`
		Message struct {
			Text string `json:"text"`
			Type string `json:"type"`
		} `json:"message"`
	}

	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		log.Println("Error decoding request body:", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	userID, ok := r.Context().Value("userId").(string)
	if userID == "" {
		log.Println("UserID is missing in the request")
		http.Error(w, "User not authenticated", http.StatusUnauthorized)
		return
	}
	if !ok {
		http.Error(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	if requestBody.Message.Text == "" {
		log.Println("Message text is empty")
		http.Error(w, "Message text cannot be empty", http.StatusBadRequest)
		return
	}

	chatID := requestBody.ChatID
	if chatID == "" {
		log.Println("ChatID is missing in the request")
		http.Error(w, "ChatID is required", http.StatusBadRequest)
		return
	}

	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Println("Error connecting to database:", err)
		http.Error(w, "Error connecting to database", http.StatusInternalServerError)
		return
	}
	defer func() {
		if err := db.Close(); err != nil {
			log.Println("Error closing database connection:", err)
		}
	}()

	log.Printf("AddMessage: Checking if chat exists with ID: %s", chatID)
	var existingChatID string
	err = db.QueryRow("SELECT id FROM chats WHERE id = $1", chatID).Scan(&existingChatID)
	if err != nil {
		if err == sql.ErrNoRows {
			log.Printf("AddMessage: Chat with ID %s not found", chatID)
			// Проверяем, является ли это виртуальным LS чатом (chatID = "0")
			if chatID == "0" {
				log.Printf("AddMessage: Detected virtual LS chat, creating real chat")
				// Получаем информацию о получателе из заголовка запроса
				friendTag := r.Header.Get("X-Friend-Tag")
				log.Printf("AddMessage: Friend tag from header: '%s'", friendTag)
				if friendTag == "" {
					log.Printf("AddMessage: Friend tag is required for creating LS chat")
					http.Error(w, "Friend tag is required for LS chat", http.StatusBadRequest)
					return
				}

				// Создаем реальный LS чат встроенной логикой
				// Ensure users are friends before creating LS chat / sending first message
				currentUserID, parseErr := strconv.Atoi(userID)
				if parseErr != nil {
					http.Error(w, "Invalid user ID", http.StatusBadRequest)
					return
				}
				var friendID int
				if err := db.QueryRow(`SELECT id FROM users WHERE tag = $1`, friendTag).Scan(&friendID); err != nil {
					http.Error(w, "Friend not found", http.StatusNotFound)
					return
				}
				var areFriends bool
				if err := db.QueryRow(`
					SELECT EXISTS(
						SELECT 1 FROM users
						WHERE id = $1 AND $2 = ANY(friends_list)
					)`, currentUserID, friendID).Scan(&areFriends); err != nil {
					http.Error(w, "Error checking friendship", http.StatusInternalServerError)
					return
				}
				if !areFriends {
					http.Error(w, "Friendship required for LS chat", http.StatusForbidden)
					return
				}

				log.Printf("AddMessage: Calling createLSChatInline with userID: %s, friendTag: %s", userID, friendTag)
				realChatID, err := createLSChatInline(db, userID, friendTag)
				if err != nil {
					log.Printf("AddMessage: Error creating LS chat: %v", err)
					http.Error(w, "Error creating LS chat", http.StatusInternalServerError)
					return
				}
				chatID = strconv.Itoa(realChatID)
				log.Printf("AddMessage: Successfully created real LS chat with ID: %s", chatID)
			} else {
				log.Printf("AddMessage: ChatID %s not found and not virtual LS chat", chatID)
				http.Error(w, "Chat not found", http.StatusNotFound)
				return
			}
		} else {
			log.Printf("AddMessage: Error querying chat existence: %v", err)
			http.Error(w, "Error querying database", http.StatusInternalServerError)
			return
		}
	} else {
		log.Printf("AddMessage: Found existing chat with ID: %s", existingChatID)
	}

	var isUserInChat bool
	err = db.QueryRow(
		"SELECT EXISTS(SELECT 1 FROM chats WHERE id = $1 AND $2 = ANY(users))",
		chatID, userID,
	).Scan(&isUserInChat)
	if err != nil {
		log.Println("Error checking user membership:", err)
		http.Error(w, "Error checking user membership", http.StatusInternalServerError)
		return
	}
	if !isUserInChat {
		log.Printf("User %s is not a member of chat %s\n", userID, chatID)
		http.Error(w, "You do not have permission to send messages in this chat", http.StatusForbidden)
		return
	}

	// For channels: only owner can post.
	var chatType sql.NullString
	var ownerID sql.NullInt64
	var chatTag string
	if err := db.QueryRow("SELECT chat_type, owner_id, tag FROM chats WHERE id = $1", chatID).Scan(&chatType, &ownerID, &chatTag); err == nil {
		if chatType.Valid && chatType.String == "channel" {
			canWrite := ownerID.Valid && strconv.FormatInt(ownerID.Int64, 10) == userID
			if !canWrite && chatTag == "news" && isPrivilegedNewsWriter(db, userID) {
				canWrite = true
			}
			if !canWrite {
				http.Error(w, "Channel is read-only", http.StatusForbidden)
				return
			}
		}
	} else {
		log.Printf("Warning: could not fetch chat_type/owner_id for chat %s: %v", chatID, err)
	}

	// For LS chats: if friendship is removed, forbid sending (read-only).
	var chatName string
	var chatUsers pq.Int64Array
	if err := db.QueryRow("SELECT name, users FROM chats WHERE id = $1", chatID).Scan(&chatName, &chatUsers); err == nil {
		if chatName == "LS Chat" && len(chatUsers) == 2 {
			currentUserID, parseErr := strconv.ParseInt(userID, 10, 64)
			if parseErr == nil {
				var otherID int64
				for _, uid := range chatUsers {
					if uid != currentUserID {
						otherID = uid
						break
					}
				}
				if otherID != 0 {
					var areFriends bool
					if err := db.QueryRow(`
						SELECT EXISTS(
							SELECT 1 FROM users
							WHERE id = $1 AND $2 = ANY(friends_list)
						)`, currentUserID, otherID).Scan(&areFriends); err == nil && !areFriends {
						http.Error(w, "Friendship ended: LS chat is read-only", http.StatusForbidden)
						return
					}
				}
			}
		}
	}

	var lastMessageID sql.NullString
	err = db.QueryRow("SELECT last_message_id FROM chats WHERE id = $1", chatID).Scan(&lastMessageID)
	if err != nil {
		log.Println("Error getting last message ID:", err)
		http.Error(w, "Error querying database", http.StatusInternalServerError)
		return
	}

	var prevMessageID *string
	if lastMessageID.Valid {
		prevMessageID = &lastMessageID.String
	}

	var newMessageID string
	err = db.QueryRow(
		`INSERT INTO messages (text, type, user_id, chat_id, prev_message_id)
		VALUES ($1, 'user', $2, $3, $4) RETURNING id`,
		requestBody.Message.Text, userID, chatID, prevMessageID).Scan(&newMessageID)
	if err != nil {
		log.Println("Error inserting message into database:", err)
		http.Error(w, "Error inserting message", http.StatusInternalServerError)
		return
	}

	_, err = db.Exec("UPDATE chats SET last_message_id = $1, last_user_id = $2 WHERE id = $3", newMessageID, userID, chatID)
	if err != nil {
		log.Println("Error updating chat's last message ID:", err)
		http.Error(w, "Error updating chat data", http.StatusInternalServerError)
		return
	}

	// Отправляем WebSocket уведомление о новом сообщении
	if wsHub != nil {
		// Получаем информацию о пользователе для WebSocket сообщения
		var userName string
		err = db.QueryRow("SELECT name FROM users WHERE id = $1", userID).Scan(&userName)
		if err != nil {
			log.Printf("Warning: Could not get user name for WebSocket: %v", err)
			userName = "Unknown User"
		}

		// Создаем WebSocket сообщение
		wsMessage := WSMessage{
			Type:   MessageTypeNewMessage,
			ChatID: chatID,
			UserID: userID,
			Data: MessageData{
				ID:       newMessageID,
				Text:     requestBody.Message.Text,
				UserID:   userID,
				UserName: userName,
				ChatID:   chatID,
				SentAt:   time.Now().Unix(),
			},
			Timestamp: time.Now().Unix(),
		}

		// Отправляем сообщение в чат
		wsHub.SendToChat(chatID, wsMessage)
		log.Printf("WebSocket notification sent for new message in chat %s", chatID)

		// Notify all chat participants so their chat lists can refresh (important for LS).
		var chatUsers pq.Int64Array
		if err := db.QueryRow("SELECT users FROM chats WHERE id = $1", chatID).Scan(&chatUsers); err != nil {
			log.Printf("Warning: Could not fetch chat users for chat_updated: %v", err)
		} else {
			for _, uid := range chatUsers {
				wsHub.SendToUser(strconv.FormatInt(uid, 10), WSMessage{
					Type:   MessageTypeChatUpdated,
					ChatID: chatID,
				})
			}
		}
	}

	log.Printf("Message added successfully to chatID: %s by userID: %s\n", chatID, userID)
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]string{"message": "Message added successfully"}); err != nil {
		log.Println("Error encoding JSON response:", err)
	}
}

// createLSChatInline создает реальный LS чат в базе данных при отправке первого сообщения
func createLSChatInline(db *sql.DB, userID string, friendTag string) (int, error) {
	log.Printf("createLSChatInline: Starting creation for user %s and friend %s", userID, friendTag)

	// Получаем ID и аватар друга
	var friendID int
	var friendName, friendAvatar string
	log.Printf("createLSChatInline: Querying friend data for tag: %s", friendTag)
	err := db.QueryRow(`
		SELECT id, name, COALESCE(avatar, '') as avatar FROM users
		WHERE tag = $1`, friendTag).Scan(&friendID, &friendName, &friendAvatar)
	if err != nil {
		log.Printf("createLSChatInline: Error getting friend data: %v", err)
		return 0, err
	}
	log.Printf("createLSChatInline: Found friend - ID: %d, Name: %s, Avatar: %s", friendID, friendName, friendAvatar)

	currentUserID, parseErr := strconv.Atoi(userID)
	if parseErr != nil {
		log.Printf("createLSChatInline: Error parsing userID: %v", parseErr)
		return 0, parseErr
	}
	log.Printf("createLSChatInline: Current user ID: %d", currentUserID)

	// Сначала проверяем, существует ли уже LS чат между этими пользователями
	var existingChatID int
	err = db.QueryRow(`
		SELECT id FROM chats
		WHERE $1 = ANY(users) AND $2 = ANY(users)
		AND array_length(users, 1) = 2
		AND name = 'LS Chat'`, currentUserID, friendID).Scan(&existingChatID)
	if err == nil {
		log.Printf("createLSChatInline: Found existing LS chat with ID: %d", existingChatID)
		return existingChatID, nil
	} else if err != sql.ErrNoRows {
		log.Printf("createLSChatInline: Error checking existing LS chat: %v", err)
		return 0, err
	}

	log.Printf("createLSChatInline: No existing LS chat found, creating new one")

	// Создаем случайный тег для LS чата из 10 символов
	lsTag := generateRandomTag(10)
	log.Printf("createLSChatInline: Generated LS tag: %s", lsTag)

	// Создаем чат в базе данных без конкретного имени и аватара
	var chatID int
	log.Printf("createLSChatInline: Inserting chat into database...")
	err = db.QueryRow(`
		INSERT INTO chats (name, tag, description, users)
		VALUES ('LS Chat', $1, 'Личные сообщения', ARRAY[$2::integer, $3::integer])
		RETURNING id`,
		lsTag, currentUserID, friendID).Scan(&chatID)
	if err != nil {
		log.Printf("createLSChatInline: Error inserting chat: %v", err)
		return 0, err
	}

	log.Printf("createLSChatInline: Successfully created real LS chat with ID: %d", chatID)
	return chatID, nil
}

// generateRandomTag генерирует случайную строку из цифр и букв указанной длины
func generateRandomTag(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"

	// Инициализируем генератор случайных чисел
	rand.Seed(time.Now().UnixNano())

	result := make([]byte, length)
	for i := range result {
		result[i] = charset[rand.Intn(len(charset))]
	}
	return string(result)
}
