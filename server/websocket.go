package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
)

// WebSocket upgrader
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// В продакшене нужно проверять origin более строго
		return true
	},
}

// WebSocket Hub управляет всеми активными соединениями
type WebSocketHub struct {
	// Зарегистрированные клиенты
	clients map[*Client]bool

	// Канал для регистрации клиентов
	register chan *Client

	// Канал для отмены регистрации клиентов
	unregister chan *Client

	// Канал для широковещательных сообщений
	broadcast chan []byte

	// Мьютекс для безопасного доступа к clients
	mutex sync.RWMutex

	// Redis клиент для pub/sub
	redisClient *redis.Client

	// Контекст для Redis операций
	ctx context.Context

	// Removed in-memory call sessions to rely solely on database
	// Delay cleanup/offline notifications on transient reconnects
	pendingUserCleanupMu sync.Mutex
	pendingUserCleanup   map[string]*time.Timer
}

func (h *WebSocketHub) cleanupUserCalls(userID string) {
	rows, err := db.Query(`
		SELECT DISTINCT c.chat_id
		FROM calls c
		JOIN call_participants cp ON cp.call_id = c.id
		WHERE c.is_active = TRUE AND cp.is_active = TRUE AND cp.user_id = $1
	`, userID)
	if err != nil {
		log.Printf("Error finding active calls for user %s: %v", userID, err)
		return
	}
	defer rows.Close()

	var chatIDs []string
	for rows.Next() {
		var chatID string
		if err := rows.Scan(&chatID); err != nil {
			log.Printf("Error scanning chat_id for user %s: %v", userID, err)
			return
		}
		chatIDs = append(chatIDs, chatID)
	}

	if err := rows.Err(); err != nil {
		log.Printf("Error iterating active calls for user %s: %v", userID, err)
		return
	}

	tmpClient := &Client{hub: h}

	for _, chatID := range chatIDs {
		var callID int
		var remainingParticipants int

		if err := db.QueryRow(`SELECT * FROM leave_call($1, $2)`, chatID, userID).Scan(&callID, &remainingParticipants); err != nil {
			log.Printf("Error cleaning up call leave for user %s in chat %s: %v", userID, chatID, err)
			continue
		}

		if callID != 0 && remainingParticipants == 0 {
			tmpClient.sendCallEndSystemMessageByID(chatID, callID)
		}
	}
}

// Client представляет WebSocket соединение
type Client struct {
	// WebSocket соединение
	conn *websocket.Conn

	// Буферизованный канал исходящих сообщений
	send chan []byte

	// Hub, к которому принадлежит клиент
	hub *WebSocketHub

	// ID пользователя
	userID string

	// ID сессии
	sessionID string

	// Подписки на чаты
	chatSubscriptions map[string]bool

	// Мьютекс для безопасного доступа к подпискам
	subMutex sync.RWMutex
}

// WebSocket сообщение
type WSMessage struct {
	Type      string      `json:"type"`
	ChatID    string      `json:"chatId,omitempty"`
	UserID    string      `json:"userId,omitempty"`
	Data      interface{} `json:"data"`
	Timestamp int64       `json:"timestamp"`
}

// Данные сообщения
type MessageData struct {
	ID          string              `json:"id"`
	Text        string              `json:"text"`
	UserID      string              `json:"userId"`
	UserName    string              `json:"userName"`
	ChatID      string              `json:"chatId"`
	IsEncrypted bool                `json:"isEncrypted"`
	Attachments []MessageAttachment `json:"attachments,omitempty"`
	ReplyTo     string              `json:"replyTo,omitempty"`
	ReadBy      []string            `json:"readBy,omitempty"`
	SentAt      int64               `json:"sentAt"`
}

// Вложение сообщения
type MessageAttachment struct {
	Type        string `json:"type"`
	URL         string `json:"url"`
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
	Thumbnail   string `json:"thumbnail,omitempty"`
	FileSize    int64  `json:"fileSize,omitempty"`
	MimeType    string `json:"mimeType,omitempty"`
	Width       int    `json:"width,omitempty"`
	Height      int    `json:"height,omitempty"`
	Duration    int    `json:"duration,omitempty"`
}

// WebRTC message types

// WebRTC сообщения
type WebRTCMessage struct {
	Type            string        `json:"type"`
	ChatID          string        `json:"chatId,omitempty"`
	CallID          int           `json:"callId,omitempty"`
	TargetUserID    string        `json:"targetUserId,omitempty"`
	FromUserID      string        `json:"fromUserId,omitempty"`
	Offer           interface{}   `json:"offer,omitempty"`
	Answer          interface{}   `json:"answer,omitempty"`
	Candidate       interface{}   `json:"candidate,omitempty"`
	Participants    []interface{} `json:"participants,omitempty"`
	CallType        string        `json:"callType,omitempty"`
	ChatType        string        `json:"chatType,omitempty"`
	GlobalStartTime int64         `json:"globalStartTime,omitempty"`
}

// Системное сообщение
type SystemMessage struct {
	Text      string `json:"text"`
	Type      string `json:"type"`
	Timestamp int64  `json:"timestamp"`
}

