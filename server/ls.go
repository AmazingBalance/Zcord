package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

// GetLSByTag returns LS chat between current user and friendTag.
// If LS chat exists but friendship is removed, it is returned in read-only mode (canWrite=false).
func GetLSByTag(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value("userId").(string)
	friendTag := r.URL.Query().Get("tag")
	log.Printf("GetLSByTag called for userID: %s, friendTag: '%s'", userID, friendTag)

	if friendTag == "" {
		log.Printf("Friend tag is required but not provided")
		http.Error(w, "Friend tag is required", http.StatusBadRequest)
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

	var friendID int
	var friendName, friendAvatar string
	err = db.QueryRow(`
		SELECT id, name, COALESCE(avatar, '') as avatar
		FROM users
		WHERE tag = $1`, friendTag).Scan(&friendID, &friendName, &friendAvatar)
	if err != nil {
		if err == sql.ErrNoRows {
			log.Printf("Friend with tag '%s' not found", friendTag)
			http.Error(w, "Friend not found", http.StatusNotFound)
			return
		}
		log.Printf("Error querying friend: %v", err)
		http.Error(w, "Error querying database", http.StatusInternalServerError)
		return
	}

	currentUserID, _ := strconv.Atoi(userID)
	var areFriends bool
	err = db.QueryRow(`
		SELECT EXISTS(
			SELECT 1 FROM users
			WHERE id = $1 AND $2 = ANY(friends_list)
		)`, currentUserID, friendID).Scan(&areFriends)
	if err != nil {
		log.Printf("Error checking friendship: %v", err)
		http.Error(w, "Error checking friendship", http.StatusInternalServerError)
		return
	}

	// Retry once (some flows update friendship state asynchronously)
	if !areFriends {
		log.Printf("First friendship check failed for users %s and %d, retrying...", userID, friendID)
		err = db.QueryRow(`
			SELECT EXISTS(
				SELECT 1 FROM users
				WHERE id = $1 AND $2 = ANY(friends_list)
			)`, currentUserID, friendID).Scan(&areFriends)
		if err != nil {
			log.Printf("Error on second friendship check: %v", err)
			http.Error(w, "Error checking friendship", http.StatusInternalServerError)
			return
		}
	}

	var chatID int
	err = db.QueryRow(`
		SELECT id FROM chats
		WHERE $1 = ANY(users) AND $2 = ANY(users)
		AND array_length(users, 1) = 2
		AND name = 'LS Chat'`, currentUserID, friendID).Scan(&chatID)

	if err != nil {
		if err != sql.ErrNoRows {
			log.Printf("Error querying LS chat existence: %v", err)
			http.Error(w, "Error querying database", http.StatusInternalServerError)
			return
		}

		// No LS chat in DB: allow only when users are friends (virtual chat).
		if !areFriends {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error":    "not_friends",
				"redirect": "/user/" + friendTag,
				"message":  "You are not friends with this user",
			})
			return
		}

		var currentUserName, currentUserAvatar string
		if err := db.QueryRow(`
			SELECT name, COALESCE(avatar, '') as avatar
			FROM users WHERE id = $1`, currentUserID).Scan(&currentUserName, &currentUserAvatar); err != nil {
			log.Printf("Error querying current user: %v", err)
			http.Error(w, "Error querying database", http.StatusInternalServerError)
			return
		}

		chatDetail := ChatDetail{
			ID:          "0",
			Tag:         "0",
			Name:        friendName,
			ImageSrc:    friendAvatar,
			Description: "Личный чат",
			CanWrite:    true,
		}

		chatDetail.Users = append(chatDetail.Users, User{
			ID:       userID,
			Name:     currentUserName,
			ImageSrc: &currentUserAvatar,
			Tag:      "",
		})
		chatDetail.Users = append(chatDetail.Users, User{
			ID:       strconv.Itoa(friendID),
			Name:     friendName,
			ImageSrc: &friendAvatar,
			Tag:      friendTag,
		})

		if friendAvatar != "" && !strings.HasPrefix(friendAvatar, "http") {
			chatDetail.ImageSrc = publicAssetURL(friendAvatar)
		}

		if currentUserAvatar != "" && !strings.HasPrefix(currentUserAvatar, "http") {
			*chatDetail.Users[0].ImageSrc = publicAssetURL(currentUserAvatar)
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(chatDetail); err != nil {
			log.Println("Error encoding JSON response:", err)
		}
		return
	}

	log.Printf("Found existing LS chat with ID: %d", chatID)

	var chatDetail ChatDetail
	if err := db.QueryRow(`SELECT id, tag, description FROM chats WHERE id = $1`, chatID).Scan(
		&chatDetail.ID, &chatDetail.Tag, &chatDetail.Description); err != nil {
		log.Println("Error querying LS chat details:", err)
		http.Error(w, "Error querying chat details", http.StatusInternalServerError)
		return
	}

	chatDetail.Name = friendName
	chatDetail.ImageSrc = friendAvatar
	chatDetail.CanWrite = areFriends

	if chatDetail.ImageSrc != "" && !strings.HasPrefix(chatDetail.ImageSrc, "http") {
		chatDetail.ImageSrc = publicAssetURL(chatDetail.ImageSrc)
	}

	if err := GetMessagesForChat(db, chatID, &chatDetail.Messages); err != nil {
		log.Println("Error querying messages for LS chat:", err)
		http.Error(w, "Error querying messages", http.StatusInternalServerError)
		return
	}
	if err := GetUsersForChat(db, chatID, &chatDetail.Users); err != nil {
		log.Println("Error querying users for LS chat:", err)
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

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(chatDetail); err != nil {
		log.Println("Error encoding JSON response:", err)
	}
}

// CreateLSChat creates a real LS chat between users.
func CreateLSChat(db *sql.DB, userID string, friendTag string) (int, error) {
	log.Printf("Creating real LS chat between user %s and friend %s", userID, friendTag)

	var friendID int
	var friendName, friendAvatar string
	err := db.QueryRow(`
		SELECT id, name, COALESCE(avatar, '') as avatar FROM users
		WHERE tag = $1`, friendTag).Scan(&friendID, &friendName, &friendAvatar)
	if err != nil {
		return 0, err
	}

	currentUserID, _ := strconv.Atoi(userID)
	lsTag := generateRandomTag(10)

	var chatID int
	err = db.QueryRow(`
		INSERT INTO chats (name, tag, description, users)
		VALUES ('LS Chat', $1, 'Личный чат', ARRAY[$2::integer, $3::integer])
		RETURNING id`,
		lsTag, currentUserID, friendID).Scan(&chatID)
	if err != nil {
		return 0, err
	}

	log.Printf("Successfully created real LS chat with ID: %d", chatID)
	return chatID, nil
}

type EnsureLSChatRequest struct {
	FriendTag string `json:"friendTag"`
}

// EnsureLSChat guarantees that an LS chat exists between current user and friendTag.
// Returns {chatId} and emits chat_updated to both users (if websocket hub is available).
func EnsureLSChat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONResponse(w, http.StatusMethodNotAllowed, map[string]interface{}{
			"error": "Method not allowed",
		})
		return
	}

	userID := r.Context().Value("userId").(string)

	var req EnsureLSChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONResponse(w, http.StatusBadRequest, map[string]interface{}{
			"error": "Invalid request body",
		})
		return
	}

	friendTag := strings.TrimSpace(req.FriendTag)
	if friendTag == "" {
		writeJSONResponse(w, http.StatusBadRequest, map[string]interface{}{
			"error": "Friend tag is required",
		})
		return
	}

	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Println("Error connecting to database:", err)
		writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{
			"error": "Database connection failed",
		})
		return
	}
	defer func() {
		if err := db.Close(); err != nil {
			log.Println("Error closing database connection:", err)
		}
	}()

	var friendID int
	if err := db.QueryRow(`SELECT id FROM users WHERE tag = $1`, friendTag).Scan(&friendID); err != nil {
		if err == sql.ErrNoRows {
			writeJSONResponse(w, http.StatusNotFound, map[string]interface{}{
				"error": "Friend not found",
			})
			return
		}
		log.Printf("Error querying friend: %v", err)
		writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{
			"error": "Error querying database",
		})
		return
	}

	currentUserID, parseErr := strconv.Atoi(userID)
	if parseErr != nil {
		writeJSONResponse(w, http.StatusBadRequest, map[string]interface{}{
			"error": "Invalid user ID",
		})
		return
	}

	var areFriends bool
	if err := db.QueryRow(`
		SELECT EXISTS(
			SELECT 1 FROM users
			WHERE id = $1 AND $2 = ANY(friends_list)
		)`, currentUserID, friendID).Scan(&areFriends); err != nil {
		log.Printf("Error checking friendship: %v", err)
		writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{
			"error": "Error checking friendship",
		})
		return
	}

	if !areFriends {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":    "not_friends",
			"redirect": "/user/" + friendTag,
			"message":  "You are not friends with this user",
		})
		return
	}

	chatID, err := createLSChatInline(db, userID, friendTag)
	if err != nil {
		log.Printf("Error ensuring LS chat: %v", err)
		writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{
			"error": "Failed to ensure LS chat",
		})
		return
	}

	if wsHub != nil {
		chatIDStr := strconv.Itoa(chatID)
		wsHub.SendToUser(strconv.Itoa(currentUserID), WSMessage{
			Type:   MessageTypeChatUpdated,
			ChatID: chatIDStr,
		})
		wsHub.SendToUser(strconv.Itoa(friendID), WSMessage{
			Type:   MessageTypeChatUpdated,
			ChatID: chatIDStr,
		})
	}

	writeJSONResponse(w, http.StatusOK, map[string]interface{}{
		"chatId": chatID,
	})
}
