package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/dgrijalva/jwt-go"
)

type User struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	ImageSrc    *string `json:"imageSrc,omitempty"`
	Tag         string  `json:"tag"`
	Description string  `json:"description"`
	FriendsList   string  `json:"friends_list"`
    FriendsListIn string  `json:"friends_list_in"`
    FriendsListOut string `json:"friends_list_out"`
}

// enableCORS добавляет необходимые заголовки для CORS
func enableCORS(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000") // Указываем, что разрешаем доступ с фронтенда
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS, POST")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization") // Разрешаем заголовок Authorization
		w.Header().Set("Access-Control-Allow-Credentials", "true") // Позволяет куки

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
func main() {
	uploadDir := "./uploads"

	// Проверяем, существует ли папка uploads
	if _, err := os.Stat(uploadDir); os.IsNotExist(err) {
		log.Fatalf("Папка %s не существует. Создайте её.", uploadDir)
	}

	// Роут для отдачи файлов из папки uploads
	http.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(uploadDir))))
	// Защищённые маршруты
	http.HandleFunc("/chats", authenticate(GetChats))
	http.HandleFunc("/chat", authenticate(GetChatByTag))

	// Защищённый маршрут для добавления сообщений
	http.HandleFunc("/api/send", authenticate(AddMessage)) // Добавляем защиту на отправку сообщения

	http.HandleFunc("/api/user/update", authenticate(UpdateUserData))

	// Аутентификация
	http.HandleFunc("/api/register", Register)
	http.HandleFunc("/api/login", Login)
	http.HandleFunc("/api/validate-token", ValidateToken)

	RegisterFriendRoutes()

	log.Println("Сервер запущен на порту 8000...")
	log.Fatal(http.ListenAndServe(":8000", enableCORS(http.DefaultServeMux)))
}
