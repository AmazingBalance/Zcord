package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/lib/pq"
	_ "github.com/lib/pq"
)

type CreateChatRequest struct {
	Name         string   `json:"name"`
	Tag          string   `json:"tag"`
	Description  string   `json:"description"`
	Type         string   `json:"type"`
	Participants []string `json:"participants"`
}

// CheckChatTagAvailability проверяет доступность тега для чата/канала
func CheckChatTagAvailability(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONResponse(w, http.StatusMethodNotAllowed, map[string]interface{}{
			"error": "Method not allowed",
		})
		return
	}

	tag := r.URL.Query().Get("tag")
	if tag == "" {
		writeJSONResponse(w, http.StatusBadRequest, map[string]interface{}{
			"error": "Tag parameter is required",
		})
		return
	}

	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Printf("Error connecting to database: %v", err)
		writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{
			"error": "Database connection failed",
		})
		return
	}
	defer db.Close()

	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM chats WHERE tag = $1", tag).Scan(&count)
	if err != nil {
		log.Printf("Error checking chat tag availability: %v", err)
		writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{
			"error": "Error checking tag availability",
		})
		return
	}

	available := count == 0
	writeJSONResponse(w, http.StatusOK, map[string]interface{}{
		"available": available,
		"tag":       tag,
	})
}

