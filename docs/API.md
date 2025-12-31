# 📡 API Документация Zcord

Полная документация REST API для мессенджера Zcord.

## 📋 Содержание

- [Общая информация](#общая-информация)
- [Аутентификация](#аутентификация)
- [Пользователи](#пользователи)
- [Чаты](#чаты)
- [Сообщения](#сообщения)
- [Друзья](#друзья)
- [Файлы](#файлы)
- [Коды ошибок](#коды-ошибок)

## 🌐 Общая информация

**Base URL:** `http://localhost:8000` (development) / `https://yourdomain.com` (production)

**Content-Type:** `application/json`

**Аутентификация:** JWT токены в cookies

### Стандартный формат ответа

**Успешный ответ:**

```json
{
  "success": true,
  "data": {
    // Данные ответа
  },
  "message": "Operation completed successfully"
}
```

**Ошибка:**

```json
{
  "success": false,
  "error": "Error message",
  "details": {
    // Дополнительная информация об ошибке
  }
}
```

## 🔐 Аутентификация

### Регистрация пользователя

**POST** `/api/register`

Создание нового пользователя в системе.

**Тело запроса:**

```json
{
  "name": "Иван Иванов",
  "email": "ivan@example.com",
  "password": "securePassword123",
  "tag": "ivan_ivanov"
}
```

**Ответ (201 Created):**

```json
{
  "id": 1,
  "name": "Иван Иванов",
  "tag": "ivan_ivanov",
  "email": "ivan@example.com",
  "phone": ""
}
```

**Возможные ошибки:**

- `400 Bad Request` - Неверные данные
- `409 Conflict` - Email или tag уже существует

---

### Вход в систему

**POST** `/api/login`

Аутентификация пользователя и получение JWT токена.

**Тело запроса:**

```json
{
  "email": "ivan@example.com",
  "password": "securePassword123"
}
```

**Ответ (200 OK):**

```json
{
  "id": 1,
  "name": "Иван Иванов",
  "email": "ivan@example.com",
  "phone": "",
  "tag": "ivan_ivanov",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "avatar": "/uploads/avatar.jpg",
  "description": "Мой статус"
}
```

**Возможные ошибки:**

- `400 Bad Request` - Неверные данные
- `401 Unauthorized` - Неверные учетные данные

---

### Проверка токена

**GET** `/api/validate-token`

Проверка действительности JWT токена и получение информации о пользователе.

**Заголовки:**

```
Cookie: token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Ответ (200 OK):**

```json
{
  "userId": 1,
  "name": "Иван Иванов",
  "email": "ivan@example.com",
  "phone": "",
  "tag": "ivan_ivanov",
  "description": "Мой статус",
  "avatar": "/uploads/avatar.jpg",
  "friends_list": [
    {
      "id": "2",
      "name": "Петр Петров",
      "tag": "petr_petrov",
      "avatar": "/uploads/petr_avatar.jpg"
    }
  ],
  "friends_list_in": [],
  "friends_list_out": [],
  "status": "Token is valid"
}
```

**Возможные ошибки:**

- `401 Unauthorized` - Токен отсутствует или недействителен

## 👤 Пользователи

### Обновление профиля

**POST** `/api/user/update`

Обновление данных профиля пользователя, включая загрузку аватара.

**Content-Type:** `multipart/form-data`

**Параметры формы:**

- `name` (string) - Имя пользователя
- `email` (string) - Email адрес
- `phone` (string) - Номер телефона
- `description` (string) - Описание/статус
- `avatar` (file) - Файл аватара (опционально)

**Ответ (200 OK):**

```json
{
  "message": "User updated successfully"
}
```

**Возможные ошибки:**

- `400 Bad Request` - Неверные данные формы
- `401 Unauthorized` - Не авторизован
- `413 Payload Too Large` - Файл слишком большой

## 💬 Чаты

### Получение списка чатов

**GET** `/chats`

Получение списка чатов пользователя.

**Заголовки:**

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Ответ (200 OK):**

```json
[
  {
    "id": 1,
    "name": "Общий чат",
    "imageSrc": "/uploads/chat_avatar.jpg",
    "description": "Общение команды",
    "tag": "general_chat",
    "lastMessage": "Привет всем!",
    "lastMessageTime": "2025-01-28T15:30:00Z",
    "lastUserName": "Иван Иванов",
    "users": [
      {
        "id": "1",
        "name": "Иван Иванов",
        "tag": "ivan_ivanov",
        "imageSrc": "/uploads/ivan_avatar.jpg"
      }
    ]
  }
]
```

**Возможные ошибки:**

- `401 Unauthorized` - Не авторизован
- `500 Internal Server Error` - Ошибка сервера

---

### Получение деталей чата

**GET** `/chat?tag={chat_tag}`

Получение подробной информации о чате, включая сообщения и участников.

**Параметры запроса:**

- `tag` (string) - Уникальный тег чата

**Ответ (200 OK):**

```json
{
  "id": 1,
  "name": "Общий чат",
  "imageSrc": "/uploads/chat_avatar.jpg",
  "description": "Общение команды",
  "messages": [
    {
      "id": "msg_123",
      "text": "Привет всем!",
      "type": "text",
      "userId": "1",
      "imageSrc": null,
      "createdAt": "2025-01-28T15:30:00Z"
    },
    {
      "id": "msg_124",
      "text": "Как дела?",
      "type": "text",
      "userId": "2",
      "imageSrc": null,
      "createdAt": "2025-01-28T15:31:00Z"
    }
  ],
  "users": [
    {
      "id": "1",
      "name": "Иван Иванов",
      "tag": "ivan_ivanov",
      "imageSrc": "/uploads/ivan_avatar.jpg",
      "description": "Разработчик"
    }
  ]
}
```

**Возможные ошибки:**

- `401 Unauthorized` - Не авторизован
- `403 Forbidden` - Нет доступа к чату
- `404 Not Found` - Чат не найден

## 📨 Сообщения

### Отправка сообщения

**POST** `/api/send`

Отправка нового сообщения в чат.

**Тело запроса:**

```json
{
  "chatId": "1",
  "text": "Привет всем!",
  "type": "text"
}
```

**Параметры:**

- `chatId` (string) - ID чата
- `text` (string) - Текст сообщения
- `type` (string) - Тип сообщения ("text", "image", "file")

**Ответ (201 Created):**

```json
{
  "id": "msg_125",
  "message": "Message sent successfully"
}
```

**Возможные ошибки:**

- `400 Bad Request` - Неверные данные
- `401 Unauthorized` - Не авторизован
- `403 Forbidden` - Нет доступа к чату
- `404 Not Found` - Чат не найден

## 👥 Друзья

### Добавление в друзья

**POST** `/api/friends/add`

Отправка заявки в друзья пользователю.

**Тело запроса:**

```json
{
  "tag": "petr_petrov"
}
```

**Ответ (200 OK):**

```json
{
  "message": "Friend request sent successfully"
}
```

**Возможные ошибки:**

- `400 Bad Request` - Неверный tag
- `404 Not Found` - Пользователь не найден
- `409 Conflict` - Заявка уже отправлена

---

### Принятие заявки в друзья

**POST** `/api/friends/accept`

Принятие входящей заявки в друзья.

**Тело запроса:**

```json
{
  "tag": "petr_petrov"
}
```

**Ответ (200 OK):**

```json
{
  "message": "Friend request accepted"
}
```

---

### Отклонение заявки в друзья

**POST** `/api/friends/reject`

Отклонение входящей заявки в друзья.

**Тело запроса:**

```json
{
  "tag": "petr_petrov"
}
```

**Ответ (200 OK):**

```json
{
  "message": "Friend request rejected"
}
```

---

### Удаление из друзей

**POST** `/api/friends/remove`

Удаление пользователя из списка друзей.

**Тело запроса:**

```json
{
  "tag": "petr_petrov"
}
```

**Ответ (200 OK):**

```json
{
  "message": "Friend removed successfully"
}
```

---

### Отмена заявки в друзья

**POST** `/api/friends/cancel`

Отмена исходящей заявки в друзья.

**Тело запроса:**

```json
{
  "tag": "petr_petrov"
}
```

**Ответ (200 OK):**

```json
{
  "message": "Friend request cancelled"
}
```

## 📁 Файлы

### Загрузка файлов

**POST** `/uploads/`

Загрузка файлов (изображения, документы).

**Content-Type:** `multipart/form-data`

**Параметры формы:**

- `file` (file) - Загружаемый файл

**Поддерживаемые форматы:**

- Изображения: JPEG, PNG, GIF
- Максимальный размер: 10MB

**Ответ (200 OK):**

```json
{
  "filename": "1643723400_image.jpg",
  "path": "uploads/1643723400_image.jpg",
  "url": "/uploads/1643723400_image.jpg"
}
```

---

### Получение файлов

**GET** `/uploads/{filename}`

Получение загруженного файла.

**Параметры пути:**

- `filename` (string) - Имя файла

**Ответ:** Файл с соответствующим Content-Type

**Возможные ошибки:**

- `404 Not Found` - Файл не найден

## ❌ Коды ошибок

### HTTP Status Codes

| Код | Описание              | Когда возникает           |
| --- | --------------------- | ------------------------- |
| 200 | OK                    | Успешный запрос           |
| 201 | Created               | Ресурс создан             |
| 400 | Bad Request           | Неверные данные запроса   |
| 401 | Unauthorized          | Требуется аутентификация  |
| 403 | Forbidden             | Доступ запрещен           |
| 404 | Not Found             | Ресурс не найден          |
| 409 | Conflict              | Конфликт данных           |
| 413 | Payload Too Large     | Файл слишком большой      |
| 422 | Unprocessable Entity  | Ошибка валидации          |
| 429 | Too Many Requests     | Превышен лимит запросов   |
| 500 | Internal Server Error | Внутренняя ошибка сервера |

### Типичные ошибки

**Ошибка валидации:**

```json
{
  "error": "Validation failed",
  "details": {
    "field": "email",
    "message": "Invalid email format"
  }
}
```

**Ошибка аутентификации:**

```json
{
  "error": "Authentication required",
  "details": {
    "message": "JWT token is missing or invalid"
  }
}
```

**Ошибка доступа:**

```json
{
  "error": "Access denied",
  "details": {
    "message": "You don't have permission to access this resource"
  }
}
```

## 🔧 Примеры использования

### JavaScript/Fetch

```javascript
// Вход в систему
const login = async (email, password) => {
  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include", // Для cookies
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Login failed:", error);
    throw error;
  }
};

// Отправка сообщения
const sendMessage = async (chatId, text) => {
  try {
    const response = await fetch("/api/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        chatId,
        text,
        type: "text",
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Send message failed:", error);
    throw error;
  }
};

// Загрузка файла
const uploadFile = async (file) => {
  try {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/uploads/", {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("File upload failed:", error);
    throw error;
  }
};
```

### cURL

```bash
# Регистрация
curl -X POST http://localhost:8000/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Иван Иванов",
    "email": "ivan@example.com",
    "password": "securePassword123",
    "tag": "ivan_ivanov"
  }'

# Вход в систему
curl -X POST http://localhost:8000/api/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "ivan@example.com",
    "password": "securePassword123"
  }'

# Получение чатов (с cookies)
curl -X GET http://localhost:8000/chats \
  -b cookies.txt

# Отправка сообщения
curl -X POST http://localhost:8000/api/send \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "chatId": "1",
    "text": "Привет всем!",
    "type": "text"
  }'

# Загрузка файла
curl -X POST http://localhost:8000/uploads/ \
  -b cookies.txt \
  -F "file=@/path/to/image.jpg"
```

## 📝 Примечания

1. **Аутентификация**: Все защищенные endpoints требуют JWT токен в cookies или Authorization заголовке
2. **CORS**: API настроен для работы с frontend на `http://localhost:3000` в development режиме
3. **Rate Limiting**: Применяется ограничение на количество запросов (60 запросов в минуту на IP)
4. **File Upload**: Максимальный размер файла - 10MB
5. **Encoding**: Все текстовые данные должны быть в UTF-8

---

**Версия API:** 1.0  
**Последнее обновление:** 28 июля 2025