// Типы WebSocket сообщений
const (
	MessageTypeNewMessage      = "new_message"
	MessageTypeMessageRead     = "message_read"
	MessageTypeUserOnline      = "user_online"
	MessageTypeUserOffline     = "user_offline"
	MessageTypeTypingStart     = "typing_start"
	MessageTypeTypingStop      = "typing_stop"
	MessageTypeFriendRequest   = "friend_request"
	MessageTypeFriendsUpdated  = "friends_updated"
	MessageTypeChatUpdated     = "chat_updated"
	MessageTypeSubscribeChat   = "subscribe_chat"
	MessageTypeUnsubscribeChat = "unsubscribe_chat"
	MessageTypePing            = "ping"
	MessageTypePong            = "pong"
	MessageTypeError           = "error"
	// WebRTC сообщения
	MessageTypeWebRTCOffer        = "webrtc_offer"
	MessageTypeWebRTCAnswer       = "webrtc_answer"
	MessageTypeWebRTCIceCandidate = "webrtc_ice_candidate"
	MessageTypeWebRTCJoinCall     = "webrtc_join_call"
	MessageTypeWebRTCLeaveCall    = "webrtc_leave_call"
	MessageTypeWebRTCUserJoined   = "webrtc_user_joined"
	MessageTypeWebRTCUserLeft     = "webrtc_user_left"
	MessageTypeWebRTCScreenShareStarted = "webrtc_screen_share_started"
	MessageTypeWebRTCScreenShareStopped = "webrtc_screen_share_stopped"
	MessageTypeSendSystemMessage  = "send_system_message"
	MessageTypeCheckActiveCall    = "check_active_call"
	MessageTypeActiveCallResponse = "active_call_response"
)

// Глобальный hub
var wsHub *WebSocketHub
var wsHubInitOnce sync.Once

// Инициализация WebSocket Hub
func InitWebSocketHub(redisClient *redis.Client) {
	wsHubInitOnce.Do(func() {
		ctx := context.Background()
		wsHub = &WebSocketHub{
			clients:            make(map[*Client]bool),
			register:           make(chan *Client),
			unregister:         make(chan *Client),
			broadcast:          make(chan []byte),
			redisClient:        redisClient,
			ctx:                ctx,
			pendingUserCleanup: make(map[string]*time.Timer),
		}

		go wsHub.run()
		go wsHub.handleRedisMessages()
	})
}

// Запуск Hub
func (h *WebSocketHub) cancelUserCleanup(userID string) {
	h.pendingUserCleanupMu.Lock()
	defer h.pendingUserCleanupMu.Unlock()

	if t, ok := h.pendingUserCleanup[userID]; ok {
		t.Stop()
		delete(h.pendingUserCleanup, userID)
	}
}

func (h *WebSocketHub) scheduleUserCleanup(userID string) {
	// Delay cleanup slightly to avoid ending calls on quick WS reconnects / page reloads.
	const grace = 4 * time.Second

	h.pendingUserCleanupMu.Lock()
	if t, ok := h.pendingUserCleanup[userID]; ok {
		t.Stop()
	}
	h.pendingUserCleanup[userID] = time.AfterFunc(grace, func() {
		h.cleanupUserCalls(userID)
		h.notifyUserOffline(userID)

		h.pendingUserCleanupMu.Lock()
		delete(h.pendingUserCleanup, userID)
		h.pendingUserCleanupMu.Unlock()
	})
	h.pendingUserCleanupMu.Unlock()
}

func (h *WebSocketHub) run() {
	for {
		select {
		case client := <-h.register:
			h.mutex.Lock()
			h.clients[client] = true
			h.mutex.Unlock()

			log.Printf("WebSocket client registered: user %s, session %s", client.userID, client.sessionID)

			// Cancel any pending cleanup if user reconnects quickly.
			h.cancelUserCleanup(client.userID)

			// Сохраняем сессию в базе данных
			h.saveSession(client)

			// Уведомляем о том, что пользователь онлайн
			h.notifyUserOnline(client.userID)

		case client := <-h.unregister:
			h.mutex.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
				h.mutex.Unlock()

				log.Printf("WebSocket client unregistered: user %s, session %s", client.userID, client.sessionID)

				// Удаляем сессию из базы данных
				h.removeSession(client)

				// Проверяем, есть ли еще активные сессии пользователя
				if !h.hasActiveUserSessions(client.userID) {
					h.scheduleUserCleanup(client.userID)
				}
			} else {
				h.mutex.Unlock()
			}

		case message := <-h.broadcast:
			h.mutex.Lock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mutex.Unlock()
		}
	}
}

// Обработка сообщений из Redis
func (h *WebSocketHub) handleRedisMessages() {
	if h.redisClient == nil {
		log.Println("Redis is disabled; WebSocket hub is running in-memory only")
		return
	}
	// Подписываемся на глобальный канал и каналы чатов
	pubsub := h.redisClient.Subscribe(h.ctx, "global")
	defer pubsub.Close()

	// Также подписываемся на паттерн для всех чатов
	psubsub := h.redisClient.PSubscribe(h.ctx, "chat:*")
	defer psubsub.Close()

	// Обрабатываем сообщения из обычных каналов
	go func() {
		ch := pubsub.Channel()
		for msg := range ch {
			log.Printf("Received Redis global message: %s", msg.Payload)
			h.broadcast <- []byte(msg.Payload)
		}
	}()

	// Обрабатываем сообщения из каналов чатов
	pch := psubsub.Channel()
	for msg := range pch {
		log.Printf("Received Redis chat message from %s: %s", msg.Channel, msg.Payload)

		// Отправляем сообщение только подписанным на этот чат клиентам
		h.broadcastToChatSubscribers(msg.Channel, []byte(msg.Payload))
	}
}

