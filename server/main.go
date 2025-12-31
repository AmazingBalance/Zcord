package main

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/dgrijalva/jwt-go"
	"github.com/redis/go-redis/v9"
	_ "github.com/lib/pq"
)

// Глобальный Redis клиент
var redisClient *redis.Client

type User struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	ImageSrc       *string `json:"imageSrc,omitempty"`
	Tag            string  `json:"tag"`
	Description    string  `json:"description"`
	FriendsList    string  `json:"friends_list"`
	FriendsListIn  string  `json:"friends_list_in"`
	FriendsListOut string  `json:"friends_list_out"`
}

// enableCORS добавляет необходимые заголовки для CORS
func enableCORS(h http.Handler) http.Handler {
	allowedOrigins := map[string]struct{}{}
	originsRaw := os.Getenv("CORS_ALLOWED_ORIGINS")
	if originsRaw == "" {
		originsRaw = os.Getenv("CORS_ORIGIN")
	}
	if originsRaw == "" {
		originsRaw = "http://localhost:3000"
	}
	for _, origin := range strings.Split(originsRaw, ",") {
		origin = strings.TrimSpace(origin)
		origin = strings.TrimRight(origin, "/")
		if origin != "" {
			allowedOrigins[origin] = struct{}{}
		}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000") // Указываем, что разрешаем доступ с фронтенда
		origin := strings.TrimRight(r.Header.Get("Origin"), "/")
		if origin != "" {
			if _, ok := allowedOrigins[origin]; ok {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Add("Vary", "Origin")
			} else {
				w.Header().Del("Access-Control-Allow-Origin")
			}
		} else {
			w.Header().Del("Access-Control-Allow-Origin")
		}

		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS, POST")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Friend-Tag") // Разрешаем заголовки
		w.Header().Set("Access-Control-Allow-Credentials", "true")                                  // Позволяет куки

		// Логируем информацию о запросе
		log.Printf("Received request: %s %s", r.Method, r.URL.Path)

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent) // Для preflight запроса
			return
		}

		h.ServeHTTP(w, r)
	})
}

func authenticate(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Получаем токен из заголовков
		tokenStr := r.Header.Get("Authorization")
		if tokenStr == "" {
			http.Error(w, "Authorization header required", http.StatusUnauthorized)
			return
		}

		// Проверка формата токена (Bearer <token>)
		if len(tokenStr) < 7 || tokenStr[:7] != "Bearer " {
			http.Error(w, "Invalid token format", http.StatusUnauthorized)
			return
		}

		// Извлекаем токен
		tokenStr = tokenStr[7:] // Убираем "Bearer " из строки

		// Парсим токен
		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
			return jwtKey, nil
		})
		if err != nil || !token.Valid {
			log.Println("Токен не прошёл проверку")
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		// Добавляем информацию о пользователе в контекст
		r = r.WithContext(context.WithValue(r.Context(), "userId", claims.UserID))
		next.ServeHTTP(w, r)
	}
}

// Главная функция
func waitForDBReady(maxWait time.Duration) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is required")
	}

	deadline := time.Now().Add(maxWait)
	var lastErr error
	for time.Now().Before(deadline) {
		conn, err := sql.Open("postgres", dsn)
		if err == nil {
			err = conn.Ping()
			_ = conn.Close()
			if err == nil {
				return
			}
		}
		lastErr = err
		time.Sleep(1 * time.Second)
	}
	log.Fatalf("Database is not ready after %s: %v", maxWait, lastErr)
}

func main() {
	// Initialize logging
	initLogging()

	waitForDBReady(60 * time.Second)
	ensureSchema()
	ensureBootstrap()

	uploadDir := getEnvOrDefault("UPLOAD_DIR", "./uploads")

	// Проверяем, существует ли папка uploads
	if _, err := os.Stat(uploadDir); os.IsNotExist(err) {
		log.Fatalf("Папка %s не существует. Создайте её.", uploadDir)
	}

	// Инициализируем Redis клиент
	redisClient = redis.NewClient(&redis.Options{
		Addr:     getEnvOrDefault("REDIS_URL", "localhost:6379"),
		Password: getEnvOrDefault("REDIS_PASSWORD", ""),
		DB:       0,
	})

	// Проверяем подключение к Redis
	ctx := context.Background()
	_, err := redisClient.Ping(ctx).Result()
	if err != nil {
		log.Printf("Warning: Redis connection failed: %v", err)
		log.Println("WebSocket functionality will be limited")
		redisClient = nil
		InitWebSocketHub(nil)
	} else {
		log.Println("Redis connected successfully")
		// Инициализируем WebSocket Hub
		InitWebSocketHub(redisClient)
	}

	// Роут для отдачи файлов из папки uploads
	http.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(uploadDir))))
	// Защищённые маршруты
	http.HandleFunc("/chats", authenticate(GetChats))
	http.HandleFunc("/chat", authenticate(GetChatByTag))
	http.HandleFunc("/channel", authenticate(GetChatByTag))
	http.HandleFunc("/ls", authenticate(GetLSByTag))
	http.HandleFunc("/api/ls/ensure", authenticate(EnsureLSChat))

	// Защищённый маршрут для добавления сообщений
	http.HandleFunc("/api/send", authenticate(AddMessage)) // Добавляем защиту на отправку сообщения

	http.HandleFunc("/api/user/update", authenticate(UpdateUserData))
	http.HandleFunc("/api/user/check-unique", CheckUniqueField)

	// Аутентификация
	http.HandleFunc("/api/register", Register)
	http.HandleFunc("/api/login", Login)
	http.HandleFunc("/api/check-tag", CheckTagAvailability)
	http.HandleFunc("/api/validate-token", ValidateToken)

	RegisterFriendRoutes()
	RegisterChatCreationRoutes()
	RegisterCryptoKeyRoutes()

	// Маршруты для работы с приглашениями
	http.HandleFunc("/api/invites/create", authenticate(CreateInvite))
	http.HandleFunc("/api/invites/info", GetInviteInfo) // Публичный маршрут для получения информации о приглашении
	http.HandleFunc("/api/invites/accept", authenticate(AcceptInvite))
	http.HandleFunc("/api/invites/tag-info", GetTagInviteInfo)
	http.HandleFunc("/api/invites/accept-tag", authenticate(AcceptTagInvite))

	// WebSocket маршрут (аутентификация внутри HandleWebSocket)
	http.HandleFunc("/ws", HandleWebSocket)

	log.Println("Сервер запущен на порту 8000...")
	log.Printf("Public API base: %s", publicAPIBaseURL())
	log.Fatal(http.ListenAndServe(":8000", enableCORS(http.DefaultServeMux)))
}

// Вспомогательная функция для получения переменных окружения с значением по умолчанию
func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
