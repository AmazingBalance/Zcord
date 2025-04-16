package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/dgrijalva/jwt-go"
	"github.com/joho/godotenv"
	"github.com/lib/pq"
	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
)


type RegisterInput struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Tag      string `json:"tag"`
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
		panic("Error loading .env file")
	}
	jwtKey = []byte(os.Getenv("JWT_SECRET"))

	var err error
	db, err = sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		panic("Database connection failed")
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

func writeJSONResponse(w http.ResponseWriter, status int, data map[string]interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func Register(w http.ResponseWriter, r *http.Request) {
	var input RegisterInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		log.Printf("Error decoding input: %v", err)
		writeJSONResponse(w, http.StatusBadRequest, map[string]interface{}{
			"error": "Invalid input",
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

	var id int
	err = db.QueryRow(
		"INSERT INTO users (tag, email, password, name) VALUES ($1, $2, $3, $4) RETURNING id",
		input.Tag, input.Email, hashedPassword, input.Name,
	).Scan(&id)
	if err != nil {
		log.Printf("Error inserting user into database: %v", err)
		writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{
			"error": "Error creating user",
		})
		return
	}

	log.Printf("User registered successfully: ID=%d, Tag=%s, Email=%s", id, input.Tag, input.Email)

	writeJSONResponse(w, http.StatusCreated, map[string]interface{}{
		"id":    id,
		"name":  input.Name,
		"tag":   input.Tag,
		"email": input.Email,
		"phone": "", // Возвращаем пустую строку для phone
	})
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
	if avatar.Valid {
		avatarVal = avatar.String
	}

	writeJSONResponse(w, http.StatusOK, map[string]interface{}{
		"id":          id,
		"name":        name,         // Обязательное поле
		"email":       emailVal,     // Проверка на NULL
		"phone":       phoneVal,     // Проверка на NULL
		"tag":         tag,          // Обязательное поле
		"token":       tokenString,  // Токен
		"avatar":      avatarVal,    // Проверка на NULL
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
				"id": fid,
				"name":  fname,
				"tag":   ftag,
				"avatar": "",
			}
			if favatar.Valid {
				friend["avatar"] = favatar.String
			}
			friends = append(friends, friend)
		}
		return friends
	}

	response := map[string]interface{}{
		"userId":      id,
		"name":        name,
		"email":       email.String,
		"phone":       phone.String,
		"tag":         tag,
		"description": description.String,
		"avatar":      avatar.String,
		"friends_list":     formatUserList(friendsList),
		"friends_list_in":  formatUserList(friendsListIn),
		"friends_list_out": formatUserList(friendsListOut),
		"status":      "Token is valid",
	}

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
	description := r.FormValue("description")
	log.Printf("Parsed form data - Name: %s, Email: %s, Phone: %s, Description: %s", name, email, phone, description)

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

		// Сохранение нового изображения
		avatarPath = "uploads/" + handler.Filename
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
	_, err = db.Exec(
		"UPDATE users SET name = $1, email = $2, phone = $3, description = $4, avatar = $5 WHERE id = $6",
		name, email, phone, description, avatarPath, claims.UserID,
	)
	if err != nil {
		log.Printf("Error updating user data in DB: %v", err)
		writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{"error": "Error updating user"})
		return
	}

	log.Printf("User data updated successfully for ID: %s", claims.UserID)
	writeJSONResponse(w, http.StatusOK, map[string]interface{}{"message": "User updated successfully"})
}