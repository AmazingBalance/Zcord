package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"

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

type User struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	ImageSrc    *string `json:"imageSrc,omitempty"`
	Tag         string  `json:"tag"`
	Description string  `json:"description"`
}

type ChatDetail struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	ImageSrc    string    `json:"imageSrc"`
	Description string    `json:"description"`
	Messages    []Message `json:"messages"`
	Users       []User    `json:"users"`
}

func GetChats(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value("userId").(string)

	db, err := sql.Open("postgres", "host=localhost port=5435 user=nikdimer dbname=zcord password=technocraft2000 sslmode=disable")
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

	chatsQuery := `
	SELECT
		c.id,
		c.tag,
		c.name,
		c.avatar,
		m.text AS last_message,
		u.name AS last_user_name
	FROM
		chats c
	LEFT JOIN
		messages m ON c.last_message_id = m.id
	LEFT JOIN
		users u ON m.user_id = u.id
	WHERE
		$1 = ANY(c.users)
	`

	rows, err := db.Query(chatsQuery, userID)
	if err != nil {
		log.Println("Error executing query:", err)
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
		var lastMessage *string
		var lastUserName *string
		if err := rows.Scan(&chat.ID, &chat.Tag, &chat.Name, &chat.ImageSrc, &lastMessage, &lastUserName); err != nil {
			log.Println("Error scanning row:", err)
			http.Error(w, "Error scanning row", http.StatusInternalServerError)
			return
		}

		chat.LastMessage = ifNilString(lastMessage, "Нет сообщений")
		chat.LastUserName = ifNilString(lastUserName, "")
		chats = append(chats, chat)
	}

	if rows.Err() != nil {
		log.Println("Error iterating rows:", rows.Err())
		http.Error(w, "Error reading query results", http.StatusInternalServerError)
		return
	}

	log.Printf("Successfully retrieved %d chats for userID: %s\n", len(chats), userID)
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
	if tag == "" {
		log.Println("Tag is required but not provided")
		http.Error(w, "Tag is required", http.StatusBadRequest)
		return
	}

	db, err := sql.Open("postgres", "host=localhost port=5435 user=nikdimer dbname=zcord password=technocraft2000 sslmode=disable")
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
	if err := db.QueryRow(`SELECT id, name, avatar, description FROM chats WHERE id = $1`, chatID).Scan(
		&chatDetail.ID, &chatDetail.Name, &chatDetail.ImageSrc, &chatDetail.Description); err != nil {
		log.Println("Error querying chat details:", err)
		http.Error(w, "Error querying chat details", http.StatusInternalServerError)
		return
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
			UserID string `json:"userId"`
			Text   string `json:"text"`
			Type   string `json:"type"`
		} `json:"message"`
	}

	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		log.Println("Error decoding request body:", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	userID := requestBody.Message.UserID
	if userID == "" {
		log.Println("UserID is missing in the request")
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

	db, err := sql.Open("postgres", "host=localhost port=5435 user=nikdimer dbname=zcord password=technocraft2000 sslmode=disable")
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

	var existingChatID string
	err = db.QueryRow("SELECT id FROM chats WHERE id = $1", chatID).Scan(&existingChatID)
	if err != nil {
		if err == sql.ErrNoRows {
			log.Printf("ChatID %s not found\n", chatID)
			http.Error(w, "Chat not found", http.StatusNotFound)
			return
		}
		log.Println("Error querying chat existence:", err)
		http.Error(w, "Error querying database", http.StatusInternalServerError)
		return
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

	var lastMessageID string
	err = db.QueryRow("SELECT last_message_id FROM chats WHERE id = $1", chatID).Scan(&lastMessageID)
	if err != nil && err != sql.ErrNoRows {
		log.Println("Error getting last message ID:", err)
		http.Error(w, "Error querying database", http.StatusInternalServerError)
		return
	}

	var newMessageID string
	err = db.QueryRow(
		`INSERT INTO messages (text, type, user_id, chat_id, prev_message_id)
		VALUES ($1, 'user', $2, $3, $4) RETURNING id`,
		requestBody.Message.Text, userID, chatID, lastMessageID).Scan(&newMessageID)
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

	log.Printf("Message added successfully to chatID: %s by userID: %s\n", chatID, userID)
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]string{"message": "Message added successfully"}); err != nil {
		log.Println("Error encoding JSON response:", err)
	}
}
