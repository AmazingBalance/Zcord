package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// ErrorResponse представляет структуру для ошибок в формате JSON
type ErrorResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

// SuccessResponse представляет структуру для успешных ответов
type SuccessResponse struct {
	Status string      `json:"status"`
	Data   interface{} `json:"data,omitempty"`
}

// sendError отправляет ошибку в формате JSON
func sendError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(ErrorResponse{
		Status:  strconv.Itoa(statusCode),
		Message: message,
	})
}

// sendSuccess отправляет успешный ответ в формате JSON
func sendSuccess(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(SuccessResponse{
		Status: "success",
		Data:   data,
	})
}

type FriendRequest struct {
	Tag string `json:"tag"`
}

type FriendAcceptRequest struct {
	SenderId string `json:"senderId"`
}

// Функция для преобразования строки "{1,2,3}" в []int
func parseFriendsList(listStr string) []int {
	listStr = strings.Trim(listStr, "{}") // Убираем фигурные скобки
	if listStr == "" {
		return []int{} // Если строка пустая, возвращаем пустой массив
	}

	strIDs := strings.Split(listStr, ",") // Разбиваем строку по запятой
	var intIDs []int

	for _, strID := range strIDs {
		id, err := strconv.Atoi(strings.TrimSpace(strID)) // Конвертируем в int
		if err == nil {
			intIDs = append(intIDs, id) // Добавляем в массив
		}
	}

	return intIDs
}

func FindUserByTag(w http.ResponseWriter, r *http.Request) {
	var req FriendRequest
	body, err := io.ReadAll(r.Body)
	if err != nil {
		sendError(w, "Invalid request", http.StatusBadRequest)
		return
	}
	log.Println("Received request body:", string(body))

	if err := json.Unmarshal(body, &req); err != nil {
		sendError(w, "Invalid request", http.StatusBadRequest)
		return
	}

	senderID := r.Context().Value("userId").(string)

	// Получаем ID текущего пользователя
	// Преобразуем userID в int
	userID, err := strconv.Atoi(senderID)
	if err != nil {
		sendError(w, "Invalid user ID format", http.StatusUnauthorized)
		return
	}

	var user User
	query := `SELECT id, name, avatar, friends_list, friends_list_out, friends_list_in FROM users WHERE tag = $1`
	err = db.QueryRow(query, req.Tag).Scan(&user.ID, &user.Name, &user.ImageSrc, &user.FriendsList, &user.FriendsListOut, &user.FriendsListIn)
	if err == sql.ErrNoRows {
		sendError(w, "User not found", http.StatusNotFound)
		return
	} else if err != nil {
		sendError(w, "Database error", http.StatusInternalServerError)
		return
	}

	// Проверяем, не ищет ли пользователь самого себя
	foundUserID, err := strconv.Atoi(user.ID)
	if err != nil {
		sendError(w, "Invalid found user ID format", http.StatusInternalServerError)
		return
	}

	if userID == foundUserID {
		sendError(w, "User not found", http.StatusNotFound)
		return
	}

	fmt.Println(user.FriendsList)
	fmt.Println(user.FriendsListIn)
	fmt.Println(user.FriendsListOut)

	// Проверяем, есть ли найденный пользователь в друзьях
	isFriend := contains(parseFriendsList(user.FriendsList), userID)
	requestSent := contains(parseFriendsList(user.FriendsListOut), userID)    // Если текущий юзер отправил запрос
	requestReceived := contains(parseFriendsList(user.FriendsListIn), userID) // Если текущий юзер получил запрос

	// Отправляем JSON с информацией о пользователе и статусами дружбы
	response := struct {
		User            User `json:"user"`
		IsFriend        bool `json:"isFriend"`
		RequestSent     bool `json:"requestSent"`
		RequestReceived bool `json:"requestReceived"`
	}{
		User:            user,
		IsFriend:        isFriend,
		RequestSent:     requestSent,
		RequestReceived: requestReceived,
	}

	sendSuccess(w, response)
}

// Функция для проверки наличия userID в списке друзей
func contains(list []int, userID int) bool {
	for _, id := range list {
		if id == userID {
			return true
		}
	}
	return false
}