// Отправка сообщения только клиентам, подписанным на конкретный чат
func (h *WebSocketHub) broadcastToChatSubscribers(channel string, message []byte) {
	// Извлекаем chatID из канала (формат: "chat:123")
	if len(channel) < 5 || channel[:5] != "chat:" {
		return
	}
	chatID := channel[5:]

	h.mutex.Lock()
	defer h.mutex.Unlock()

	for client := range h.clients {
		client.subMutex.RLock()
		isSubscribed := client.chatSubscriptions[chatID]
		client.subMutex.RUnlock()

		if isSubscribed {
			select {
			case client.send <- message:
				log.Printf("Sent message to client %s for chat %s", client.userID, chatID)
			default:
				close(client.send)
				delete(h.clients, client)
				log.Printf("Client %s disconnected while sending message", client.userID)
			}
		}
	}
}

func (h *WebSocketHub) broadcastToAllClients(message []byte) {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	for client := range h.clients {
		select {
		case client.send <- message:
		default:
			close(client.send)
			delete(h.clients, client)
		}
	}
}

func (h *WebSocketHub) broadcastToUserSubscribers(channel string, message []byte) {
	if !strings.HasPrefix(channel, "user:") {
		return
	}
	userID := channel[5:]

	h.mutex.Lock()
	defer h.mutex.Unlock()

	for client := range h.clients {
		if client.userID != userID {
			continue
		}
		select {
		case client.send <- message:
		default:
			close(client.send)
			delete(h.clients, client)
		}
	}
}

// Сохранение сессии в базе данных
func (h *WebSocketHub) saveSession(client *Client) {
	_, err := db.Exec(`
		INSERT INTO websocket_sessions (user_id, session_id, connected_at, last_ping, is_active)
		VALUES ($1, $2, NOW(), NOW(), true)
		ON CONFLICT (session_id) DO UPDATE SET
			connected_at = NOW(),
			last_ping = NOW(),
			is_active = true
	`, client.userID, client.sessionID)

	if err != nil {
		log.Printf("Error saving WebSocket session: %v", err)
	}

	// Обновляем статус пользователя
	_, err = db.Exec(`
		UPDATE users SET status = 'online', last_seen = NOW() WHERE id = $1
	`, client.userID)

	if err != nil {
		log.Printf("Error updating user status: %v", err)
	}
}

// Удаление сессии из базы данных
func (h *WebSocketHub) removeSession(client *Client) {
	_, err := db.Exec(`
		UPDATE websocket_sessions SET is_active = false WHERE session_id = $1
	`, client.sessionID)

	if err != nil {
		log.Printf("Error removing WebSocket session: %v", err)
	}
}

// Проверка активных сессий пользователя
func (h *WebSocketHub) hasActiveUserSessions(userID string) bool {
	h.mutex.RLock()
	defer h.mutex.RUnlock()

	for client := range h.clients {
		if client.userID == userID {
			return true
		}
	}
	return false
}

// Уведомление о том, что пользователь онлайн
func (h *WebSocketHub) notifyUserOnline(userID string) {
	message := WSMessage{
		Type:      MessageTypeUserOnline,
		UserID:    userID,
		Timestamp: time.Now().Unix(),
	}

	h.publishToRedis("global", message)

	// Обновляем статус в базе данных
	_, err := db.Exec(`
		UPDATE users SET status = 'online', last_seen = NOW() WHERE id = $1
	`, userID)

	if err != nil {
		log.Printf("Error updating user online status: %v", err)
	}
}

// Уведомление о том, что пользователь оффлайн
func (h *WebSocketHub) notifyUserOffline(userID string) {
	message := WSMessage{
		Type:      MessageTypeUserOffline,
		UserID:    userID,
		Timestamp: time.Now().Unix(),
	}

	h.publishToRedis("global", message)

	// Обновляем статус в базе данных
	_, err := db.Exec(`
		UPDATE users SET status = 'offline', last_seen = NOW() WHERE id = $1
	`, userID)

	if err != nil {
		log.Printf("Error updating user offline status: %v", err)
	}
}

// Публикация сообщения в Redis
func (h *WebSocketHub) publishToRedis(channel string, message WSMessage) {
	messageBytes, err := json.Marshal(message)
	if err != nil {
		log.Printf("Error marshaling message: %v", err)
		return
	}

	if h.redisClient == nil {
		switch {
		case channel == "global":
			h.broadcastToAllClients(messageBytes)
		case strings.HasPrefix(channel, "chat:"):
			h.broadcastToChatSubscribers(channel, messageBytes)
		case strings.HasPrefix(channel, "user:"):
			h.broadcastToUserSubscribers(channel, messageBytes)
		}
		return
	}

	err = h.redisClient.Publish(h.ctx, channel, messageBytes).Err()
	if err != nil {
		log.Printf("Error publishing to Redis: %v", err)
	}
}

// Отправка сообщения в конкретный чат
func (h *WebSocketHub) SendToChat(chatID string, message WSMessage) {
	message.ChatID = chatID
	message.Timestamp = time.Now().Unix()

	h.publishToRedis("chat:"+chatID, message)
}

// Отправка сообщения конкретному пользователю
func (h *WebSocketHub) SendToUser(userID string, message WSMessage) {
	message.UserID = userID
	message.Timestamp = time.Now().Unix()

	h.publishToRedis("user:"+userID, message)
}

// Генерация ID сессии
func generateSessionID() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return ""
	}
	return hex.EncodeToString(bytes)
}

