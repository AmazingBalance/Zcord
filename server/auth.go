package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/dgrijalva/jwt-go"
	"github.com/joho/godotenv"
	"github.com/lib/pq"
	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
)

type RegisterInput struct {
	Name        string `json:"name"`
	Email       string `json:"email"`
	Password    string `json:"password"`
	Tag         string `json:"tag"`
	Phone       string `json:"phone"`
	Description string `json:"description"`
}

type LoginInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

var jwtKey []byte
var db *sql.DB

type Claims struct {
	UserID string `json:"userId"`
	jwt.StandardClaims
}

func init() {
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: could not load .env: %v", err)
	}
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		log.Fatal("JWT_SECRET is required")
	}
	jwtKey = []byte(jwtSecret)

	var err error
	db, err = sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("Database connection failed: %v", err)
	}
}

func hashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 14)
	return string(bytes), err
}

func checkPasswordHash(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

// generateUniqueTag генерирует уникальный тег на основе имени пользователя
func generateUniqueTag(name string) string {
	// Базовый тег из имени (убираем пробелы и приводим к нижнему регистру)
	baseTag := strings.ToLower(strings.ReplaceAll(name, " ", ""))

	// Проверяем доступность базового тега
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM users WHERE tag = $1", baseTag).Scan(&count)
	if err == nil && count == 0 {
		return baseTag
	}

	// Если базовый тег занят, добавляем числовой суффикс
	for i := 1; i <= 999; i++ {
		candidateTag := fmt.Sprintf("%s%d", baseTag, i)
		err := db.QueryRow("SELECT COUNT(*) FROM users WHERE tag = $1", candidateTag).Scan(&count)
		if err == nil && count == 0 {
			return candidateTag
		}
	}

	// В крайнем случае генерируем случайный тег
	return fmt.Sprintf("user_%d", time.Now().Unix())
}

func writeJSONResponse(w http.ResponseWriter, status int, data map[string]interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func Register(w http.ResponseWriter, r *http.Request) {
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
	input := RegisterInput{
		Name:        r.FormValue("name"),
		Email:       r.FormValue("email"),
		Password:    r.FormValue("password"),
		Tag:         r.FormValue("tag"),
		Phone:       r.FormValue("phone"),
		Description: r.FormValue("description"),
	}

	// Логируем полученные данные из формы
	log.Printf("Register: Received form data - Name: '%s', Email: '%s', Tag: '%s', Phone: '%s', Description: '%s'",
		input.Name, input.Email, input.Tag, input.Phone, input.Description)

	// Валидация обязательных полей
	if input.Name == "" || input.Email == "" || input.Password == "" {
		writeJSONResponse(w, http.StatusBadRequest, map[string]interface{}{
			"error": "Имя, email и пароль обязательны для заполнения",
		})
		return
	}

	hashedPassword, err := hashPassword(input.Password)
	if err != nil {
		log.Printf("Error hashing password: %v", err)
		writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{
			"error": "Error hashing password",
		})
		return
	}

	// Генерируем уникальный тег, если он не предоставлен
	tag := input.Tag
	if tag == "" {
		// Генерируем тег на основе имени пользователя
		tag = generateUniqueTag(input.Name)
	}

	// Обработка загрузки аватара
	var avatarPath string
	file, handler, err := r.FormFile("avatar")
	if err == nil {
		defer file.Close()

		// Создаем уникальное имя файла
		avatarPath = fmt.Sprintf("uploads/%d_%s", time.Now().Unix(), handler.Filename)

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
		log.Printf("Avatar saved: %s", avatarPath)
	} else {
		log.Printf("No avatar uploaded: %v", err)
	}

	var id int
	log.Printf("Register: Inserting into DB - Tag: '%s', Email: '%s', Name: '%s', Phone: '%s', Description: '%s', Avatar: '%s'",
		tag, input.Email, input.Name, input.Phone, input.Description, avatarPath)

	err = db.QueryRow(
		"INSERT INTO users (tag, email, password, name, phone, description, avatar) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
		tag, input.Email, hashedPassword, input.Name, input.Phone, input.Description, avatarPath,
	).Scan(&id)
	if err != nil {
		log.Printf("Error inserting user into database: %v", err)
		if err.Error() == `pq: duplicate key value violates unique constraint "users_tag_key"` {
			writeJSONResponse(w, http.StatusConflict, map[string]interface{}{
				"error": "Этот тег уже занят",
			})
		} else if err.Error() == `pq: duplicate key value violates unique constraint "users_email_key"` {
			writeJSONResponse(w, http.StatusConflict, map[string]interface{}{
				"error": "Пользователь с таким email уже существует",
			})
		} else {
			writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{
				"error": "Ошибка создания пользователя",
			})
		}
		return
	}

	log.Printf("Register: User created successfully with ID: %d", id)

	// Добавляем пользователя в канал новостей (ID = 1)
	// Сначала проверяем, существует ли канал новостей
	var newsChannelExists bool
	err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM chats WHERE id = 1)").Scan(&newsChannelExists)
	if err != nil {
		log.Printf("Error checking news channel existence: %v", err)
	}

	if !newsChannelExists {
		// Создаем канал новостей, если его нет
		_, err = db.Exec(`
			INSERT INTO chats (id, name, tag, chat_type, owner_id, avatar, description, users)
			VALUES (1, 'Новости Zcord', 'news', 'channel', NULL, '/news_icon.svg', 'Официальный канал новостей мессенджера Zcord', ARRAY[$1])
		`, id)
		if err != nil {
			log.Printf("Warning: Failed to create news channel: %v", err)
		} else {
			log.Printf("News channel created and user %d added", id)
		}
	} else {
		// Добавляем пользователя в существующий канал новостей
		_, err = db.Exec(
			"UPDATE chats SET users = array_append(users, $1) WHERE id = 1 AND NOT ($1 = ANY(users))",
			id,
		)
		if err != nil {
			log.Printf("Warning: Failed to add user to news channel: %v", err)
		} else {
			log.Printf("User %d added to news channel successfully", id)
		}
	}

	// Инициализируем read-status для канала новостей, чтобы у нового пользователя не было "тысяч непрочитанных"
	if _, err := db.Exec(`
		INSERT INTO chat_read_status (chat_id, user_id, last_read_message_id, last_read_at)
		SELECT 1, $1::integer, c.last_message_id, NOW()
		FROM chats c
		WHERE c.id = 1
		ON CONFLICT (chat_id, user_id) DO UPDATE
		SET last_read_message_id = EXCLUDED.last_read_message_id,
		    last_read_at = EXCLUDED.last_read_at
	`, id); err != nil {
		log.Printf("Warning: Failed to initialize read status for news channel: %v", err)
	}

	// Создаем JWT токен для нового пользователя
	expirationTime := time.Now().Add(24 * time.Hour)
	claims := &Claims{
		UserID: strconv.Itoa(id),
		StandardClaims: jwt.StandardClaims{
			ExpiresAt: expirationTime.Unix(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtKey)
	if err != nil {
		log.Printf("Error signing token: %v", err)
		writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{
			"error": "Ошибка создания токена",
		})
		return
	}

	// Устанавливаем cookie с токеном
	http.SetCookie(w, &http.Cookie{
		Name:    "token",
		Value:   tokenString,
		Expires: expirationTime,
	})

	log.Printf("User registered successfully: ID=%d, Tag=%s, Email=%s", id, tag, input.Email)

	response := map[string]interface{}{
		"id":    id,
		"name":  input.Name,
		"tag":   tag,
		"email": input.Email,
		"phone": input.Phone,
		"token": tokenString,
		"avatar": func() string {
			if avatarPath != "" {
				return publicAssetURL(avatarPath)
			}
			return ""
		}(),
		"description": input.Description,
	}

	log.Printf("Register: Sending response - Phone: '%s', Description: '%s'", input.Phone, input.Description)
	writeJSONResponse(w, http.StatusCreated, response)
}

