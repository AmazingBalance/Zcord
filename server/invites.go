package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	_ "github.com/lib/pq"
)

// Структуры для работы с приглашениями
type ChatInvite struct {
	ID          int       `json:"id"`
	InviteCode  string    `json:"inviteCode"`
	ChatID      int       `json:"chatId"`
	CreatedBy   int       `json:"createdBy"`
	CreatedAt   time.Time `json:"createdAt"`
	ExpiresAt   time.Time `json:"expiresAt"`
	IsActive    bool      `json:"isActive"`
	MaxUses     *int      `json:"maxUses,omitempty"`
	CurrentUses int       `json:"currentUses"`
}

type InviteInfo struct {
	InviteCode  string    `json:"inviteCode"`
	ChatID      int       `json:"chatId"`
	ChatName    string    `json:"chatName"`
	ChatAvatar  string    `json:"chatAvatar"`
	ChatType    string    `json:"chatType"`
	MemberCount int       `json:"memberCount"`
	ExpiresAt   time.Time `json:"expiresAt"`
	IsValid     bool      `json:"isValid"`
}

// Генерация уникального кода приглашения
type TagInviteInfo struct {
	ChatID      int        `json:"chatId"`
	ChatName    string     `json:"chatName"`
	ChatAvatar  string     `json:"chatAvatar"`
	ChatType    string     `json:"chatType"`
	MemberCount int        `json:"memberCount"`
	IsValid     bool       `json:"isValid"`
	ExpiresAt   *time.Time `json:"expiresAt,omitempty"`
}

