package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/dgrijalva/jwt-go"
	"github.com/joho/godotenv"
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
		"INSERT INTO users (tag, email, password, name) VALUES ($3, $1, $2, $3) RETURNING id",
		input.Email, hashedPassword, input.Name,
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

	var id, name, tag, passwordHash string
	err := db.QueryRow(
		"SELECT id, name, tag, password FROM users WHERE email = $1 OR tag = $1",
		input.Email,
	).Scan(&id, &name, &tag, &passwordHash)
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
		UserID: id,
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

	log.Printf("User logged in successfully: ID=%s, Name=%s, Tag=%s", id, name, tag)

	writeJSONResponse(w, http.StatusOK, map[string]interface{}{
		"id":    id,
		"name":  name,
		"tag":   tag,
		"token": tokenString,
	})
}

func ValidateToken(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("token")
	if err != nil {
		log.Printf("No token provided: %v", err)
		writeJSONResponse(w, http.StatusUnauthorized, map[string]interface{}{
			"error": "Token required",
		})
		return
	}

	tokenString := cookie.Value
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		return jwtKey, nil
	})
	if err != nil || !token.Valid {
		log.Printf("Invalid token: %v", err)
		writeJSONResponse(w, http.StatusUnauthorized, map[string]interface{}{
			"error": "Invalid token",
		})
		return
	}

	// Запрос данных пользователя по его ID
	var id, name, email, tag string
	err = db.QueryRow(
		"SELECT id, name, email, tag FROM users WHERE id = $1",
		claims.UserID,
	).Scan(&id, &name, &email, &tag)
	if err != nil {
		log.Printf("Error querying user by ID: %v", err)
		writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{
			"error": "User not found",
		})
		return
	}

	log.Printf("Token validated successfully for user ID=%s", claims.UserID)

	writeJSONResponse(w, http.StatusOK, map[string]interface{}{
		"userId": id,
		"name":   name,
		"email":  email,
		"tag":    tag,
		"status": "Token is valid",
	})
}