// WebSocket handler
func HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Получаем токен из query параметра
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "Token required", http.StatusUnauthorized)
		return
	}

	// Проверяем токен и получаем userID
	userID, err := validateToken(token)
	if err != nil {
		log.Printf("WebSocket authentication failed: %v", err)
		http.Error(w, "Invalid token", http.StatusUnauthorized)
		return
	}

	userIDStr := userID

	if wsHub == nil {
		InitWebSocketHub(redisClient)
	}

	// Обновляем соединение до WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	// Создаем клиента
	client := &Client{
		conn:              conn,
		send:              make(chan []byte, 256),
		hub:               wsHub,
		userID:            userIDStr,
		sessionID:         generateSessionID(),
		chatSubscriptions: make(map[string]bool),
	}

	// Регистрируем клиента
	if client.hub == nil {
		http.Error(w, "WebSocket hub unavailable", http.StatusServiceUnavailable)
		_ = conn.Close()
		return
	}

	client.hub.register <- client

	// Запускаем горутины для чтения и записи
	go client.writePump()
	go client.readPump()
}

// Чтение сообщений от клиента
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	// Настройки таймаутов
	// Allow larger payloads (e.g. WebRTC SDP offers/answers) over WS signaling.
	c.conn.SetReadLimit(1024 * 1024) // 1MB
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, messageBytes, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		// Парсим сообщение
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))

		var wsMsg WSMessage
		if err := json.Unmarshal(messageBytes, &wsMsg); err != nil {
			log.Printf("Error parsing WebSocket message: %v", err)
			continue
		}

		// Обрабатываем сообщение
		c.handleMessage(wsMsg)
	}
}

// Запись сообщений клиенту
func (c *Client) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Добавляем дополнительные сообщения из очереди
			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// Обработка входящих сообщений от клиента
func (c *Client) handleMessage(wsMsg WSMessage) {
	switch wsMsg.Type {
	case MessageTypeSubscribeChat:
		c.subscribeToChat(wsMsg.ChatID)
	case MessageTypeUnsubscribeChat:
		c.unsubscribeFromChat(wsMsg.ChatID)
	case MessageTypePing:
		c.sendPong()
	case MessageTypeTypingStart:
		c.handleTyping(wsMsg.ChatID, true)
	case MessageTypeTypingStop:
		c.handleTyping(wsMsg.ChatID, false)
	case MessageTypeMessageRead:
		c.handleMessageRead(wsMsg.ChatID, wsMsg.Data)
	case MessageTypeWebRTCOffer:
		c.handleWebRTCOffer(wsMsg.Data)
	case MessageTypeWebRTCAnswer:
		c.handleWebRTCAnswer(wsMsg.Data)
	case MessageTypeWebRTCIceCandidate:
		c.handleWebRTCIceCandidate(wsMsg.Data)
	case MessageTypeWebRTCJoinCall:
		c.handleWebRTCJoinCall(wsMsg.Data)
	case MessageTypeWebRTCLeaveCall:
		c.handleWebRTCLeaveCall(wsMsg.Data)
	case MessageTypeWebRTCScreenShareStarted:
		c.handleWebRTCScreenShareStarted(wsMsg.Data)
	case MessageTypeWebRTCScreenShareStopped:
		c.handleWebRTCScreenShareStopped(wsMsg.Data)
	case MessageTypeSendSystemMessage:
		c.handleSendSystemMessage(wsMsg.Data)
	case MessageTypeCheckActiveCall:
		c.handleCheckActiveCall(wsMsg.Data)
	default:
		log.Printf("Unknown WebSocket message type: %s", wsMsg.Type)
	}
}

// Подписка на чат
func (c *Client) subscribeToChat(chatID string) {
	c.subMutex.Lock()
	c.chatSubscriptions[chatID] = true
	c.subMutex.Unlock()

	log.Printf("User %s subscribed to chat %s", c.userID, chatID)
}

// Отписка от чата
func (c *Client) unsubscribeFromChat(chatID string) {
	c.subMutex.Lock()
	delete(c.chatSubscriptions, chatID)
	c.subMutex.Unlock()

	log.Printf("User %s unsubscribed from chat %s", c.userID, chatID)
}

// Отправка pong
func (c *Client) sendPong() {
	pongMsg := WSMessage{
		Type:      MessageTypePong,
		Timestamp: time.Now().Unix(),
	}

	msgBytes, _ := json.Marshal(pongMsg)
	select {
	case c.send <- msgBytes:
	default:
		close(c.send)
	}
}

// Обработка печатания
func (c *Client) handleTyping(chatID string, isTyping bool) {
	msgType := MessageTypeTypingStop
	if isTyping {
		msgType = MessageTypeTypingStart
	}

	typingMsg := WSMessage{
		Type:      msgType,
		ChatID:    chatID,
		UserID:    c.userID,
		Timestamp: time.Now().Unix(),
	}

	c.hub.SendToChat(chatID, typingMsg)
}