func Login(w http.ResponseWriter, r *http.Request) {
	var input LoginInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		log.Printf("Error decoding input: %v", err)
		writeJSONResponse(w, http.StatusBadRequest, map[string]interface{}{
			"error": "Invalid input",
		})
		return
	}

	var id int
	var name, tag, passwordHash string
	var email, phone, description, avatar sql.NullString // Используем sql.NullString для возможных NULL значений

	err := db.QueryRow(
		"SELECT id, name, email, phone, tag, password, description, avatar FROM users WHERE email = $1 OR tag = $1",
		input.Email,
	).Scan(&id, &name, &email, &phone, &tag, &passwordHash, &description, &avatar)
	if err != nil {
		log.Printf("Error querying user: %v", err)
		writeJSONResponse(w, http.StatusUnauthorized, map[string]interface{}{
			"error": "Invalid credentials",
		})
		return
	}

	if !checkPasswordHash(input.Password, passwordHash) {
		log.Printf("Invalid password for user email: %s", input.Email)
		writeJSONResponse(w, http.StatusUnauthorized, map[string]interface{}{
			"error": "Invalid credentials",
		})
		return
	}

	expirationTime := time.Now().Add(24 * time.Hour)
	claims := &Claims{
		UserID: strconv.Itoa(id), // Преобразуем id (int) в строку
		StandardClaims: jwt.StandardClaims{
			ExpiresAt: expirationTime.Unix(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtKey)
	if err != nil {
		log.Printf("Error signing token: %v", err)
		writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{
			"error": "Error creating token",
		})
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:    "token",
		Value:   tokenString,
		Expires: expirationTime,
	})

	// Убеждаемся, что пользователь добавлен в канал новостей при входе
	_, err = db.Exec(
		"UPDATE chats SET users = array_append(users, $1) WHERE id = 1 AND NOT ($1 = ANY(users))",
		id,
	)
	if err != nil {
		log.Printf("Warning: Failed to add user to news channel on login: %v", err)
	}

	// Инициализируем/обновляем read-status для канала новостей при входе
	if _, err := db.Exec(`
		INSERT INTO chat_read_status (chat_id, user_id, last_read_message_id, last_read_at)
		SELECT 1, $1::integer, c.last_message_id, NOW()
		FROM chats c
		WHERE c.id = 1
		ON CONFLICT (chat_id, user_id) DO UPDATE
		SET last_read_message_id = EXCLUDED.last_read_message_id,
		    last_read_at = EXCLUDED.last_read_at
	`, id); err != nil {
		log.Printf("Warning: Failed to initialize read status for news channel on login: %v", err)
	}

	log.Printf("User logged in successfully: ID=%d, Name=%s, Tag=%s", id, name, tag)

	// Проверяем значения на NULL и если они NULL, возвращаем пустую строку
	emailVal := ""
	if email.Valid {
		emailVal = email.String
	}
	phoneVal := ""
	if phone.Valid {
		phoneVal = phone.String
	}
	descriptionVal := ""
	if description.Valid {
		descriptionVal = description.String
	}
	avatarVal := ""
	if avatar.Valid && avatar.String != "" {
		avatarVal = publicAssetURL(avatar.String)
	}

	writeJSONResponse(w, http.StatusOK, map[string]interface{}{
		"id":          id,
		"name":        name,           // Обязательное поле
		"email":       emailVal,       // Проверка на NULL
		"phone":       phoneVal,       // Проверка на NULL
		"tag":         tag,            // Обязательное поле
		"token":       tokenString,    // Токен
		"avatar":      avatarVal,      // Проверка на NULL
		"description": descriptionVal, // Проверка на NULL
	})
}

