package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"
)

// Структуры для работы с криптографическими ключами

type PublicKeyBundle struct {
	UserID                 int                `json:"userId"`
	IdentityPublicKey      string             `json:"identityPublicKey"`
	SignedPreKey           string             `json:"signedPreKey"`
	SignedPreKeySignature  string             `json:"signedPreKeySignature"`
	OneTimePreKeys         []OneTimePreKey    `json:"oneTimePreKeys"`
	CreatedAt              time.Time          `json:"createdAt"`
	UpdatedAt              time.Time          `json:"updatedAt"`
}

type OneTimePreKey struct {
	ID        string `json:"id"`
	PublicKey string `json:"publicKey"`
}

type UploadKeysRequest struct {
	IdentityPublicKey     string          `json:"identityPublicKey"`
	SignedPreKey          string          `json:"signedPreKey"`
	SignedPreKeySignature string          `json:"signedPreKeySignature"`
	OneTimePreKeys        []OneTimePreKey `json:"oneTimePreKeys"`
}

// Загрузка публичных ключей пользователя на сервер
func UploadPublicKeys(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONResponse(w, http.StatusMethodNotAllowed, map[string]interface{}{
			"error": "Method not allowed",
		})
		return
	}

	userID := r.Context().Value("userId").(string)
	log.Printf("UploadPublicKeys called for userID: %s", userID)

	var request UploadKeysRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		log.Printf("Error decoding request body: %v", err)
		writeJSONResponse(w, http.StatusBadRequest, map[string]interface{}{
			"error": "Invalid request body",
		})
		return
	}

	// Валидация обязательных полей
	if request.IdentityPublicKey == "" || request.SignedPreKey == "" || request.SignedPreKeySignature == "" {
		writeJSONResponse(w, http.StatusBadRequest, map[string]interface{}{
			"error": "Identity public key, signed pre key, and signature are required",
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

	// Создаем массив строк для PostgreSQL
	var oneTimeKeyStrings []string
	for _, key := range request.OneTimePreKeys {
		keyJSON, _ := json.Marshal(key)
		oneTimeKeyStrings = append(oneTimeKeyStrings, string(keyJSON))
	}

	// Сохраняем или обновляем ключи пользователя
	_, err = db.Exec(`
		INSERT INTO user_keys (user_id, identity_public_key, signed_pre_key, signed_pre_key_signature, one_time_pre_keys, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			identity_public_key = EXCLUDED.identity_public_key,
			signed_pre_key = EXCLUDED.signed_pre_key,
			signed_pre_key_signature = EXCLUDED.signed_pre_key_signature,
			one_time_pre_keys = EXCLUDED.one_time_pre_keys,
			updated_at = NOW()
	`, userID, request.IdentityPublicKey, request.SignedPreKey, request.SignedPreKeySignature, oneTimeKeyStrings)

	if err != nil {
		log.Printf("Error saving user keys: %v", err)
		writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{
			"error": "Error saving keys",
		})
		return
	}

	log.Printf("Public keys uploaded successfully for user %s", userID)
	writeJSONResponse(w, http.StatusOK, map[string]interface{}{
		"message": "Keys uploaded successfully",
		"oneTimeKeysCount": len(request.OneTimePreKeys),
	})
}

// Получение публичных ключей пользователя
func GetPublicKeys(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONResponse(w, http.StatusMethodNotAllowed, map[string]interface{}{
			"error": "Method not allowed",
		})
		return
	}

	// Получаем ID пользователя, ключи которого запрашиваются
	targetUserID := r.URL.Query().Get("userId")
	if targetUserID == "" {
		writeJSONResponse(w, http.StatusBadRequest, map[string]interface{}{
			"error": "User ID is required",
		})
		return
	}

	requestingUserID := r.Context().Value("userId").(string)
	log.Printf("GetPublicKeys called by user %s for user %s", requestingUserID, targetUserID)

	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Printf("Error connecting to database: %v", err)
		writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{
			"error": "Database connection failed",
		})
		return
	}
	defer db.Close()

	// Проверяем, что пользователи являются друзьями или это запрос собственных ключей
	if requestingUserID != targetUserID {
		var areFriends bool
		err = db.QueryRow(`
			SELECT EXISTS(
				SELECT 1 FROM users
				WHERE id = $1 AND $2 = ANY(friends_list)
			)
		`, requestingUserID, targetUserID).Scan(&areFriends)

		if err != nil {
			log.Printf("Error checking friendship: %v", err)
			writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{
				"error": "Error checking permissions",
			})
			return
		}

		if !areFriends {
			writeJSONResponse(w, http.StatusForbidden, map[string]interface{}{
				"error": "Access denied: not friends",
			})
			return
		}
	}

	// Получаем ключи пользователя
	var keyBundle PublicKeyBundle
	var oneTimeKeysJSON []string
	var createdAt, updatedAt time.Time

	err = db.QueryRow(`
		SELECT user_id, identity_public_key, signed_pre_key, signed_pre_key_signature, 
		       one_time_pre_keys, created_at, updated_at
		FROM user_keys
		WHERE user_id = $1
	`, targetUserID).Scan(
		&keyBundle.UserID,
		&keyBundle.IdentityPublicKey,
		&keyBundle.SignedPreKey,
		&keyBundle.SignedPreKeySignature,
		&oneTimeKeysJSON,
		&createdAt,
		&updatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			writeJSONResponse(w, http.StatusNotFound, map[string]interface{}{
				"error": "User keys not found",
			})
			return
		}
		log.Printf("Error querying user keys: %v", err)
		writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{
			"error": "Error retrieving keys",
		})
		return
	}

	// Парсим одноразовые ключи
	var oneTimeKeys []OneTimePreKey
	for _, keyStr := range oneTimeKeysJSON {
		var key OneTimePreKey
		if err := json.Unmarshal([]byte(keyStr), &key); err == nil {
			oneTimeKeys = append(oneTimeKeys, key)
		}
	}

	keyBundle.OneTimePreKeys = oneTimeKeys
	keyBundle.CreatedAt = createdAt
	keyBundle.UpdatedAt = updatedAt

	// Если это запрос от другого пользователя, возвращаем один одноразовый ключ и удаляем его
	if requestingUserID != targetUserID && len(oneTimeKeys) > 0 {
		// Берем первый доступный одноразовый ключ
		consumedKey := oneTimeKeys[0]
		keyBundle.OneTimePreKeys = []OneTimePreKey{consumedKey}

		// Удаляем использованный ключ из базы данных
		remainingKeys := oneTimeKeys[1:]
		var remainingKeyStrings []string
		for _, key := range remainingKeys {
			keyJSON, _ := json.Marshal(key)
			remainingKeyStrings = append(remainingKeyStrings, string(keyJSON))
		}

		_, err = db.Exec(`
			UPDATE user_keys 
			SET one_time_pre_keys = $1, updated_at = NOW()
			WHERE user_id = $2
		`, remainingKeyStrings, targetUserID)

		if err != nil {
			log.Printf("Error updating one-time keys: %v", err)
		} else {
			log.Printf("Consumed one-time key %s for user %s", consumedKey.ID, targetUserID)
		}
	}

	log.Printf("Public keys retrieved successfully for user %s", targetUserID)
	
	// Преобразуем keyBundle в map для JSON ответа
	response := map[string]interface{}{
		"userId":                 keyBundle.UserID,
		"identityPublicKey":      keyBundle.IdentityPublicKey,
		"signedPreKey":           keyBundle.SignedPreKey,
		"signedPreKeySignature":  keyBundle.SignedPreKeySignature,
		"oneTimePreKeys":         keyBundle.OneTimePreKeys,
		"createdAt":              keyBundle.CreatedAt,
		"updatedAt":              keyBundle.UpdatedAt,
	}
	
	writeJSONResponse(w, http.StatusOK, response)
}