// Обработка прочтения сообщений
func (c *Client) handleMessageRead(chatID string, data interface{}) {
	// Обновляем статус прочтения чата (последнее прочитанное сообщение + время).
	userIDInt, err := strconv.Atoi(c.userID)
	if err != nil {
		log.Printf("Error parsing user ID: %v", err)
		return
	}

	chatIDInt, err := strconv.Atoi(chatID)
	if err != nil {
		log.Printf("Error parsing chat ID: %v", err)
		return
	}

	var payload struct {
		MessageIDs        []string `json:"messageIds"`
		LastReadMessageID string   `json:"lastReadMessageId"`
	}
	if dataBytes, err := json.Marshal(data); err == nil {
		_ = json.Unmarshal(dataBytes, &payload)
	}

	lastReadMessageID := strings.TrimSpace(payload.LastReadMessageID)
	if lastReadMessageID == "" && len(payload.MessageIDs) > 0 {
		lastReadMessageID = strings.TrimSpace(payload.MessageIDs[len(payload.MessageIDs)-1])
	}

	if lastReadMessageID == "" {
		return
	}

	var lastReadAt time.Time
	if err := db.QueryRow(`
		SELECT created_at
		FROM messages
		WHERE id = $1 AND chat_id = $2
	`, lastReadMessageID, chatIDInt).Scan(&lastReadAt); err != nil {
		log.Printf("Error getting message created_at for read-status: %v", err)
		return
	}

	_, err = db.Exec(`
		INSERT INTO chat_read_status (chat_id, user_id, last_read_message_id, last_read_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (chat_id, user_id) DO UPDATE
		SET last_read_message_id = EXCLUDED.last_read_message_id,
		    last_read_at = EXCLUDED.last_read_at
		WHERE chat_read_status.last_read_at < EXCLUDED.last_read_at
	`, chatIDInt, userIDInt, lastReadMessageID, lastReadAt)
	if err != nil {
		log.Printf("Error updating chat read status: %v", err)
		return
	}

	// Уведомляем других участников чата о прочтении
	readMsg := WSMessage{
		Type:      MessageTypeMessageRead,
		ChatID:    chatID,
		UserID:    c.userID,
		Data:      data,
		Timestamp: time.Now().Unix(),
	}

	c.hub.SendToChat(chatID, readMsg)
}

// Обработка WebRTC offer
func (c *Client) handleWebRTCOffer(data interface{}) {
	var webrtcMsg WebRTCMessage
	dataBytes, _ := json.Marshal(data)
	if err := json.Unmarshal(dataBytes, &webrtcMsg); err != nil {
		logWebRTC("Error parsing WebRTC offer: %v", err)
		return
	}

	logWebRTC("User %s sending offer to %s", c.userID, webrtcMsg.TargetUserID)

	webrtcMsg.FromUserID = c.userID
	webrtcMsg.Type = MessageTypeWebRTCOffer

	// Отправляем offer целевому пользователю
	c.sendWebRTCMessageToUser(webrtcMsg.TargetUserID, webrtcMsg)
}

// Обработка WebRTC answer
func (c *Client) handleWebRTCAnswer(data interface{}) {
	var webrtcMsg WebRTCMessage
	dataBytes, _ := json.Marshal(data)
	if err := json.Unmarshal(dataBytes, &webrtcMsg); err != nil {
		logWebRTC("Error parsing WebRTC answer: %v", err)
		return
	}

	logWebRTC("User %s sending answer to %s", c.userID, webrtcMsg.TargetUserID)

	webrtcMsg.FromUserID = c.userID
	webrtcMsg.Type = MessageTypeWebRTCAnswer

	// Отправляем answer целевому пользователю
	c.sendWebRTCMessageToUser(webrtcMsg.TargetUserID, webrtcMsg)
}

// Обработка WebRTC ICE candidate
func (c *Client) handleWebRTCIceCandidate(data interface{}) {
	var webrtcMsg WebRTCMessage
	dataBytes, _ := json.Marshal(data)
	if err := json.Unmarshal(dataBytes, &webrtcMsg); err != nil {
		logWebRTC("Error parsing WebRTC ICE candidate: %v", err)
		return
	}

	logWebRTC("User %s sending ICE candidate to %s", c.userID, webrtcMsg.TargetUserID)

	webrtcMsg.FromUserID = c.userID
	webrtcMsg.Type = MessageTypeWebRTCIceCandidate

	// Отправляем ICE candidate целевому пользователю
	c.sendWebRTCMessageToUser(webrtcMsg.TargetUserID, webrtcMsg)
}

// Обработка присоединения к звонку
func (c *Client) handleWebRTCJoinCall(data interface{}) {
	var webrtcMsg WebRTCMessage
	dataBytes, _ := json.Marshal(data)
	if err := json.Unmarshal(dataBytes, &webrtcMsg); err != nil {
		logWebRTC("Error parsing WebRTC join call: %v", err)
		return
	}

	chatID := webrtcMsg.ChatID
	logWebRTC("User %s joining call for chat %s", c.userID, chatID)

	// Используем функцию БД для присоединения к звонку
	var callID int
	var startTime time.Time
	var isNewCall bool

	err := db.QueryRow(`SELECT * FROM join_call($1, $2, $3, $4)`,
		chatID, c.userID, webrtcMsg.CallType, webrtcMsg.ChatType).
		Scan(&callID, &startTime, &isNewCall)

	if err != nil {
		logWebRTC("Error joining call: %v", err)
		return
	}

	// We no longer maintain in-memory call sessions, relying solely on the database

	// Если это новый звонок, отправляем системное сообщение о начале звонка
	if isNewCall {
		c.sendCallSystemMessage(chatID, c.userID, webrtcMsg.CallType)
	} else {
		// Отправляем системное сообщение о присоединении пользователя
		// No system message when joining an existing call.
	}

	// Получаем имя пользователя
	var userName string
	err = db.QueryRow(`SELECT name FROM users WHERE id = $1`, c.userID).Scan(&userName)
	if err != nil {
		log.Printf("Error getting user name: %v", err)
		userName = "Пользователь"
	}

	// Уведомляем других участников о присоединении
	joinMsg := WebRTCMessage{
		Type:            MessageTypeWebRTCUserJoined,
		ChatID:          chatID,
		CallID:          callID,
		FromUserID:      c.userID,
		GlobalStartTime: startTime.UnixMilli(), // Ensure this is in milliseconds
	}

	logWebRTC("Sending join message with global start time: %d", startTime.UnixMilli())

	c.sendWebRTCMessageToChat(chatID, joinMsg)
}