func SendFriendRequest(w http.ResponseWriter, r *http.Request) {
	var req FriendAcceptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, "Invalid request", http.StatusBadRequest)
		return
	}

	userIDStr, ok := r.Context().Value("userId").(string)
	if !ok {
		sendError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		sendError(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	// Конвертируем senderID из string в int
	targetID, err := strconv.Atoi(req.SenderId)
	if err != nil {
		sendError(w, "Invalid target ID", http.StatusBadRequest)
		return
	}

	// Проверяем, не пытается ли пользователь отправить запрос самому себе
	if userID == targetID {
		sendError(w, "Cannot send friend request to yourself", http.StatusBadRequest)
		return
	}

	// Проверяем, не являются ли пользователи уже друзьями
	var isFriend bool
	err = db.QueryRow(`
		SELECT EXISTS (
			SELECT 1 FROM users WHERE id = $1 AND $2 = ANY(friends_list)
		)`, userID, targetID).Scan(&isFriend)
	if err != nil {
		sendError(w, "Database error", http.StatusInternalServerError)
		return
	}
	if isFriend {
		sendError(w, "Users are already friends", http.StatusBadRequest)
		return
	}

	// Проверяем, не отправлена ли уже заявка
	var requestExists bool
	err = db.QueryRow(`
		SELECT EXISTS (
			SELECT 1 FROM users WHERE id = $1 AND $2 = ANY(friends_list_out)
		)`, userID, targetID).Scan(&requestExists)
	if err != nil {
		sendError(w, "Database error", http.StatusInternalServerError)
		return
	}
	if requestExists {
		sendError(w, "Friend request already sent", http.StatusBadRequest)
		return
	}

	// Проверяем, не получена ли уже заявка от этого пользователя
	var requestReceived bool
	err = db.QueryRow(`
		SELECT EXISTS (
			SELECT 1 FROM users WHERE id = $1 AND $2 = ANY(friends_list_in)
		)`, userID, targetID).Scan(&requestReceived)
	if err != nil {
		sendError(w, "Database error", http.StatusInternalServerError)
		return
	}
	if requestReceived {
		sendError(w, "Friend request already received from this user", http.StatusBadRequest)
		return
	}

	// Обновляем friends_list_out у отправителя и friends_list_in у получателя
	_, err1 := db.Exec(`UPDATE users SET friends_list_out = array_append(friends_list_out, $1) WHERE id = $2`, targetID, userID)
	if err1 != nil {
		sendError(w, "Error adding to friends_list_out", http.StatusInternalServerError)
		return
	}

	_, err = db.Exec(`UPDATE users SET friends_list_in = array_append(friends_list_in, $1) WHERE id = $2`, userID, targetID)
	if err != nil {
		sendError(w, "Error adding to friends_list_in", http.StatusInternalServerError)
		return
	}

	// Notify both users to refresh friends lists in real-time
	if wsHub != nil {
		wsHub.SendToUser(strconv.Itoa(userID), WSMessage{Type: MessageTypeFriendsUpdated})
		wsHub.SendToUser(strconv.Itoa(targetID), WSMessage{Type: MessageTypeFriendsUpdated})
	}

	sendSuccess(w, nil)
}

func AcceptFriendRequest(w http.ResponseWriter, r *http.Request) {
	var req FriendAcceptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Получаем userID из контекста
	userIDStr, ok := r.Context().Value("userId").(string)
	if !ok {
		sendError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Конвертируем userID из string в int
	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		sendError(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	// Конвертируем senderID из string в int
	senderID, err := strconv.Atoi(req.SenderId)
	fmt.Println(req.SenderId)
	if err != nil {
		sendError(w, "Invalid sender ID", http.StatusBadRequest)
		return
	}

	fmt.Println("User ID:", userID, "Sender ID:", senderID)

	// Проверяем, есть ли заявка в friends_list_in у userID
	var exists bool
	err = db.QueryRow(`
        SELECT EXISTS (
            SELECT 1 FROM users WHERE id = $2 AND $1 = ANY(friends_list_in)
        )`, senderID, userID).Scan(&exists)
	if err != nil {
		sendError(w, "Database error", http.StatusInternalServerError)
		return
	}
	if !exists {
		sendError(w, "Friend request not found", http.StatusNotFound)
		return
	}

	// Начинаем транзакцию
	tx, err := db.Begin()
	if err != nil {
		sendError(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Удаляем senderID из friends_list_in у userID
	_, err = tx.Exec(`UPDATE users SET friends_list_in = array_remove(friends_list_in, $1) WHERE id = $2`, senderID, userID)
	if err != nil {
		sendError(w, "Error updating friends_list_in", http.StatusInternalServerError)
		return
	}

	// Удаляем userID из friends_list_out у senderID
	_, err = tx.Exec(`UPDATE users SET friends_list_out = array_remove(friends_list_out, $1) WHERE id = $2`, userID, senderID)
	if err != nil {
		sendError(w, "Error updating friends_list_out", http.StatusInternalServerError)
		return
	}

	// Добавляем друг друга в friends_list
	_, err = tx.Exec(`UPDATE users SET friends_list = array_append(friends_list, $1) WHERE id = $2`, senderID, userID)
	if err != nil {
		sendError(w, "Error updating friends_list", http.StatusInternalServerError)
		return
	}

	_, err = tx.Exec(`UPDATE users SET friends_list = array_append(friends_list, $1) WHERE id = $2`, userID, senderID)
	if err != nil {
		sendError(w, "Error updating friends_list", http.StatusInternalServerError)
		return
	}

	// Фиксируем транзакцию
	if err := tx.Commit(); err != nil {
		sendError(w, "Error committing transaction", http.StatusInternalServerError)
		return
	}

	// Notify both users to refresh friends state without page reload
	if wsHub != nil {
		wsHub.SendToUser(strconv.Itoa(userID), WSMessage{Type: MessageTypeFriendsUpdated})
		wsHub.SendToUser(strconv.Itoa(senderID), WSMessage{Type: MessageTypeFriendsUpdated})
	}

	sendSuccess(w, nil)
}

func RemoveFriend(w http.ResponseWriter, r *http.Request) {
	var req FriendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, "Invalid request", http.StatusBadRequest)
		return
	}

	userID := r.Context().Value("userId").(string)
	var friendID int
	if err := db.QueryRow(`SELECT id FROM users WHERE tag = $1`, req.Tag).Scan(&friendID); err != nil {
		sendError(w, "User not found", http.StatusNotFound)
		return
	}

	// Обновляем friends_list, удаляя друга из массива
	if _, err := db.Exec(`UPDATE users SET friends_list = array_remove(friends_list, $1) WHERE id = $2`, friendID, userID); err != nil {
		sendError(w, "Error removing friend", http.StatusInternalServerError)
		return
	}

	if _, err := db.Exec(`UPDATE users SET friends_list = array_remove(friends_list, $1) WHERE id = $2`, userID, friendID); err != nil {
		sendError(w, "Error removing friend", http.StatusInternalServerError)
		return
	}

	// If LS chat exists, add a system message. Client will show the chat as read-only.
	currentUserID, parseErr := strconv.Atoi(userID)
	if parseErr == nil {
		var currentUserName string
		if err := db.QueryRow(`SELECT name FROM users WHERE id = $1`, currentUserID).Scan(&currentUserName); err == nil {
			var lsChatID int
			var lastMessageID sql.NullString
			err := db.QueryRow(`
				SELECT id, last_message_id
				FROM chats
				WHERE $1 = ANY(users) AND $2 = ANY(users)
				AND array_length(users, 1) = 2
				AND name = 'LS Chat'`, currentUserID, friendID).Scan(&lsChatID, &lastMessageID)
			if err == nil {
				var prevMessageID *string
				if lastMessageID.Valid && lastMessageID.String != "" {
					prevMessageID = &lastMessageID.String
				}

				systemText := currentUserName + " отменил дружбу, вы больше не можете писать сообщения"
				var newMessageID string
				if err := db.QueryRow(
					`INSERT INTO messages (text, type, user_id, chat_id, prev_message_id)
					VALUES ($1, 'system', NULL, $2, $3) RETURNING id`,
					systemText, lsChatID, prevMessageID,
				).Scan(&newMessageID); err == nil {
					_, _ = db.Exec(`UPDATE chats SET last_message_id = $1, last_user_id = NULL WHERE id = $2`, newMessageID, lsChatID)

					if wsHub != nil {
						chatIDStr := strconv.Itoa(lsChatID)
						wsHub.SendToChat(chatIDStr, WSMessage{
							Type:   MessageTypeNewMessage,
							ChatID: chatIDStr,
							Data: MessageData{
								ID:     newMessageID,
								Text:   systemText,
								ChatID: chatIDStr,
								SentAt: time.Now().Unix(),
							},
						})
						wsHub.SendToUser(strconv.Itoa(currentUserID), WSMessage{Type: MessageTypeChatUpdated, ChatID: chatIDStr})
						wsHub.SendToUser(strconv.Itoa(friendID), WSMessage{Type: MessageTypeChatUpdated, ChatID: chatIDStr})
					}
				}
			}
		}
	}

	// Notify both users to refresh friends lists in real-time
	if wsHub != nil {
		wsHub.SendToUser(userID, WSMessage{Type: MessageTypeFriendsUpdated})
		wsHub.SendToUser(strconv.Itoa(friendID), WSMessage{Type: MessageTypeFriendsUpdated})
	}

	sendSuccess(w, nil)
}

func RejectFriendRequest(w http.ResponseWriter, r *http.Request) {
	var req FriendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, "Invalid request", http.StatusBadRequest)
		return
	}

	userID := r.Context().Value("userId").(string)
	var senderID int
	if err := db.QueryRow(`SELECT id FROM users WHERE tag = $1`, req.Tag).Scan(&senderID); err != nil {
		if err == sql.ErrNoRows {
			sendError(w, "User not found", http.StatusNotFound)
		} else {
			sendError(w, "Database error", http.StatusInternalServerError)
		}
		return
	}

	// Проверяем, есть ли такой запрос на дружбу
	var exists bool
	err := db.QueryRow(`
		SELECT EXISTS (
			SELECT 1 FROM users WHERE id = $2 AND $1 = ANY(friends_list_in)
		)`, senderID, userID).Scan(&exists)
	if err != nil {
		sendError(w, "Database error", http.StatusInternalServerError)
		return
	}
	if !exists {
		sendError(w, "Friend request not found", http.StatusNotFound)
		return
	}

	// Удаляем запрос на дружбу из friends_list_in у userID
	if _, err := db.Exec(`UPDATE users SET friends_list_in = array_remove(friends_list_in, $1) WHERE id = $2`, senderID, userID); err != nil {
		sendError(w, "Error removing friend request", http.StatusInternalServerError)
		return
	}

	// Удаляем userID из friends_list_out у senderID
	if _, err := db.Exec(`UPDATE users SET friends_list_out = array_remove(friends_list_out, $1) WHERE id = $2`, userID, senderID); err != nil {
		sendError(w, "Error removing friend request", http.StatusInternalServerError)
		return
	}

	sendSuccess(w, map[string]string{"message": "Friend request rejected"})
}

func CancelFriendRequest(w http.ResponseWriter, r *http.Request) {
	var req FriendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, "Invalid request", http.StatusBadRequest)
		return
	}

	userIDStr := r.Context().Value("userId").(string)
	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		sendError(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	var targetID int
	if err := db.QueryRow(`SELECT id FROM users WHERE tag = $1`, req.Tag).Scan(&targetID); err != nil {
		if err == sql.ErrNoRows {
			sendError(w, "User not found", http.StatusNotFound)
		} else {
			sendError(w, "Database error", http.StatusInternalServerError)
		}
		return
	}

	// Проверяем, есть ли исходящий запрос
	var exists bool
	err = db.QueryRow(`
		SELECT EXISTS (
			SELECT 1 FROM users WHERE id = $2 AND $1 = ANY(friends_list_out)
		)`, targetID, userID).Scan(&exists)
	if err != nil {
		sendError(w, "Database error", http.StatusInternalServerError)
		return
	}
	if !exists {
		sendError(w, "Friend request not found", http.StatusNotFound)
		return
	}

	// Удаляем userID из friends_list_out (он отменяет свою заявку)
	if _, err := db.Exec(`UPDATE users SET friends_list_out = array_remove(friends_list_out, $1) WHERE id = $2`, targetID, userID); err != nil {
		sendError(w, "Error removing friend request", http.StatusInternalServerError)
		return
	}

	// Удаляем targetID из friends_list_in (у того, кому отправлялась заявка)
	if _, err := db.Exec(`UPDATE users SET friends_list_in = array_remove(friends_list_in, $1) WHERE id = $2`, userID, targetID); err != nil {
		sendError(w, "Error removing friend request", http.StatusInternalServerError)
		return
	}

	sendSuccess(w, map[string]string{"message": "Friend request canceled"})
}

