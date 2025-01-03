package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	_ "github.com/lib/pq" // Импортируем драйвер для PostgreSQL
)

// Структуры данных
type Chat struct {
    ID          string `json:"id"`
    Tag         string `json:"tag"`
    Name        string `json:"name"`
    ImageSrc    string `json:"imageSrc"`
    LastUserName string `json:"lastUserName"`
    LastMessage  string `json:"lastMessage"`
}

type Message struct {
    ID        string  `json:"id"`
    Text      string  `json:"text"`
    Type      string  `json:"type"`
    UserID    *string `json:"userId,omitempty"`
    ImageSrc  *string `json:"imageSrc,omitempty"`
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
    userID := r.Context().Value("userId").(string) // Получаем ID пользователя из контекста

    db, err := sql.Open("postgres", "host=localhost port=5435 user=nikdimer dbname=zcord password=technocraft2000 sslmode=disable")
    if err != nil {
        http.Error(w, "Error connecting to database", http.StatusInternalServerError)
        return
    }
    defer db.Close()

    // Запрос с фильтрацией по пользователю
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
        users u ON m.user_id = u.id  -- Получаем имя пользователя, который написал последнее сообщение
    WHERE 
        $1 = ANY(c.users)  -- Проверяем, состоит ли пользователь в чате
    `

    rows, err := db.Query(chatsQuery, userID)
    if err != nil {
        http.Error(w, "Error querying database", http.StatusInternalServerError)
        return
    }
    defer rows.Close()

    var chats []Chat
    for rows.Next() {
        var chat Chat
        var lastMessage *string
        var lastUserName *string
        if err := rows.Scan(&chat.ID, &chat.Tag, &chat.Name, &chat.ImageSrc, &lastMessage, &lastUserName); err != nil {
            http.Error(w, "Error scanning row", http.StatusInternalServerError)
            return
        }

        chat.LastMessage = ifNilString(lastMessage, "Нет сообщений")
        chat.LastUserName = ifNilString(lastUserName, "")
        chats = append(chats, chat)
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(chats)
}

func ifNilString(str *string, defaultVal string) string {
    if str == nil {
        return defaultVal
    }
    return *str
}


// Функция для получения чата по тегу
func GetChatByTag(w http.ResponseWriter, r *http.Request) {
    userID := r.Context().Value("userId").(string)
    tag := r.URL.Query().Get("tag")
    if tag == "" {
        http.Error(w, "Tag is required", http.StatusBadRequest)
        return
    }

    db, err := sql.Open("postgres", "host=localhost port=5435 user=nikdimer dbname=zcord password=technocraft2000 sslmode=disable")
    if err != nil {
        http.Error(w, "Error connecting to database", http.StatusInternalServerError)
        return
    }
    defer db.Close()

    // Проверяем, состоит ли пользователь в чате
    var chatID int
    err = db.QueryRow(`
        SELECT c.id 
        FROM chats c
        WHERE c.tag = $1 AND $2 = ANY (SELECT unnest(c.users))`, tag, userID).Scan(&chatID)
    if err != nil {
        if err == sql.ErrNoRows {
            http.Error(w, "Access denied or chat not found", http.StatusForbidden)
            return
        }
        http.Error(w, "Error querying database", http.StatusInternalServerError)
        return
    }

    // Получение деталей чата
    var chatDetail ChatDetail
    if err := db.QueryRow(`SELECT id, name, avatar, description FROM chats WHERE id = $1`, chatID).Scan(
        &chatDetail.ID, &chatDetail.Name, &chatDetail.ImageSrc, &chatDetail.Description); err != nil {
        http.Error(w, "Error querying chat details", http.StatusInternalServerError)
        return
    }

    // Получаем сообщения и пользователей
    if err := GetMessagesForChat(db, chatID, &chatDetail.Messages); err != nil {
		log.Printf("wtf messages\n")
        http.Error(w, "Error querying messages", http.StatusInternalServerError)
        return
    }
    if err := GetUsersForChat(db, chatID, &chatDetail.Users); err != nil {
		log.Printf("wtf users\n")
        http.Error(w, "Error querying users", http.StatusInternalServerError)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(chatDetail)
}

// Функция для получения сообщений чата
func GetMessagesForChat(db *sql.DB, chatID int, messages *[]Message) error {
    // Сначала получаем ID последнего сообщения в чате
    var lastMessageID *string
    err := db.QueryRow(`SELECT last_message_id FROM chats WHERE id = $1`, chatID).Scan(&lastMessageID)
    if err != nil {
        return err
    }

    // Если в чате нет сообщений (last_message_id == NULL), то просто возвращаем пустой список
    if lastMessageID == nil {
        return nil
    }

    // Рекурсивно восстанавливаем цепочку сообщений
    return fetchMessagesRecursive(db, *lastMessageID, messages)
}

// Рекурсивная функция для восстановления сообщений
func fetchMessagesRecursive(db *sql.DB, messageID string, messages *[]Message) error {
    // Запрос для получения информации о сообщении
    messageQuery := `
        SELECT id, text, type, user_id, image_src, prev_message_id
        FROM messages 
        WHERE id = $1`
    
    var message Message
    var prevMessageID *string
    err := db.QueryRow(messageQuery, messageID).Scan(&message.ID, &message.Text, &message.Type, &message.UserID, &message.ImageSrc, &prevMessageID)
    if err != nil {
        return err
    }

    // Добавляем текущее сообщение в список
    *messages = append([]Message{message}, *messages...) // Добавляем в начало списка

    // Если у сообщения есть предыдущее сообщение, продолжаем рекурсию
    if prevMessageID != nil {
        return fetchMessagesRecursive(db, *prevMessageID, messages)
    }

    return nil
}


func GetUsersForChat(db *sql.DB, chatID int, users *[]User) error {
    usersQuery := `
        SELECT id, name, tag, description, avatar 
        FROM users 
        WHERE id = ANY (SELECT unnest(users) FROM chats WHERE id = $1)`
    
    usrRows, err := db.Query(usersQuery, chatID)
    if err != nil {
        log.Println("Error executing query:", err)
        return err
    }
    defer func() {
        if err := usrRows.Close(); err != nil {
            log.Println("Error closing rows:", err)
        }
    }()

    for usrRows.Next() {
        var user User
        var description sql.NullString // Используем sql.NullString для поля, которое может быть NULL

        if err := usrRows.Scan(&user.ID, &user.Name, &user.Tag, &description, &user.ImageSrc); err != nil {
            log.Println("Error scanning user row:", err)
            return err
        }

        // Преобразуем sql.NullString в string
        if description.Valid {
            user.Description = description.String
        } else {
            user.Description = "" // Если значение NULL, можно присвоить пустую строку
        }

        *users = append(*users, user)
    }

    if err = usrRows.Err(); err != nil {
        log.Println("Error iterating over rows:", err)
        return err
    }

    log.Println("Successfully retrieved users for chatID:", chatID)
    return nil
}

func AddMessage(w http.ResponseWriter, r *http.Request) {
    // Логируем начало запроса
    fmt.Println("Received request to add message")

    // Парсим тело запроса
    var requestBody struct {
        ChatID    string `json:"chatID"`
        Message    struct {
            UserID string `json:"userId"`
            Text   string `json:"text"`
            Type   string `json:"type"`
        } `json:"message"`
    }

    // Логируем получение данных
    fmt.Println("Parsing request body...")
    if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
        http.Error(w, "Invalid request body", http.StatusBadRequest)
        fmt.Println("Error decoding message body:", err)
        return
    }

    // Логируем полученные данные
    fmt.Println("Received data:", requestBody)

    // Получаем userID из данных
    userID := requestBody.Message.UserID
    if userID == "" {
        http.Error(w, "User not authenticated", http.StatusUnauthorized)
        fmt.Println("User not authenticated")
        return
    }

    // Проверяем, что текст сообщения не пустой
    if requestBody.Message.Text == "" {
        http.Error(w, "Message text cannot be empty", http.StatusBadRequest)
        fmt.Println("Message text is empty")
        return
    }
    fmt.Println("Message text:", requestBody.Message.Text)

    // Получаем chatID
    chatID := requestBody.ChatID
    if chatID == "" {
        http.Error(w, "ChatID is required", http.StatusBadRequest)
        fmt.Println("ChatID is missing")
        return
    }
    fmt.Println("ChatID received:", chatID)

    // Открываем соединение с базой данных
    fmt.Println("Connecting to database...")
    db, err := sql.Open("postgres", "host=localhost port=5435 user=nikdimer dbname=zcord password=technocraft2000 sslmode=disable")
    if err != nil {
        http.Error(w, "Error connecting to database", http.StatusInternalServerError)
        fmt.Println("Error connecting to database:", err)
        return
    }
    defer db.Close()

    // Проверяем, существует ли чат с данным chatID
    fmt.Println("Checking if chat exists...")
    var existingChatID string
    err = db.QueryRow("SELECT id FROM chats WHERE id = $1", chatID).Scan(&existingChatID)
    if err != nil {
        if err == sql.ErrNoRows {
            http.Error(w, "Chat not found", http.StatusNotFound)
            fmt.Println("Chat not found")
            return
        }
        http.Error(w, "Error querying database", http.StatusInternalServerError)
        fmt.Println("Error querying database:", err)
        return
    }
    fmt.Println("Chat exists:", existingChatID)

    // Проверяем, состоит ли пользователь в чате
    fmt.Println("Checking if user is part of the chat...")
    var isUserInChat bool
    err = db.QueryRow(
        "SELECT EXISTS(SELECT 1 FROM chats WHERE id = $1 AND $2 = ANY(users))",
        chatID, userID,
    ).Scan(&isUserInChat)
    if err != nil {
        http.Error(w, "Error checking user membership in chat", http.StatusInternalServerError)
        fmt.Println("Error checking user membership:", err)
        return
    }
    if !isUserInChat {
        http.Error(w, "You do not have permission to send messages in this chat", http.StatusForbidden)
        fmt.Println("User not in chat")
        return
    }
    fmt.Println("User is in the chat")

    // Получаем ID последнего сообщения чата
    fmt.Println("Getting last message ID from chat...")
    var lastMessageID string
    err = db.QueryRow("SELECT last_message_id FROM chats WHERE id = $1", chatID).Scan(&lastMessageID)
    if err != nil && err != sql.ErrNoRows {
        http.Error(w, "Error querying chat data", http.StatusInternalServerError)
        fmt.Println("Error getting last message ID:", err)
        return
    }
    fmt.Println("Last message ID:", lastMessageID)

    // Вставляем новое сообщение в базу данных
    fmt.Println("Inserting new message into database...")
    var newMessageID string
    err = db.QueryRow(
        `INSERT INTO messages (text, type, user_id, chat_id, prev_message_id)
        VALUES ($1, 'user', $2, $3, $4) RETURNING id`,
        requestBody.Message.Text, userID, chatID, lastMessageID).Scan(&newMessageID)
    if err != nil {
        http.Error(w, "Error inserting message into database", http.StatusInternalServerError)
        fmt.Println("Error inserting message:", err)
        return
    }
    fmt.Println("New message ID:", newMessageID)

    // Обновляем информацию о последнем сообщении и пользователе в чате
	fmt.Println("Updating last message ID and last user ID in chat...")
	_, err = db.Exec("UPDATE chats SET last_message_id = $1, last_user_id = $2 WHERE id = $3", newMessageID, userID, chatID)
	if err != nil {
		http.Error(w, "Error updating chat last_message_id or last_user_id", http.StatusInternalServerError)
		fmt.Println("Error updating chat last message ID or last user ID:", err)
		return
	}

    // Отправляем успешный ответ
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]string{"message": "Message added successfully"})
    fmt.Println("Message added successfully")
}