// Обработка выхода из звонка
func (c *Client) handleWebRTCLeaveCall(data interface{}) {
	var webrtcMsg WebRTCMessage
	dataBytes, _ := json.Marshal(data)
	if err := json.Unmarshal(dataBytes, &webrtcMsg); err != nil {
		logWebRTC("Error parsing WebRTC leave call: %v", err)
		return
	}

	chatID := webrtcMsg.ChatID
	logWebRTC("User %s leaving call for chat %s", c.userID, chatID)

	// Используем функцию БД для выхода из звонка
	var callID int
	var remainingParticipants int

	err := db.QueryRow(`SELECT * FROM leave_call($1, $2)`,
		chatID, c.userID).Scan(&callID, &remainingParticipants)

	if err != nil {
		log.Printf("Error leaving call: %v", err)
		return
	}

	if callID != 0 && remainingParticipants == 0 {
		c.sendCallEndSystemMessageByID(chatID, callID)
	}

	// Получаем имя пользователя
	var userName string
	err = db.QueryRow(`SELECT name FROM users WHERE id = $1`, c.userID).Scan(&userName)
	if err != nil {
		log.Printf("Error getting user name: %v", err)
		userName = "Пользователь"
	}

	// Уведомляем других участников о выходе
	leaveMsg := WebRTCMessage{
		Type:       MessageTypeWebRTCUserLeft,
		ChatID:     chatID,
		FromUserID: c.userID,
	}

	c.sendWebRTCMessageToChat(chatID, leaveMsg)
}

// Обработка системного сообщения
func (c *Client) handleWebRTCScreenShareStarted(data interface{}) {
	var payload struct {
		ChatID string `json:"chatId"`
	}

	dataBytes, _ := json.Marshal(data)
	if err := json.Unmarshal(dataBytes, &payload); err != nil {
		logWebRTC("Error parsing WebRTC screen share started: %v", err)
		return
	}

	chatID := payload.ChatID
	if chatID == "" {
		logWebRTC("Screen share started without chatId from user %s", c.userID)
		return
	}

	msg := WebRTCMessage{
		Type:       MessageTypeWebRTCScreenShareStarted,
		ChatID:     chatID,
		FromUserID: c.userID,
	}

	c.sendWebRTCMessageToChat(chatID, msg)
}

func (c *Client) handleWebRTCScreenShareStopped(data interface{}) {
	var payload struct {
		ChatID string `json:"chatId"`
	}

	dataBytes, _ := json.Marshal(data)
	if err := json.Unmarshal(dataBytes, &payload); err != nil {
		logWebRTC("Error parsing WebRTC screen share stopped: %v", err)
		return
	}

	chatID := payload.ChatID
	if chatID == "" {
		logWebRTC("Screen share stopped without chatId from user %s", c.userID)
		return
	}

	msg := WebRTCMessage{
		Type:       MessageTypeWebRTCScreenShareStopped,
		ChatID:     chatID,
		FromUserID: c.userID,
	}

	c.sendWebRTCMessageToChat(chatID, msg)
}

func (c *Client) handleSendSystemMessage(data interface{}) {
	var msgData struct {
		ChatID  string        `json:"chatId"`
		Message SystemMessage `json:"message"`
	}

	dataBytes, _ := json.Marshal(data)
	if err := json.Unmarshal(dataBytes, &msgData); err != nil {
		log.Printf("Error parsing system message: %v", err)
		return
	}

	// Сохраняем системное сообщение в базу данных
	_, tsMs, err := c.insertSystemMessage(msgData.ChatID, msgData.Message.Text)

	if err != nil {
		log.Printf("Error saving system message: %v", err)
		return
	}

	// Отправляем уведомление о новом сообщении
	msgData.Message.Timestamp = tsMs

	wsMsg := WSMessage{
		Type:      MessageTypeNewMessage,
		ChatID:    msgData.ChatID,
		Data:      msgData.Message,
		Timestamp: time.Now().Unix(),
	}

	c.hub.SendToChat(msgData.ChatID, wsMsg)
}

// Отправка WebRTC сообщения конкретному пользователю
func (c *Client) sendWebRTCMessageToUser(targetUserID string, webrtcMsg WebRTCMessage) {
	c.hub.mutex.RLock()
	defer c.hub.mutex.RUnlock()

	for client := range c.hub.clients {
		if client.userID == targetUserID {
			msgBytes, _ := json.Marshal(webrtcMsg)
			select {
			case client.send <- msgBytes:
				log.Printf("Sent WebRTC message to user %s", targetUserID)
			default:
				log.Printf("Failed to send WebRTC message to user %s", targetUserID)
			}
			break
		}
	}
}

// Отправка WebRTC сообщения всем участникам чата
func (c *Client) sendWebRTCMessageToChat(chatID string, webrtcMsg WebRTCMessage) {
	wsMsg := WSMessage{
		Type:      webrtcMsg.Type,
		ChatID:    chatID,
		Data:      webrtcMsg,
		Timestamp: time.Now().Unix(),
	}

	c.hub.SendToChat(chatID, wsMsg)
}