func ValidateToken(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("token")
	if err != nil {
		log.Printf("No token provided: %v", err)
		writeJSONResponse(w, http.StatusUnauthorized, map[string]interface{}{"error": "Token required"})
		return
	}

	tokenString := cookie.Value
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		return jwtKey, nil
	})
	if err != nil || !token.Valid {
		log.Printf("Invalid token: %v", err)
		writeJSONResponse(w, http.StatusUnauthorized, map[string]interface{}{"error": "Invalid token"})
		return
	}

	var id int
	var name, tag string
	var email, phone, description, avatar sql.NullString
	var friendsList, friendsListIn, friendsListOut pq.Int64Array

	log.Printf("ValidateToken: Querying user data for ID: %s", claims.UserID)
	err = db.QueryRow(
		`SELECT id, name, email, phone, tag, description, avatar, friends_list, friends_list_in, friends_list_out
		 FROM users WHERE id = $1`,
		claims.UserID,
	).Scan(&id, &name, &email, &phone, &tag, &description, &avatar, &friendsList, &friendsListIn, &friendsListOut)
	if err != nil {
		log.Printf("Error querying user by ID: %v", err)
		writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{"error": "User not found"})
		return
	}

	// Детальное логирование полученных данных
	log.Printf("ValidateToken: Raw data from DB - ID: %d, Name: %s, Tag: %s", id, name, tag)
	log.Printf("ValidateToken: Email - Valid: %t, Value: '%s'", email.Valid, email.String)
	log.Printf("ValidateToken: Phone - Valid: %t, Value: '%s'", phone.Valid, phone.String)
	log.Printf("ValidateToken: Description - Valid: %t, Value: '%s'", description.Valid, description.String)
	log.Printf("ValidateToken: Avatar - Valid: %t, Value: '%s'", avatar.Valid, avatar.String)

	formatUserList := func(ids []int64) []map[string]string {
		if len(ids) == 0 {
			return []map[string]string{}
		}

		rows, err := db.Query(`SELECT id, name, tag, avatar FROM users WHERE id = ANY($1)`, pq.Array(ids))
		if err != nil {
			log.Printf("Error fetching friends: %v", err)
			return []map[string]string{}
		}
		defer rows.Close()

		var friends []map[string]string
		for rows.Next() {
			var fid, fname, ftag string
			var favatar sql.NullString
			if err := rows.Scan(&fid, &fname, &ftag, &favatar); err != nil {
				log.Printf("Error scanning friend row: %v", err)
				continue
			}
			friend := map[string]string{
				"id":     fid,
				"name":   fname,
				"tag":    ftag,
				"avatar": "",
			}
			if favatar.Valid {
				friend["avatar"] = favatar.String
			}
			friends = append(friends, friend)
		}
		return friends
	}

	// Handle NULL values properly
	emailVal := ""
	if email.Valid {
		emailVal = email.String
	}
	phoneVal := ""
	if phone.Valid {
		phoneVal = phone.String
	}
	descriptionVal := ""
	if description.Valid {
		descriptionVal = description.String
	}
	avatarVal := ""
	if avatar.Valid && avatar.String != "" {
		avatarVal = publicAssetURL(avatar.String)
	}

	response := map[string]interface{}{
		"userId":           id,
		"name":             name,
		"email":            emailVal,
		"phone":            phoneVal,
		"tag":              tag,
		"description":      descriptionVal,
		"avatar":           avatarVal,
		"friends_list":     formatUserList(friendsList),
		"friends_list_in":  formatUserList(friendsListIn),
		"friends_list_out": formatUserList(friendsListOut),
		"status":           "Token is valid",
	}

	// Логирование финальных значений, отправляемых клиенту
	log.Printf("ValidateToken: Final response values - Email: '%s', Phone: '%s', Description: '%s', Avatar: '%s'",
		emailVal, phoneVal, descriptionVal, avatarVal)

	writeJSONResponse(w, http.StatusOK, response)
}