// Получение ключей для инициализации чата
func GetKeysForChat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONResponse(w, http.StatusMethodNotAllowed, map[string]interface{}{
			"error": "Method not allowed",
		})
		return
	}

	userID := r.Context().Value("userId").(string)

	var request struct {
		ChatID      string   `json:"chatId"`
		ParticipantIDs []string `json:"participantIds"`
	}

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSONResponse(w, http.StatusBadRequest, map[string]interface{}{
			"error": "Invalid request body",
		})
		return
	}

	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{
			"error": "Database connection failed",
		})
		return
	}
	defer db.Close()

	// Проверяем, что пользователь является участником чата
	chatIDInt, _ := strconv.Atoi(request.ChatID)
	var isMember bool
	err = db.QueryRow(`
		SELECT EXISTS(SELECT 1 FROM chats WHERE id = $1 AND $2 = ANY(users))
	`, chatIDInt, userID).Scan(&isMember)

	if err != nil || !isMember {
		writeJSONResponse(w, http.StatusForbidden, map[string]interface{}{
			"error": "Access denied",
		})
		return
	}

	// Получаем ключи всех участников
	participantKeys := make(map[string]PublicKeyBundle)

	for _, participantID := range request.ParticipantIDs {
		var keyBundle PublicKeyBundle
		var oneTimeKeysJSON []string

		err = db.QueryRow(`
			SELECT user_id, identity_public_key, signed_pre_key, signed_pre_key_signature, one_time_pre_keys
			FROM user_keys
			WHERE user_id = $1
		`, participantID).Scan(
			&keyBundle.UserID,
			&keyBundle.IdentityPublicKey,
			&keyBundle.SignedPreKey,
			&keyBundle.SignedPreKeySignature,
			&oneTimeKeysJSON,
		)

		if err == nil {
			// Парсим одноразовые ключи
			var oneTimeKeys []OneTimePreKey
			for _, keyStr := range oneTimeKeysJSON {
				var key OneTimePreKey
				if err := json.Unmarshal([]byte(keyStr), &key); err == nil {
					oneTimeKeys = append(oneTimeKeys, key)
				}
			}

			// Возвращаем только один одноразовый ключ
			if len(oneTimeKeys) > 0 {
				keyBundle.OneTimePreKeys = []OneTimePreKey{oneTimeKeys[0]}
			}

			participantKeys[participantID] = keyBundle
		}
	}

	writeJSONResponse(w, http.StatusOK, map[string]interface{}{
		"chatId": request.ChatID,
		"participantKeys": participantKeys,
	})
}