// Отправка системного сообщения о начале звонка
func (c *Client) insertSystemMessage(chatID, messageText string) (string, int64, error) {
	chatIDInt, err := strconv.Atoi(chatID)
	if err != nil {
		return "", 0, fmt.Errorf("invalid chatID: %q", chatID)
	}

	var lastMessageID sql.NullString
	if err := db.QueryRow(`SELECT last_message_id FROM chats WHERE id = $1`, chatIDInt).Scan(&lastMessageID); err != nil {
		return "", 0, err
	}

	var prevMessageID *string
	if lastMessageID.Valid && lastMessageID.String != "" {
		prevMessageID = &lastMessageID.String
	}

	var newMessageID string
	var createdAt time.Time
	err = db.QueryRow(
		`INSERT INTO messages (text, type, chat_id, prev_message_id)
		 VALUES ($1, 'system', $2, $3)
		 RETURNING id, created_at`,
		messageText, chatIDInt, prevMessageID,
	).Scan(&newMessageID, &createdAt)
	if err != nil {
		return "", 0, err
	}

	if _, err := db.Exec(`UPDATE chats SET last_message_id = $1, last_user_id = NULL WHERE id = $2`, newMessageID, chatIDInt); err != nil {
		return "", 0, err
	}

	return newMessageID, createdAt.UnixMilli(), nil
}

func (c *Client) broadcastSystemMessage(chatID, messageText string, timestampMs int64) {
	wsMsg := WSMessage{
		Type:   MessageTypeNewMessage,
		ChatID: chatID,
		Data: SystemMessage{
			Text:      messageText,
			Type:      "system",
			Timestamp: timestampMs,
		},
		Timestamp: time.Now().Unix(),
	}

	c.hub.SendToChat(chatID, wsMsg)
}

func (c *Client) sendCallSystemMessage(chatID, startedByUserID, callType string) {
	var messageText string
	isStart := true
	chatType := ""
	if isStart {
		if chatType == "ls" {
			messageText = "📞 Личный звонок начат"
		} else {
			messageText = "📞 Групповой звонок начат"
		}
	}

	var userName string
	if err := db.QueryRow(`SELECT name FROM users WHERE id = $1`, startedByUserID).Scan(&userName); err != nil {
		log.Printf("Error getting user name: %v", err)
		userName = "Пользователь"
	}

	callLabel := "звонок"
	if callType == "video" {
		callLabel = "видеозвонок"
	} else if callType == "audio" {
		callLabel = "аудиозвонок"
	}

	messageText = fmt.Sprintf("📞 %s начал(а) %s", userName, callLabel)

	if messageText != "" {
		// Сохраняем системное сообщение в базу данных
		_, tsMs, err := c.insertSystemMessage(chatID, messageText)

		if err != nil {
			log.Printf("Error saving call system message: %v", err)
			return
		}

		// Отправляем уведомление о новом сообщении
		c.broadcastSystemMessage(chatID, messageText, tsMs)
	}
}

// Отправка системного сообщения о завершении звонка
func (c *Client) sendCallEndSystemMessageByID(chatID string, callID int) {
	if callID == 0 {
		return
	}

	var callType string
	var startTime time.Time
	var endTime time.Time
	if err := db.QueryRow(`SELECT call_type, start_time, COALESCE(end_time, NOW()) FROM calls WHERE id = $1`, callID).Scan(&callType, &startTime, &endTime); err != nil {
		log.Printf("Error getting call timing: %v", err)
		return
	}

	durationText := formatCallDuration(endTime.Sub(startTime))
	callLabel := "Звонок"
	if callType == "video" {
		callLabel = "Видеозвонок"
	} else if callType == "audio" {
		callLabel = "Аудиозвонок"
	}

	messageText := fmt.Sprintf("%s длительностью %s завершён", callLabel, durationText)

	_, tsMs, err := c.insertSystemMessage(chatID, messageText)
	if err != nil {
		log.Printf("Error saving call end system message: %v", err)
		return
	}

	c.broadcastSystemMessage(chatID, messageText, tsMs)
}

func formatCallDuration(duration time.Duration) string {
	totalSeconds := int64(duration.Seconds())
	if totalSeconds < 0 {
		totalSeconds = 0
	}

	hours := totalSeconds / 3600
	minutes := (totalSeconds % 3600) / 60
	seconds := totalSeconds % 60

	if hours > 0 {
		return fmt.Sprintf("%d:%02d:%02d", hours, minutes, seconds)
	}
	return fmt.Sprintf("%d:%02d", minutes, seconds)
}

func (c *Client) sendCallEndSystemMessage(chatID, callType, chatType string, duration int64) {
	durationSeconds := duration / 1000
	minutes := durationSeconds / 60
	seconds := durationSeconds % 60
	durationText := fmt.Sprintf("%d:%02d", minutes, seconds)

	messageText := fmt.Sprintf("📞 Звонок завершен. Длительность: %s", durationText)

	// Сохраняем системное сообщение в базу данных
	_, err := db.Exec(`
		INSERT INTO messages (text, type, chat_id, sent_at)
		VALUES ($1, 'system', $2, NOW())
	`, messageText, chatID)

	if err != nil {
		log.Printf("Error saving call end system message: %v", err)
		return
	}

	// Отправляем уведомление о новом сообщении
	wsMsg := WSMessage{
		Type:   MessageTypeNewMessage,
		ChatID: chatID,
		Data: SystemMessage{
			Text:      messageText,
			Type:      "system",
			Timestamp: time.Now().UnixMilli(),
		},
		Timestamp: time.Now().Unix(),
	}

	c.hub.SendToChat(chatID, wsMsg)
}