func UpdateUserData(w http.ResponseWriter, r *http.Request) {
	// Проверка авторизации
	cookie, err := r.Cookie("token")
	if err != nil {
		log.Printf("No token provided: %v", err)
		writeJSONResponse(w, http.StatusUnauthorized, map[string]interface{}{"error": "Token required"})
		return
	}

	tokenString := cookie.Value
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		return jwtKey, nil
	})
	if err != nil || !token.Valid {
		log.Printf("Invalid token: %v", err)
		writeJSONResponse(w, http.StatusUnauthorized, map[string]interface{}{"error": "Invalid token"})
		return
	}

	// Логируем информацию о полученных данных
	log.Printf("User ID from token: %s", claims.UserID)

	// Получение данных из тела запроса
	err = r.ParseMultipartForm(10 << 20) // Ограничение на 10MB для загрузки файла
	if err != nil {
		log.Printf("Error parsing multipart form: %v", err)
		writeJSONResponse(w, http.StatusBadRequest, map[string]interface{}{"error": "Invalid form data"})
		return
	}

	// Логируем полученные значения
	name := r.FormValue("name")
	email := r.FormValue("email")
	phone := r.FormValue("phone")
	tag := r.FormValue("tag")
	description := r.FormValue("description")
	log.Printf("Parsed form data - Name: %s, Email: %s, Phone: %s, Tag: %s, Description: %s", name, email, phone, tag, description)

	// Проверяем уникальность тега, email и телефона перед обновлением
	if tag != "" {
		var count int
		err = db.QueryRow("SELECT COUNT(*) FROM users WHERE tag = $1 AND id != $2", tag, claims.UserID).Scan(&count)
		if err != nil {
			log.Printf("Error checking tag uniqueness: %v", err)
			writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{"error": "Error checking tag availability"})
			return
		}
		if count > 0 {
			writeJSONResponse(w, http.StatusConflict, map[string]interface{}{"error": "Этот тег уже занят"})
			return
		}
	}

	if email != "" {
		var count int
		err = db.QueryRow("SELECT COUNT(*) FROM users WHERE email = $1 AND id != $2", email, claims.UserID).Scan(&count)
		if err != nil {
			log.Printf("Error checking email uniqueness: %v", err)
			writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{"error": "Error checking email availability"})
			return
		}
		if count > 0 {
			writeJSONResponse(w, http.StatusConflict, map[string]interface{}{"error": "Этот email уже используется"})
			return
		}
	}

	if phone != "" {
		var count int
		err = db.QueryRow("SELECT COUNT(*) FROM users WHERE phone = $1 AND id != $2", phone, claims.UserID).Scan(&count)
		if err != nil {
			log.Printf("Error checking phone uniqueness: %v", err)
			writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{"error": "Error checking phone availability"})
			return
		}
		if count > 0 {
			writeJSONResponse(w, http.StatusConflict, map[string]interface{}{"error": "Этот номер телефона уже используется"})
			return
		}
	}

	file, handler, err := r.FormFile("avatar")

	// Проверка на наличие файла и загрузка нового
	var avatarPath string
	if err == nil {
		defer file.Close()

		// Удаление старого изображения, если существует
		var oldAvatar sql.NullString
		err = db.QueryRow("SELECT avatar FROM users WHERE id = $1", claims.UserID).Scan(&oldAvatar)
		if err != nil {
			log.Printf("Error retrieving old avatar path: %v", err)
		} else if oldAvatar.Valid {
			log.Printf("Deleting old avatar: %s", oldAvatar.String)
			err = os.Remove(oldAvatar.String)
			if err != nil {
				log.Printf("Failed to delete old avatar: %v", err)
			}
		}

		// Сохранение нового изображения с уникальным именем
		avatarPath = fmt.Sprintf("uploads/%d_%s", time.Now().Unix(), handler.Filename)
		newFile, err := os.Create(avatarPath)
		if err != nil {
			log.Printf("Error creating new avatar file: %v", err)
			writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{"error": "Error saving file"})
			return
		}
		defer newFile.Close()

		_, err = newFile.ReadFrom(file)
		if err != nil {
			log.Printf("Error writing file to disk: %v", err)
			writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{"error": "Error writing file"})
			return
		}
		log.Printf("New avatar saved: %s", avatarPath)
	} else {
		log.Printf("No avatar uploaded: %v", err)
	}

	// Обновление данных пользователя в БД
	log.Printf("Updating user data for ID: %s", claims.UserID)
	log.Printf("UpdateUserData: Values to update - Name: '%s', Email: '%s', Phone: '%s', Tag: '%s', Description: '%s', Avatar: '%s'",
		name, email, phone, tag, description, avatarPath)

	var result sql.Result
	if avatarPath != "" {
		// Обновляем с новым аватаром
		result, err = db.Exec(
			"UPDATE users SET name = $1, email = $2, phone = $3, tag = $4, description = $5, avatar = $6 WHERE id = $7",
			name, email, phone, tag, description, avatarPath, claims.UserID,
		)
	} else {
		// Обновляем без изменения аватара
		result, err = db.Exec(
			"UPDATE users SET name = $1, email = $2, phone = $3, tag = $4, description = $5 WHERE id = $6",
			name, email, phone, tag, description, claims.UserID,
		)
	}

	if err != nil {
		log.Printf("Error updating user data in DB: %v", err)
		writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{"error": "Error updating user"})
		return
	}

	// Проверяем количество обновленных строк
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		log.Printf("Error getting rows affected: %v", err)
	} else {
		log.Printf("UpdateUserData: Rows affected: %d", rowsAffected)
	}

	// Получаем обновленные данные пользователя для возврата
	var updatedUser struct {
		ID          int            `json:"id"`
		Name        string         `json:"name"`
		Email       sql.NullString `json:"email"`
		Phone       sql.NullString `json:"phone"`
		Tag         string         `json:"tag"`
		Description sql.NullString `json:"description"`
		Avatar      sql.NullString `json:"avatar"`
	}

	err = db.QueryRow(
		"SELECT id, name, email, phone, tag, description, avatar FROM users WHERE id = $1",
		claims.UserID,
	).Scan(&updatedUser.ID, &updatedUser.Name, &updatedUser.Email, &updatedUser.Phone,
		&updatedUser.Tag, &updatedUser.Description, &updatedUser.Avatar)

	if err != nil {
		log.Printf("Error fetching updated user data: %v", err)
		writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{"error": "Error fetching updated data"})
		return
	}

	// Формируем ответ с обновленными данными
	response := map[string]interface{}{
		"message": "User updated successfully",
		"id":      updatedUser.ID,
		"name":    updatedUser.Name,
		"tag":     updatedUser.Tag,
	}

	if updatedUser.Email.Valid {
		response["email"] = updatedUser.Email.String
	} else {
		response["email"] = ""
	}

	if updatedUser.Phone.Valid {
		response["phone"] = updatedUser.Phone.String
	} else {
		response["phone"] = ""
	}

	if updatedUser.Description.Valid {
		response["description"] = updatedUser.Description.String
	} else {
		response["description"] = ""
	}

	if updatedUser.Avatar.Valid && updatedUser.Avatar.String != "" {
		// Формируем полный URL для аватара
		response["imageSrc"] = publicAssetURL(updatedUser.Avatar.String)
	} else {
		response["imageSrc"] = ""
	}

	log.Printf("User data updated successfully for ID: %s", claims.UserID)
	writeJSONResponse(w, http.StatusOK, response)
}