// Ротация одноразовых ключей
func RotateOneTimePreKeys(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONResponse(w, http.StatusMethodNotAllowed, map[string]interface{}{
			"error": "Method not allowed",
		})
		return
	}

	userID := r.Context().Value("userId").(string)

	var request struct {
		NewOneTimePreKeys []OneTimePreKey `json:"newOneTimePreKeys"`
	}

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSONResponse(w, http.StatusBadRequest, map[string]interface{}{
			"error": "Invalid request body",
		})
		return
	}

	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{
			"error": "Database connection failed",
		})
		return
	}
	defer db.Close()

	// Преобразуем новые ключи в массив строк
	var newKeyStrings []string
	for _, key := range request.NewOneTimePreKeys {
		keyJSON, _ := json.Marshal(key)
		newKeyStrings = append(newKeyStrings, string(keyJSON))
	}

	// Добавляем новые ключи к существующим
	_, err = db.Exec(`
		UPDATE user_keys 
		SET one_time_pre_keys = array_cat(one_time_pre_keys, $1), updated_at = NOW()
		WHERE user_id = $2
	`, newKeyStrings, userID)

	if err != nil {
		log.Printf("Error rotating one-time keys: %v", err)
		writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{
			"error": "Error updating keys",
		})
		return
	}

	log.Printf("One-time keys rotated successfully for user %s", userID)
	writeJSONResponse(w, http.StatusOK, map[string]interface{}{
		"message": "Keys rotated successfully",
		"newKeysCount": len(request.NewOneTimePreKeys),
	})
}

// Регистрация маршрутов для работы с ключами
func RegisterCryptoKeyRoutes() {
	http.HandleFunc("/api/keys/upload", authenticate(UploadPublicKeys))
	http.HandleFunc("/api/keys/public", authenticate(GetPublicKeys))
	http.HandleFunc("/api/keys/chat", authenticate(GetKeysForChat))
	http.HandleFunc("/api/keys/rotate", authenticate(RotateOneTimePreKeys))
}