// Отправка системного сообщения о присоединении пользователя к звонку
func (c *Client) sendUserJoinedCallMessage(chatID, userID string) {
	// Получаем имя пользователя
	var userName string
	err := db.QueryRow(`SELECT name FROM users WHERE id = $1`, userID).Scan(&userName)
	if err != nil {
		log.Printf("Error getting user name: %v", err)
		userName = "Пользователь"
	}

	messageText := fmt.Sprintf("📞 %s присоединился к звонку", userName)

	// Сохраняем системное сообщение в базу данных
	_, err = db.Exec(`
		INSERT INTO messages (text, type, chat_id, sent_at)
		VALUES ($1, 'system', $2, NOW())
	`, messageText, chatID)

	if err != nil {
		log.Printf("Error saving user joined call message: %v", err)
		return
	}

	// Отправляем уведомление о новом сообщении
	wsMsg := WSMessage{
		Type:   MessageTypeNewMessage,
		ChatID: chatID,
		Data: SystemMessage{
			Text:      messageText,
			Type:      "system",
			Timestamp: time.Now().UnixMilli(),
		},
		Timestamp: time.Now().Unix(),
	}

	c.hub.SendToChat(chatID, wsMsg)
}

// Отправка системного сообщения о выходе пользователя из звонка
func (c *Client) sendUserLeftCallMessage(chatID, userID string) {
	// Получаем имя пользователя
	var userName string
	err := db.QueryRow(`SELECT name FROM users WHERE id = $1`, userID).Scan(&userName)
	if err != nil {
		log.Printf("Error getting user name: %v", err)
		userName = "Пользователь"
	}

	messageText := fmt.Sprintf("📞 %s покинул звонок", userName)

	// Сохраняем системное сообщение в базу данных
	_, err = db.Exec(`
		INSERT INTO messages (text, type, chat_id, sent_at)
		VALUES ($1, 'system', $2, NOW())
	`, messageText, chatID)

	if err != nil {
		log.Printf("Error saving user left call message: %v", err)
		return
	}

	// Отправляем уведомление о новом сообщении
	wsMsg := WSMessage{
		Type:   MessageTypeNewMessage,
		ChatID: chatID,
		Data: SystemMessage{
			Text:      messageText,
			Type:      "system",
			Timestamp: time.Now().UnixMilli(),
		},
		Timestamp: time.Now().Unix(),
	}

	c.hub.SendToChat(chatID, wsMsg)
}

// Обработка запроса на проверку активного звонка
func (c *Client) handleCheckActiveCall(data interface{}) {
	var requestData struct {
		ChatID string `json:"chatId"`
	}

	dataBytes, _ := json.Marshal(data)
	if err := json.Unmarshal(dataBytes, &requestData); err != nil {
		logWebRTC("Error parsing check active call request: %v", err)
		c.sendActiveCallResponse(nil, "Invalid request format")
		return
	}

	chatID := requestData.ChatID
	if chatID == "" {
		c.sendActiveCallResponse(nil, "Chat ID is required")
		return
	}

	logWebRTC("User %s checking active call for chat %s", c.userID, chatID)

	// Check the database for active call
	var callData struct {
		ID           int             `json:"id"`
		ChatID       string          `json:"chatId"`
		StartTime    time.Time       `json:"startTime"`
		CallType     string          `json:"callType"`
		ChatType     string          `json:"chatType"`
		Participants json.RawMessage `json:"participants"`
	}

	err := db.QueryRow(`SELECT * FROM get_active_call($1)`, chatID).Scan(
		&callData.ID,
		&callData.ChatID,
		&callData.StartTime,
		&callData.CallType,
		&callData.ChatType,
		&callData.Participants,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			// Нет активного звонка
			logWebRTC("No active call found for chat %s", chatID)
			c.sendActiveCallResponse(nil, "")
		} else {
			logWebRTC("Error checking active call: %v", err)
			c.sendActiveCallResponse(nil, "Database error")
		}
		return
	}

	// Преобразуем время начала в миллисекунды
	startTimeMs := callData.StartTime.UnixMilli()
	logWebRTC("Found active call in database for chat %s, start time: %d", chatID, startTimeMs)

	// We no longer maintain in-memory call sessions

	// Формируем ответ
	response := map[string]interface{}{
		"callId":       callData.ID,
		"chatId":       callData.ChatID,
		"startTime":    startTimeMs,
		"callType":     callData.CallType,
		"chatType":     callData.ChatType,
		"participants": callData.Participants,
	}

	c.sendActiveCallResponse(response, "")
}

// Отправка ответа на запрос о проверке активного звонка
func (c *Client) sendActiveCallResponse(data interface{}, errorMsg string) {
	response := map[string]interface{}{
		"data": data,
	}

	if errorMsg != "" {
		response["error"] = errorMsg
	}

	responseMsg := WSMessage{
		Type:      MessageTypeActiveCallResponse,
		Data:      response,
		Timestamp: time.Now().Unix(),
	}

	msgBytes, err := json.Marshal(responseMsg)
	if err != nil {
		log.Printf("Error marshaling active call response: %v", err)
		return
	}

	select {
	case c.send <- msgBytes:
		log.Printf("Sent active call response to user %s", c.userID)
	default:
		log.Printf("Failed to send active call response to user %s", c.userID)
	}
}