func GetFriendsList(userID int) ([]int, error) {
	rows, err := db.Query(`SELECT unnest(friends_list) FROM users WHERE id = $1`, userID)
	if err != nil {
		return nil, fmt.Errorf("database error: %v", err)
	}
	defer rows.Close()

	var friends []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan error: %v", err)
		}
		friends = append(friends, id)
	}
	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("rows error: %v", err)
	}
	return friends, nil
}

func GetFriendsRequests(userID int, reqType string) ([]int, error) {
	var column string
	switch reqType {
	case "incoming":
		column = "friends_list_in"
	case "outgoing":
		column = "friends_list_out"
	default:
		return nil, fmt.Errorf("invalid request type")
	}

	query := fmt.Sprintf(`SELECT unnest(%s) FROM users WHERE id = $1`, column)
	rows, err := db.Query(query, userID)
	if err != nil {
		return nil, fmt.Errorf("database error: %v", err)
	}
	defer rows.Close()

	var requests []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan error: %v", err)
		}
		requests = append(requests, id)
	}
	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("rows error: %v", err)
	}
	return requests, nil
}

func RegisterFriendRoutes() {
	http.HandleFunc("/api/friends/search", authenticate(FindUserByTag))
	http.HandleFunc("/api/friends/request", authenticate(SendFriendRequest))
	http.HandleFunc("/api/friends/accept", authenticate(AcceptFriendRequest))
	http.HandleFunc("/api/friends/reject", authenticate(RejectFriendRequest))
	http.HandleFunc("/api/friends/cancel", authenticate(CancelFriendRequest))
	http.HandleFunc("/api/friends/remove", authenticate(RemoveFriend))
}