// CheckTagAvailability проверяет доступность тега для регистрации
func CheckTagAvailability(w http.ResponseWriter, r *http.Request) {
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

	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM users WHERE tag = $1", tag).Scan(&count)
	if err != nil {
		log.Printf("Error checking tag availability: %v", err)
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

// CheckUniqueField проверяет уникальность поля (tag, email, phone) для обновления профиля
func CheckUniqueField(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONResponse(w, http.StatusMethodNotAllowed, map[string]interface{}{
			"error": "Method not allowed",
		})
		return
	}

	// Проверка авторизации
	tokenStr := r.Header.Get("Authorization")
	if tokenStr == "" {
		writeJSONResponse(w, http.StatusUnauthorized, map[string]interface{}{
			"error": "Authorization header required",
		})
		return
	}

	if len(tokenStr) < 7 || tokenStr[:7] != "Bearer " {
		writeJSONResponse(w, http.StatusUnauthorized, map[string]interface{}{
			"error": "Invalid token format",
		})
		return
	}

	tokenStr = tokenStr[7:]
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
		return jwtKey, nil
	})
	if err != nil || !token.Valid {
		writeJSONResponse(w, http.StatusUnauthorized, map[string]interface{}{
			"error": "Invalid token",
		})
		return
	}

	var requestData struct {
		Field string `json:"field"`
		Value string `json:"value"`
	}

	if err := json.NewDecoder(r.Body).Decode(&requestData); err != nil {
		writeJSONResponse(w, http.StatusBadRequest, map[string]interface{}{
			"error": "Invalid request data",
		})
		return
	}

	// Проверяем допустимые поля
	allowedFields := map[string]string{
		"tag":   "tag",
		"email": "email",
		"phone": "phone",
	}

	dbField, ok := allowedFields[requestData.Field]
	if !ok {
		writeJSONResponse(w, http.StatusBadRequest, map[string]interface{}{
			"error": "Invalid field",
		})
		return
	}

	// Проверяем уникальность, исключая текущего пользователя
	var count int
	err = db.QueryRow(
		fmt.Sprintf("SELECT COUNT(*) FROM users WHERE %s = $1 AND id != $2", dbField),
		requestData.Value, claims.UserID,
	).Scan(&count)
	if err != nil {
		log.Printf("Error checking field uniqueness: %v", err)
		writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{
			"error": "Error checking availability",
		})
		return
	}

	available := count == 0
	writeJSONResponse(w, http.StatusOK, map[string]interface{}{
		"available": available,
		"field":     requestData.Field,
		"value":     requestData.Value,
	})
}

// validateToken проверяет JWT токен и возвращает userID
func validateToken(tokenString string) (string, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		return jwtKey, nil
	})
	if err != nil || !token.Valid {
		return "", fmt.Errorf("invalid token: %v", err)
	}
	return claims.UserID, nil
}