// CreateChat создает новый чат
func CreateChat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONResponse(w, http.StatusMethodNotAllowed, map[string]interface{}{
			"error": "Method not allowed",
		})
		return
	}

	userID := r.Context().Value("userId").(string)
	log.Printf("CreateChat called for userID: %s", userID)

	// Парсим multipart form для обработки файлов
	err := r.ParseMultipartForm(10 << 20) // Ограничение на 10MB
	if err != nil {
		log.Printf("Error parsing multipart form: %v", err)
		writeJSONResponse(w, http.StatusBadRequest, map[string]interface{}{
			"error": "Invalid form data",
		})
		return
	}

	// Получаем данные из формы
	name := r.FormValue("name")
	tag := r.FormValue("tag")
	description := r.FormValue("description")
	chatType := r.FormValue("type")
	participantsJSON := r.FormValue("participants")

	log.Printf("CreateChat: Received data - Name: %s, Tag: %s, Type: %s", name, tag, chatType)

	// Валидация обязательных полей
	if name == "" || tag == "" {
		writeJSONResponse(w, http.StatusBadRequest, map[string]interface{}{
			"error": "Название и тег обязательны для заполнения",
		})
		return
	}

	// Валидация типа
	if chatType != "chat" && chatType != "channel" {
		writeJSONResponse(w, http.StatusBadRequest, map[string]interface{}{
			"error": "Неверный тип чата",
		})
		return
	}

	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Printf("Error connecting to database: %v", err)
		writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{
			"error": "Database connection failed",
		})
		return
	}
	defer db.Close()

	// Проверяем уникальность тега
	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM chats WHERE tag = $1", tag).Scan(&count)
	if err != nil {
		log.Printf("Error checking tag uniqueness: %v", err)
		writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{
			"error": "Error checking tag availability",
		})
		return
	}
	if count > 0 {
		writeJSONResponse(w, http.StatusConflict, map[string]interface{}{
			"error": "Этот тег уже занят",
		})
		return
	}

	// Обработка загрузки аватара
	var avatarPath string
	file, handler, err := r.FormFile("avatar")
	if err == nil {
		defer file.Close()

		// Создаем уникальное имя файла
		avatarPath = fmt.Sprintf("uploads/chat_%d_%s", time.Now().Unix(), handler.Filename)

		// Создаем файл на диске
		newFile, err := os.Create(avatarPath)
		if err != nil {
			log.Printf("Error creating avatar file: %v", err)
			writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{
				"error": "Error saving avatar",
			})
			return
		}
		defer newFile.Close()

		// Копируем содержимое загруженного файла
		_, err = newFile.ReadFrom(file)
		if err != nil {
			log.Printf("Error writing avatar file: %v", err)
			writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{
				"error": "Error saving avatar",
			})
			return
		}
		log.Printf("Chat avatar saved: %s", avatarPath)
	}

	// Парсим участников
	var participants []string
	if participantsJSON != "" {
		err = json.Unmarshal([]byte(participantsJSON), &participants)
		if err != nil {
			log.Printf("Error parsing participants: %v", err)
			writeJSONResponse(w, http.StatusBadRequest, map[string]interface{}{
				"error": "Invalid participants data",
			})
			return
		}
	}

	// Добавляем создателя в список участников
	creatorID, _ := strconv.Atoi(userID)
	userIDs := []int{creatorID}

	// Добавляем выбранных участников
	for _, participantID := range participants {
		if pid, err := strconv.Atoi(participantID); err == nil && pid != creatorID {
			userIDs = append(userIDs, pid)
		}
	}

	// Создаем чат в базе данных
	var chatID int
	err = db.QueryRow(`
		INSERT INTO chats (name, tag, chat_type, owner_id, description, avatar, users, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
		RETURNING id`,
		name, tag, chatType, creatorID, description, avatarPath, pq.Array(userIDs)).Scan(&chatID)
	if err != nil {
		log.Printf("Error creating chat: %v", err)
		if err.Error() == `pq: duplicate key value violates unique constraint "chats_tag_key"` {
			writeJSONResponse(w, http.StatusConflict, map[string]interface{}{
				"error": "Этот тег уже занят",
			})
		} else {
			writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{
				"error": "Ошибка создания чата",
			})
		}
		return
	}

	log.Printf("Chat created successfully: ID=%d, Tag=%s, Type=%s", chatID, tag, chatType)

	// Создаем системное сообщение о создании чата
	welcomeMessage := fmt.Sprintf("%s '%s' создан", map[string]string{"chat": "Чат", "channel": "Канал"}[chatType], name)
	var welcomeMessageID string
	err = db.QueryRow(`
		INSERT INTO messages (text, type, chat_id)
		VALUES ($1, 'system', $2) RETURNING id`,
		welcomeMessage, chatID).Scan(&welcomeMessageID)
	if err != nil {
		log.Printf("Error creating welcome message: %v", err)
		// Не прерываем выполнение, просто логируем ошибку
	} else {
		// Обновляем last_message_id чата
		_, err = db.Exec("UPDATE chats SET last_message_id = $1 WHERE id = $2", welcomeMessageID, chatID)
		if err != nil {
			log.Printf("Error updating chat's last message ID with welcome message: %v", err)
		}
	}

	// Формируем URL аватара
	// Notify all participants (and creator) so their chat lists can refresh without reload.
	if wsHub != nil {
		chatIDStr := strconv.Itoa(chatID)
		for _, uid := range userIDs {
			wsHub.SendToUser(strconv.Itoa(uid), WSMessage{
				Type:   MessageTypeChatUpdated,
				ChatID: chatIDStr,
			})
		}
	}

	avatarURL := ""
	if avatarPath != "" {
		avatarURL = publicAssetURL(avatarPath)
	}

	response := map[string]interface{}{
		"id":          chatID,
		"name":        name,
		"tag":         tag,
		"description": description,
		"avatar":      avatarURL,
		"type":        chatType,
		"message":     fmt.Sprintf("%s успешно создан", map[string]string{"chat": "Чат", "channel": "Канал"}[chatType]),
	}

	writeJSONResponse(w, http.StatusCreated, response)
}

// CreateChannel создает новый канал (алиас для CreateChat)
func CreateChannel(w http.ResponseWriter, r *http.Request) {
	CreateChat(w, r)
}

// RegisterChatCreationRoutes регистрирует маршруты для создания чатов
func RegisterChatCreationRoutes() {
	http.HandleFunc("/api/check-chat-tag", CheckChatTagAvailability)
	http.HandleFunc("/api/create-chat", authenticate(CreateChat))
	http.HandleFunc("/api/create-channel", authenticate(CreateChannel))
}