func generateInviteCode() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// Создание пригласительной ссылки
func CreateInvite(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := r.Context().Value("userId").(string)
	log.Printf("CreateInvite called for userID: %s", userID)

	var requestBody struct {
		ChatTag string `json:"chatTag"`
	}

	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		log.Println("Error decoding request body:", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if requestBody.ChatTag == "" {
		http.Error(w, "Chat tag is required", http.StatusBadRequest)
		return
	}

	// Проверяем, что это не системный канал
	if requestBody.ChatTag == "news" {
		http.Error(w, "Cannot create invite for system channel", http.StatusForbidden)
		return
	}

	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Println("Error connecting to database:", err)
		http.Error(w, "Error connecting to database", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// Получаем ID чата по тегу и проверяем права пользователя
	var chatID int
	var chatType string
	err = db.QueryRow(`
		SELECT c.id, COALESCE(c.chat_type, 'chat')
		FROM chats c 
		WHERE c.tag = $1 AND $2 = ANY(c.users)
	`, requestBody.ChatTag, userID).Scan(&chatID, &chatType)

	if err != nil {
		if err == sql.ErrNoRows {
			log.Printf("Chat not found or user %s has no access to chat %s", userID, requestBody.ChatTag)
			http.Error(w, "Chat not found or access denied", http.StatusForbidden)
			return
		}
		log.Println("Error querying chat:", err)
		http.Error(w, "Error querying database", http.StatusInternalServerError)
		return
	}

	// Генерируем уникальный код приглашения
	baseURL := strings.TrimRight(r.Header.Get("Origin"), "/")
	if baseURL == "" {
		baseURL = strings.TrimRight(getEnvOrDefault("PUBLIC_WEB_URL", getEnvOrDefault("CORS_ORIGIN", "http://localhost:3000")), "/")
	}

	// Channels are public: use permanent invite URL by tag (no expiring invite codes).
	if chatType == "channel" {
		response := map[string]interface{}{
			"inviteUrl": baseURL + "/invite/" + requestBody.ChatTag,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		return
	}

	inviteCode, err := generateInviteCode()
	if err != nil {
		log.Println("Error generating invite code:", err)
		http.Error(w, "Error generating invite code", http.StatusInternalServerError)
		return
	}

	// Устанавливаем срок действия на 24 часа
	expiresAt := time.Now().Add(24 * time.Hour)

	// Сохраняем приглашение в базу данных
	var inviteID int
	err = db.QueryRow(`
		INSERT INTO chat_invites (invite_code, chat_id, created_by, expires_at)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, inviteCode, chatID, userID, expiresAt).Scan(&inviteID)

	if err != nil {
		log.Println("Error creating invite:", err)
		http.Error(w, "Error creating invite", http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"inviteCode": inviteCode,
		"expiresAt":  expiresAt,
		"inviteUrl":  baseURL + "/chat_invite/" + inviteCode,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
	log.Printf("Invite created successfully: %s for chat %d by user %s", inviteCode, chatID, userID)
}

// Получение информации о приглашении
func GetInviteInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	inviteCode := r.URL.Query().Get("code")
	if inviteCode == "" {
		http.Error(w, "Invite code is required", http.StatusBadRequest)
		return
	}

	log.Printf("GetInviteInfo called for invite code: %s", inviteCode)

	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Println("Error connecting to database:", err)
		http.Error(w, "Error connecting to database", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// Получаем информацию о приглашении и чате
	var inviteInfo InviteInfo
	var memberCount int

	query := `
		SELECT 
			ci.invite_code,
			ci.chat_id,
			c.name,
			COALESCE(c.avatar, '') as avatar,
			COALESCE(c.chat_type, 'chat') as type,
			ci.expires_at,
			(ci.is_active AND ci.expires_at > CURRENT_TIMESTAMP) as is_valid,
			array_length(c.users, 1) as member_count
		FROM chat_invites ci
		JOIN chats c ON ci.chat_id = c.id
		WHERE ci.invite_code = $1
	`

	err = db.QueryRow(query, inviteCode).Scan(
		&inviteInfo.InviteCode,
		&inviteInfo.ChatID,
		&inviteInfo.ChatName,
		&inviteInfo.ChatAvatar,
		&inviteInfo.ChatType,
		&inviteInfo.ExpiresAt,
		&inviteInfo.IsValid,
		&memberCount,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			log.Printf("Invite not found: %s", inviteCode)
			http.Error(w, "Invite not found", http.StatusNotFound)
			return
		}
		log.Println("Error querying invite:", err)
		http.Error(w, "Error querying database", http.StatusInternalServerError)
		return
	}

	inviteInfo.MemberCount = memberCount

	// Fix avatar URL path
	if inviteInfo.ChatAvatar != "" && inviteInfo.ChatAvatar != "/news_icon.svg" {
		inviteInfo.ChatAvatar = publicAssetURL(inviteInfo.ChatAvatar)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(inviteInfo)
	log.Printf("Invite info retrieved for: %s", inviteCode)
}

// Принятие приглашения (присоединение к чату)
func AcceptInvite(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := r.Context().Value("userId").(string)

	var requestBody struct {
		InviteCode string `json:"inviteCode"`
	}

	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		log.Println("Error decoding request body:", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if requestBody.InviteCode == "" {
		http.Error(w, "Invite code is required", http.StatusBadRequest)
		return
	}

	log.Printf("AcceptInvite called for user %s with invite code: %s", userID, requestBody.InviteCode)

	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Println("Error connecting to database:", err)
		http.Error(w, "Error connecting to database", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// Начинаем транзакцию
	tx, err := db.Begin()
	if err != nil {
		log.Println("Error starting transaction:", err)
		http.Error(w, "Error processing request", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Проверяем валидность приглашения
	var chatID int
	var isValid bool
	err = tx.QueryRow(`
		SELECT chat_id, (is_active AND expires_at > CURRENT_TIMESTAMP) as is_valid
		FROM chat_invites 
		WHERE invite_code = $1
	`, requestBody.InviteCode).Scan(&chatID, &isValid)

	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Invite not found", http.StatusNotFound)
			return
		}
		log.Println("Error querying invite:", err)
		http.Error(w, "Error querying database", http.StatusInternalServerError)
		return
	}

	if !isValid {
		http.Error(w, "Invite is expired or inactive", http.StatusBadRequest)
		return
	}

	// Проверяем, не является ли пользователь уже участником чата
	var isAlreadyMember bool
	err = tx.QueryRow(`
		SELECT EXISTS(SELECT 1 FROM chats WHERE id = $1 AND $2 = ANY(users))
	`, chatID, userID).Scan(&isAlreadyMember)

	if err != nil {
		log.Println("Error checking membership:", err)
		http.Error(w, "Error checking membership", http.StatusInternalServerError)
		return
	}

	if isAlreadyMember {
		http.Error(w, "User is already a member of this chat", http.StatusBadRequest)
		return
	}

	// Добавляем пользователя в чат
	_, err = tx.Exec(`
		UPDATE chats 
		SET users = array_append(users, $1::integer)
		WHERE id = $2
	`, userID, chatID)

	if err != nil {
		log.Println("Error adding user to chat:", err)
		http.Error(w, "Error joining chat", http.StatusInternalServerError)
		return
	}

	// Инициализируем read-status для пользователя в этом чате (чтобы счётчик непрочитанных начинался с 0 после вступления)
	_, err = tx.Exec(`
		INSERT INTO chat_read_status (chat_id, user_id, last_read_message_id, last_read_at)
		SELECT $2, $1::integer, c.last_message_id, NOW()
		FROM chats c
		WHERE c.id = $2
		ON CONFLICT (chat_id, user_id) DO UPDATE
		SET last_read_message_id = EXCLUDED.last_read_message_id,
		    last_read_at = EXCLUDED.last_read_at
	`, userID, chatID)
	if err != nil {
		log.Println("Error initializing chat read status:", err)
		http.Error(w, "Error joining chat", http.StatusInternalServerError)
		return
	}

	// Увеличиваем счетчик использований приглашения
	_, err = tx.Exec(`
		UPDATE chat_invites 
		SET current_uses = current_uses + 1
		WHERE invite_code = $1
	`, requestBody.InviteCode)

	if err != nil {
		log.Println("Error updating invite usage:", err)
		http.Error(w, "Error updating invite", http.StatusInternalServerError)
		return
	}

	// Коммитим транзакцию
	if err = tx.Commit(); err != nil {
		log.Println("Error committing transaction:", err)
		http.Error(w, "Error processing request", http.StatusInternalServerError)
		return
	}

	// Получаем информацию о чате для ответа
	var chatTag string
	err = db.QueryRow("SELECT tag FROM chats WHERE id = $1", chatID).Scan(&chatTag)
	if err != nil {
		log.Println("Error getting chat tag:", err)
		http.Error(w, "Error getting chat info", http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"success": true,
		"chatTag": chatTag,
		"message": "Successfully joined the chat",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
	log.Printf("User %s successfully joined chat %d via invite %s", userID, chatID, requestBody.InviteCode)
}

// GetTagInviteInfo returns public invite info for a channel by its tag (no invite code).
func GetTagInviteInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	tag := strings.TrimSpace(r.URL.Query().Get("tag"))
	if tag == "" {
		http.Error(w, "Tag is required", http.StatusBadRequest)
		return
	}
	if tag == "news" {
		http.Error(w, "Cannot invite to system channel", http.StatusForbidden)
		return
	}

	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Println("Error connecting to database:", err)
		http.Error(w, "Error connecting to database", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	var info TagInviteInfo
	err = db.QueryRow(`
		SELECT
			c.id,
			c.name,
			COALESCE(c.avatar, '') as avatar,
			COALESCE(c.chat_type, 'chat') as type,
			array_length(c.users, 1) as member_count
		FROM chats c
		WHERE c.tag = $1
	`, tag).Scan(&info.ChatID, &info.ChatName, &info.ChatAvatar, &info.ChatType, &info.MemberCount)

	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Channel not found", http.StatusNotFound)
			return
		}
		log.Println("Error querying channel:", err)
		http.Error(w, "Error querying database", http.StatusInternalServerError)
		return
	}

	// Only channels are joinable via /invite/<tag>.
	if info.ChatType != "channel" {
		http.Error(w, "Invite by tag is available only for channels", http.StatusBadRequest)
		return
	}

	info.IsValid = true

	if info.ChatAvatar != "" && info.ChatAvatar != "/news_icon.svg" {
		info.ChatAvatar = publicAssetURL(info.ChatAvatar)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(info)
}

// AcceptTagInvite joins a channel by its tag.
func AcceptTagInvite(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := r.Context().Value("userId").(string)

	var requestBody struct {
		Tag string `json:"tag"`
	}

	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		log.Println("Error decoding request body:", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	tag := strings.TrimSpace(requestBody.Tag)
	if tag == "" {
		http.Error(w, "Tag is required", http.StatusBadRequest)
		return
	}
	if tag == "news" {
		http.Error(w, "Cannot join system channel", http.StatusForbidden)
		return
	}

	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Println("Error connecting to database:", err)
		http.Error(w, "Error connecting to database", http.StatusInternalServerError)
		return
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		log.Println("Error starting transaction:", err)
		http.Error(w, "Error processing request", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	var chatID int
	var chatType string
	err = tx.QueryRow(`
		SELECT id, COALESCE(chat_type, 'chat')
		FROM chats
		WHERE tag = $1
	`, tag).Scan(&chatID, &chatType)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Channel not found", http.StatusNotFound)
			return
		}
		log.Println("Error querying chat:", err)
		http.Error(w, "Error querying database", http.StatusInternalServerError)
		return
	}

	if chatType != "channel" {
		http.Error(w, "Invite by tag is available only for channels", http.StatusBadRequest)
		return
	}

	var isAlreadyMember bool
	err = tx.QueryRow(`
		SELECT EXISTS(SELECT 1 FROM chats WHERE id = $1 AND $2 = ANY(users))
	`, chatID, userID).Scan(&isAlreadyMember)
	if err != nil {
		log.Println("Error checking membership:", err)
		http.Error(w, "Error checking membership", http.StatusInternalServerError)
		return
	}

	if !isAlreadyMember {
		if _, err := tx.Exec(`
			UPDATE chats
			SET users = array_append(users, $1::integer)
			WHERE id = $2
		`, userID, chatID); err != nil {
			log.Println("Error adding user to channel:", err)
			http.Error(w, "Error joining channel", http.StatusInternalServerError)
			return
		}
	}

	// Инициализируем/обновляем read-status для этого пользователя в канале
	if _, err := tx.Exec(`
		INSERT INTO chat_read_status (chat_id, user_id, last_read_message_id, last_read_at)
		SELECT $2, $1::integer, c.last_message_id, NOW()
		FROM chats c
		WHERE c.id = $2
		ON CONFLICT (chat_id, user_id) DO UPDATE
		SET last_read_message_id = EXCLUDED.last_read_message_id,
		    last_read_at = EXCLUDED.last_read_at
	`, userID, chatID); err != nil {
		log.Println("Error initializing chat read status:", err)
		http.Error(w, "Error processing request", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(); err != nil {
		log.Println("Error committing transaction:", err)
		http.Error(w, "Error processing request", http.StatusInternalServerError)
		return
	}

	if wsHub != nil {
		wsHub.SendToUser(userID, WSMessage{
			Type:   MessageTypeChatUpdated,
			ChatID: strconv.Itoa(chatID),
		})
	}

	response := map[string]interface{}{
		"success":  true,
		"chatTag":  tag,
		"chatType": "channel",
		"message":  "Successfully joined the channel",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
