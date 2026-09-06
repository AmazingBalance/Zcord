# 💻 Руководство для разработчиков Zcord

Полное руководство по настройке среды разработки и работе с кодом проекта Zcord.

## 📋 Содержание

- [Настройка среды разработки](#настройка-среды-разработки)
- [Архитектура проекта](#архитектура-проекта)
- [Frontend разработка](#frontend-разработка)
- [Backend разработка](#backend-разработка)
- [База данных](#база-данных)
- [Тестирование](#тестирование)
- [Отладка](#отладка)
- [Стандарты кода](#стандарты-кода)
- [Git workflow](#git-workflow)

## 🛠️ Настройка среды разработки

### Предварительные требования

**Обязательно:**

- [Node.js](https://nodejs.org/) 18+
- [Go](https://golang.org/) 1.22+
- [Podman](https://podman.io/) и Podman Compose
- [Git](https://git-scm.com/)

**Рекомендуется:**

- [VS Code](https://code.visualstudio.com/) с расширениями:
  - Go
  - ES7+ React/Redux/React-Native snippets
  - Prettier
  - ESLint
  - Podman
- [Postman](https://www.postman.com/) или [Insomnia](https://insomnia.rest/) для тестирования API

### Клонирование и настройка

1. **Клонирование репозитория:**

```bash
git clone <repository-url>
cd Zcord-main
```

2. **Установка зависимостей:**

```bash
# Frontend зависимости
npm install

# Backend зависимости
cd server
go mod download
cd ..
```

3. **Настройка переменных окружения:**

```bash
# Создание .env файла для backend
cp server/.env.example server/.env
```

Отредактируйте `server/.env`:

```env
JWT_SECRET=development-jwt-secret-key
DATABASE_URL=postgres://zcord:<POSTGRES_PASSWORD>@localhost:5435/zcord?sslmode=disable
APP_ENV=development
SERVER_PORT=8000
CORS_ORIGIN=http://localhost:3000
```

### Варианты запуска

#### Вариант 1: Полностью в Podman (рекомендуется)

```bash
# Development режим с hot reload
podman-compose -f podman-compose.dev.yml up -d

# Просмотр логов
podman-compose -f podman-compose.dev.yml logs -f
```

#### Вариант 2: Смешанный режим

```bash
# Только база данных в Podman
podman-compose -f podman-compose.yml up -d postgres

# Frontend локально
npm run dev

# Backend локально (в отдельном терминале)
cd server
go run .
```

#### Вариант 3: Полностью локально

```bash
# 1. Запуск PostgreSQL
podman run -d --name postgres-dev \
  -e POSTGRES_DB=zcord \
  -e POSTGRES_USER=zcord \
  -e POSTGRES_PASSWORD=<POSTGRES_PASSWORD> \
  -p 5435:5432 \
  postgres:15-alpine

# 2. Инициализация БД
podman exec -i postgres-dev psql -U zcord -d zcord < init.sql

# 3. Frontend (терминал 1)
npm run dev

# 4. Backend (терминал 2)
cd server
go run .
```

### Проверка установки

```bash
# Проверка доступности сервисов
curl http://localhost:3000        # Frontend
curl http://localhost:8000/api/register  # Backend API

# Проверка базы данных
podman-compose -f podman-compose.yml exec postgres psql -U zcord -d zcord -c "\dt"
```

## 🏗️ Архитектура проекта

### Структура директорий

```
Zcord-main/
├── src/                          # Next.js приложение
│   ├── app/                      # App Router
│   │   ├── auth/                 # Страница авторизации
│   │   ├── chat/[chat_tag]/      # Страница чата
│   │   ├── friends/              # Страница друзей
│   │   ├── store/                # Redux store
│   │   │   ├── activeChat/       # Активный чат
│   │   │   ├── chats/            # Список чатов
│   │   │   ├── news/             # Новости
│   │   │   └── user/             # Данные пользователя
│   │   ├── globals.css           # Глобальные стили
│   │   └── layout.js             # Основной layout
│   └── components/               # React компоненты
│       ├── ChatZone/             # Зона чата
│       ├── ChatList/             # Список чатов
│       ├── FriendsZone/          # Зона друзей
│       ├── MenuBar/              # Меню навигации
│       └── ...
├── server/                       # Go backend
│   ├── main.go                   # Основной сервер
│   ├── auth.go                   # Аутентификация
│   ├── chats.go                  # Чаты и сообщения
│   ├── friends.go                # Система друзей
│   ├── uploads/                  # Загруженные файлы
│   ├── go.mod                    # Go модули
│   └── .env                      # Переменные окружения
├── public/                       # Статические файлы
├── docs/                         # Документация
├── init.sql                      # Инициализация БД
├── podman-compose.yml            # Production Podman
├── podman-compose.dev.yml        # Development Podman
├── docker-compose.yml            # Legacy Docker (для совместимости)
├── docker-compose.dev.yml        # Legacy Docker Dev (для совместимости)
└── package.json                  # Node.js зависимости
```

### Технологический стек

**Frontend:**

- **Next.js 15** - React фреймворк с App Router
- **React 19** - UI библиотека
- **Redux Toolkit** - Управление состоянием
- **CSS Modules** - Стилизация компонентов

**Backend:**

- **Go 1.22** - Основной язык backend
- **net/http** - HTTP сервер
- **JWT** - Аутентификация
- **bcrypt** - Хеширование паролей
- **PostgreSQL driver** - Работа с БД

**База данных:**

- **PostgreSQL 15** - Основная БД
- **Связанные таблицы** - users, chats, messages

## 🎨 Frontend разработка

### Структура компонентов

```
src/components/
├── ChatZone/                     # Основная зона чата
│   ├── ChatZone.js              # Главный компонент
│   ├── ChatZone.module.css      # Стили
│   └── Message/                 # Компонент сообщения
│       ├── Message.js
│       └── Message.module.css
├── ChatList/                     # Список чатов
│   ├── ChatList.js
│   ├── ChatList.module.css
│   └── ChatItem/                # Элемент чата
└── ...
```

### Redux Store

**Структура store:**

```javascript
// src/app/store/store.js
import { configureStore } from "@reduxjs/toolkit";
import userReducer from "./user/userSlice";
import chatsReducer from "./chats/chatsSlice";
import activeChatReducer from "./activeChat/activeChatSlice";

export const store = configureStore({
  reducer: {
    user: userReducer,
    chats: chatsReducer,
    activeChat: activeChatReducer,
  },
});
```

**Пример slice:**

```javascript
// src/app/store/user/userSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

// Async thunk для логина
export const loginUser = createAsyncThunk(
  "user/login",
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        throw new Error("Login failed");
      }

      return await response.json();
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const userSlice = createSlice({
  name: "user",
  initialState: {
    data: null,
    isAuthenticated: false,
    loading: false,
    error: null,
  },
  reducers: {
    logout: (state) => {
      state.data = null;
      state.isAuthenticated = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
        state.isAuthenticated = true;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { logout } = userSlice.actions;
export default userSlice.reducer;
```

### Создание нового компонента

1. **Создание структуры:**

```bash
mkdir src/components/NewComponent
touch src/components/NewComponent/NewComponent.js
touch src/components/NewComponent/NewComponent.module.css
touch src/components/NewComponent/index.js
```

2. **Шаблон компонента:**

```javascript
// src/components/NewComponent/NewComponent.js
import { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import styles from "./NewComponent.module.css";

const NewComponent = ({ prop1, prop2 }) => {
  const [localState, setLocalState] = useState("");
  const globalState = useSelector((state) => state.user);
  const dispatch = useDispatch();

  useEffect(() => {
    // Эффекты при монтировании
  }, []);

  const handleClick = () => {
    // Обработчики событий
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>New Component</h2>
      {/* JSX содержимое */}
    </div>
  );
};

export default NewComponent;
```

3. **Экспорт компонента:**

```javascript
// src/components/NewComponent/index.js
export { default } from "./NewComponent";
```

### Стилизация

**CSS Modules пример:**

```css
/* NewComponent.module.css */
.container {
  display: flex;
  flex-direction: column;
  padding: 1rem;
  background-color: var(--bg-primary);
  border-radius: 8px;
}

.title {
  font-size: 1.5rem;
  color: var(--text-primary);
  margin-bottom: 1rem;
}

.button {
  padding: 0.5rem 1rem;
  background-color: var(--accent-color);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.button:hover {
  background-color: var(--accent-color-hover);
}
```

### API интеграция

**Создание API сервиса:**

```javascript
// src/services/api.js
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

class ApiService {
  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const config = {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      credentials: "include", // Для cookies
      ...options,
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("API request failed:", error);
      throw error;
    }
  }

  // Методы для различных endpoints
  async login(credentials) {
    return this.request("/api/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
  }

  async getChats() {
    return this.request("/chats");
  }

  async sendMessage(chatId, message) {
    return this.request("/api/send", {
      method: "POST",
      body: JSON.stringify({ chatId, ...message }),
    });
  }
}

export default new ApiService();
```

## ⚙️ Backend разработка

### Структура Go проекта

```
server/
├── main.go           # Основной файл с роутингом
├── auth.go           # Аутентификация и авторизация
├── chats.go          # Чаты и сообщения
├── friends.go        # Система друзей
├── models.go         # Структуры данных (если нужно)
├── database.go       # Работа с БД (если нужно)
├── middleware.go     # Middleware функции (если нужно)
├── utils.go          # Утилиты (если нужно)
├── uploads/          # Загруженные файлы
├── go.mod            # Go модули
├── go.sum            # Checksums модулей
└── .env              # Переменные окружения
```

### Создание нового endpoint

1. **Добавление роута в main.go:**

```go
// main.go
func main() {
    // ... существующие роуты

    // Новый роут
    http.HandleFunc("/api/new-endpoint", authenticate(NewEndpointHandler))

    log.Println("Сервер запущен на порту 8000...")
    log.Fatal(http.ListenAndServe(":8000", enableCORS(http.DefaultServeMux)))
}
```

2. **Создание handler функции:**

```go
// В соответствующем файле (например, chats.go)
func NewEndpointHandler(w http.ResponseWriter, r *http.Request) {
    // Получение ID пользователя из контекста (если аутентифицирован)
    userID := r.Context().Value("userId").(string)

    switch r.Method {
    case http.MethodGet:
        handleGetRequest(w, r, userID)
    case http.MethodPost:
        handlePostRequest(w, r, userID)
    default:
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
    }
}

func handleGetRequest(w http.ResponseWriter, r *http.Request, userID string) {
    // Логика GET запроса
    data := map[string]interface{}{
        "message": "Success",
        "userId":  userID,
    }

    writeJSONResponse(w, http.StatusOK, data)
}

func handlePostRequest(w http.ResponseWriter, r *http.Request, userID string) {
    // Парсинг JSON тела запроса
    var requestData struct {
        Field1 string `json:"field1"`
        Field2 int    `json:"field2"`
    }

    if err := json.NewDecoder(r.Body).Decode(&requestData); err != nil {
        log.Printf("Error decoding request: %v", err)
        http.Error(w, "Invalid JSON", http.StatusBadRequest)
        return
    }

    // Валидация данных
    if requestData.Field1 == "" {
        http.Error(w, "Field1 is required", http.StatusBadRequest)
        return
    }

    // Работа с базой данных
    var result string
    err := db.QueryRow(
        "INSERT INTO table_name (field1, field2, user_id) VALUES ($1, $2, $3) RETURNING id",
        requestData.Field1, requestData.Field2, userID,
    ).Scan(&result)

    if err != nil {
        log.Printf("Database error: %v", err)
        http.Error(w, "Database error", http.StatusInternalServerError)
        return
    }

    // Успешный ответ
    writeJSONResponse(w, http.StatusCreated, map[string]interface{}{
        "id":      result,
        "message": "Created successfully",
    })
}
```

### Работа с базой данных

**Пример сложного запроса:**

```go
func GetUserChatsWithLastMessage(userID string) ([]ChatWithLastMessage, error) {
    query := `
        SELECT
            c.id,
            c.name,
            c.avatar,
            c.description,
            m.text as last_message,
            m.created_at as last_message_time,
            u.name as last_user_name
        FROM chats c
        LEFT JOIN messages m ON c.last_message_id = m.id
        LEFT JOIN users u ON c.last_user_id = u.id
        WHERE $1 = ANY(c.users)
        ORDER BY m.created_at DESC
    `

    rows, err := db.Query(query, userID)
    if err != nil {
        return nil, fmt.Errorf("query error: %v", err)
    }
    defer rows.Close()

    var chats []ChatWithLastMessage
    for rows.Next() {
        var chat ChatWithLastMessage
        var lastMessage, lastUserName sql.NullString
        var lastMessageTime sql.NullTime

        err := rows.Scan(
            &chat.ID,
            &chat.Name,
            &chat.Avatar,
            &chat.Description,
            &lastMessage,
            &lastMessageTime,
            &lastUserName,
        )
        if err != nil {
            return nil, fmt.Errorf("scan error: %v", err)
        }

        // Обработка NULL значений
        if lastMessage.Valid {
            chat.LastMessage = lastMessage.String
        }
        if lastMessageTime.Valid {
            chat.LastMessageTime = lastMessageTime.Time
        }
        if lastUserName.Valid {
            chat.LastUserName = lastUserName.String
        }

        chats = append(chats, chat)
    }

    return chats, nil
}
```

### Загрузка файлов

```go
func UploadFileHandler(w http.ResponseWriter, r *http.Request) {
    // Ограничение размера файла (10MB)
    r.ParseMultipartForm(10 << 20)

    file, handler, err := r.FormFile("file")
    if err != nil {
        http.Error(w, "Error retrieving file", http.StatusBadRequest)
        return
    }
    defer file.Close()

    // Проверка типа файла
    allowedTypes := map[string]bool{
        "image/jpeg": true,
        "image/png":  true,
        "image/gif":  true,
    }

    contentType := handler.Header.Get("Content-Type")
    if !allowedTypes[contentType] {
        http.Error(w, "File type not allowed", http.StatusBadRequest)
        return
    }

    // Генерация уникального имени файла
    ext := filepath.Ext(handler.Filename)
    filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
    filepath := fmt.Sprintf("uploads/%s", filename)

    // Создание файла
    dst, err := os.Create(filepath)
    if err != nil {
        http.Error(w, "Error creating file", http.StatusInternalServerError)
        return
    }
    defer dst.Close()

    // Копирование содержимого
    _, err = io.Copy(dst, file)
    if err != nil {
        http.Error(w, "Error saving file", http.StatusInternalServerError)
        return
    }

    // Возврат пути к файлу
    writeJSONResponse(w, http.StatusOK, map[string]interface{}{
        "filename": filename,
        "path":     filepath,
    })
}
```

### Middleware

```go
// middleware.go
func LoggingMiddleware(next http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()

        // Логирование запроса
        log.Printf("Started %s %s", r.Method, r.URL.Path)

        // Выполнение следующего handler
        next.ServeHTTP(w, r)

        // Логирование времени выполнения
        log.Printf("Completed %s %s in %v", r.Method, r.URL.Path, time.Since(start))
    }
}

func RateLimitMiddleware(next http.HandlerFunc) http.HandlerFunc {
    // Простой rate limiter на основе IP
    clients := make(map[string][]time.Time)
    mutex := sync.RWMutex{}

    return func(w http.ResponseWriter, r *http.Request) {
        ip := r.RemoteAddr
        now := time.Now()

        mutex.Lock()
        defer mutex.Unlock()

        // Очистка старых запросов (старше 1 минуты)
        if times, exists := clients[ip]; exists {
            var validTimes []time.Time
            for _, t := range times {
                if now.Sub(t) < time.Minute {
                    validTimes = append(validTimes, t)
                }
            }
            clients[ip] = validTimes
        }

        // Проверка лимита (максимум 60 запросов в минуту)
        if len(clients[ip]) >= 60 {
            http.Error(w, "Rate limit exceeded", http.StatusTooManyRequests)
            return
        }

        // Добавление текущего запроса
        clients[ip] = append(clients[ip], now)

        next.ServeHTTP(w, r)
    }
}
```

## 🗄️ База данных

### Миграции

**Создание новой миграции:**

```sql
-- migrations/002_add_user_settings.sql
-- Добавление таблицы настроек пользователя

CREATE TABLE IF NOT EXISTS user_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    theme VARCHAR(20) DEFAULT 'light',
    notifications BOOLEAN DEFAULT true,
    language VARCHAR(10) DEFAULT 'en',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Индекс для быстрого поиска по user_id
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Триггер для обновления updated_at
CREATE TRIGGER update_user_settings_updated_at
    BEFORE UPDATE ON user_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

**Применение миграций:**

```bash
# Добавление в podman-compose.yml
volumes:
  - ./migrations:/docker-entrypoint-initdb.d/migrations
```

### Индексы и оптимизация

```sql
-- Индексы для оптимизации запросов
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_chat_created
    ON messages(chat_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_friends_gin
    ON users USING GIN(friends_list);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chats_users_gin
    ON chats USING GIN(users);

-- Частичные индексы
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_images
    ON messages(chat_id, created_at DESC)
    WHERE image_src IS NOT NULL;

-- Составные индексы
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_user_chat_time
    ON messages(user_id, chat_id, created_at DESC);
```

### Хранимые процедуры

```sql
-- Функция для получения чатов пользователя с пагинацией
CREATE OR REPLACE FUNCTION get_user_chats(
    p_user_id INTEGER,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    chat_id INTEGER,
    chat_name VARCHAR(255),
    chat_avatar VARCHAR(500),
    last_message TEXT,
    last_message_time TIMESTAMP,
    unread_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.name,
        c.avatar,
        m.text,
        m.created_at,
        -- Подсчет непрочитанных сообщений (упрощенная версия)
        COALESCE(
            (SELECT COUNT(*)
             FROM messages m2
             WHERE m2.chat_id = c.id
             AND m2.created_at > COALESCE(ur.last_read_at, '1970-01-01'::timestamp)
             AND m2.user_id != p_user_id),
            0
        )::BIGINT
    FROM chats c
    LEFT JOIN messages m ON c.last_message_id = m.id
    LEFT JOIN user_read_status ur ON ur.chat_id = c.id AND ur.user_id = p_user_id
    WHERE p_user_id = ANY(c.users)
    ORDER BY m.created_at DESC NULLS LAST
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;
```

## 🧪 Тестирование

### Frontend тесты

**Настройка Jest:**

```javascript
// jest.config.js
const nextJest = require("next/jest");

const createJestConfig = nextJest({
  dir: "./",
});

const customJestConfig = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  moduleNameMapping: {
    "^@/components/(.*)$": "<rootDir>/src/components/$1",
    "^@/pages/(.*)$": "<rootDir>/src/pages/$1",
  },
  testEnvironment: "jest-environment-jsdom",
};

module.exports = createJestConfig(customJestConfig);
```

**Пример теста компонента:**

```javascript
// src/components/ChatZone/__tests__/ChatZone.test.js
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import ChatZone from "../ChatZone";
import chatsReducer from "@/app/store/chats/chatsSlice";

// Mock store
const createMockStore = (initialState) => {
  return configureStore({
    reducer: {
      chats: chatsReducer,
    },
    preloadedState: initialState,
  });
};

describe("ChatZone", () => {
  const mockChat = {
    id: 1,
    name: "Test Chat",
    messages: [
      {
        id: "1",
        text: "Hello",
        user_id: "1",
        created_at: "2025-01-28T10:00:00Z",
      },
      {
        id: "2",
        text: "Hi there",
        user_id: "2",
        created_at: "2025-01-28T10:01:00Z",
      },
    ],
  };

  it("renders chat messages", () => {
    const store = createMockStore({
      chats: {
        activeChat: mockChat,
        loading: false,
        error: null,
      },
    });

    render(
      <Provider store={store}>
        <ChatZone />
      </Provider>
    );

    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("Hi there")).toBeInTheDocument();
  });

  it("sends message on form submit", () => {
    const store = createMockStore({
      chats: {
        activeChat: mockChat,
        loading: false,
        error: null,
      },
    });

    render(
      <Provider store={store}>
        <ChatZone />
      </Provider>
    );

    const input = screen.getByPlaceholderText("Type a message...");
    const sendButton = screen.getByRole("button", { name: /send/i });

    fireEvent.change(input, { target: { value: "New message" } });
    fireEvent.click(sendButton);

    // Проверка, что сообщение отправлено
    // (здесь нужно мокать API вызов)
  });
});
```

### Backend тесты

**Настройка тестов Go:**

```go
// server/main_test.go
package main

import (
    "bytes"
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "testing"
    "database/sql"
    _ "github.com/lib/pq"
)

func setupTestDB() *sql.DB {
    // Подключение к тестовой БД
    testDB, err := sql.Open("postgres", "postgres://test:test@localhost:5433/zcord_test?sslmode=disable")
    if err != nil {
        panic(err)
    }

    // Очистка и создание таблиц
    testDB.Exec("TRUNCATE users, chats, messages RESTART IDENTITY CASCADE")

    return testDB
}

func TestRegisterHandler(t *testing.T) {
    // Настройка тестовой БД
    db = setupTestDB()
    defer db.Close()

    // Тестовые данные
    userData := RegisterInput{
        Name:     "Test User",
        Email:    "test@example.com",
        Password: "password123",
        Tag:      "testuser",
    }

    jsonData, _ := json.Marshal(userData)

    // Создание запроса
    req, err := http.NewRequest("POST", "/api/register", bytes.NewBuffer(jsonData))
    if err != nil {
        t.Fatal(err)
    }
    req.Header.Set("Content-Type", "application/json")

    // Выполнение запроса
    rr := httptest.NewRecorder()
    handler := http.HandlerFunc(RegisterHandler)
    handler.ServeHTTP(rr, req)

    // Проверка статуса
    if status := rr.Code; status != http.StatusCreated {
        t.Errorf("handler returned wrong status code: got %v want %v",
            status, http.StatusCreated)
    }

    // Проверка ответа
    var response map[string]interface{}
    err = json.Unmarshal(rr.Body.Bytes(), &response)
    if err != nil {
        t.Fatal(err)
    }

    if response["message"] != "User registered successfully" {
        t.Errorf("handler returned unexpected body: got %v want %v",
            response["message"], "User registered successfully")
    }
}
```
