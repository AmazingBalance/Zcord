# Архитектура безопасности и real-time системы Zcord

## Обзор

Данный документ описывает архитектуру для внедрения:

1. Сквозного шифрования (E2E encryption)
2. WebSocket соединений для real-time обновлений
3. Pub/Sub системы для массовых рассылок

## Текущая архитектура

### Фронтенд

- **Framework**: Next.js 15 с React 19
- **State Management**: Redux Toolkit + RTK Query
- **API Communication**: HTTP REST через RTK Query

### Бэкенд

- **Language**: Go 1.22.1
- **Database**: PostgreSQL
- **Authentication**: JWT токены
- **API**: REST HTTP endpoints

### База данных

- **Users**: id, name, email, tag, password, friends_list, etc.
- **Chats**: id, name, tag, users[], last_message_id
- **Messages**: id, text, type, user_id, chat_id, prev_message_id

## Новая архитектура безопасности

### 1. Сквозное шифрование (E2E)

#### Криптографическая схема

- **Алгоритм**: AES-256-GCM для симметричного шифрования
- **Обмен ключами**: ECDH (Elliptic Curve Diffie-Hellman)
- **Подписи**: ECDSA для аутентификации сообщений
- **Хеширование**: SHA-256

#### Управление ключами

```
User Keys:
├── Identity Key Pair (долгосрочная, ECDSA)
├── Signed Pre Key (среднесрочная, ECDH)
└── One-Time Pre Keys (одноразовые, ECDH)

Chat Keys:
├── Root Key (корневой ключ чата)
├── Chain Key (цепочка ключей для forward secrecy)
└── Message Keys (индивидуальные ключи сообщений)
```

#### Процесс шифрования

1. **Инициализация чата**: Обмен ключами через Double Ratchet алгоритм
2. **Отправка сообщения**:
   - Генерация уникального ключа сообщения
   - Шифрование AES-256-GCM
   - Подпись ECDSA
3. **Получение сообщения**:
   - Проверка подписи
   - Расшифровка с помощью ключа сообщения

### 2. WebSocket Real-time система

#### Архитектура WebSocket

```
Client ←→ WebSocket Server ←→ Message Broker ←→ Database
                ↓
        Pub/Sub Distribution
```

#### События WebSocket

- `message_received` - новое сообщение
- `user_online` - пользователь онлайн
- `user_offline` - пользователь оффлайн
- `typing_start` - начал печатать
- `typing_stop` - перестал печатать
- `friend_request` - новая заявка в друзья
- `chat_updated` - обновление чата

### 3. Pub/Sub система

#### Redis как Message Broker

- **Channels**: `chat:{chat_id}`, `user:{user_id}`, `global`
- **Message Types**: encrypted_message, system_notification, user_status
- **Scaling**: Поддержка кластера Redis для горизонтального масштабирования

## Схема базы данных (обновления)

### Новые таблицы

```sql
-- Ключи пользователей
CREATE TABLE user_keys (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    identity_public_key TEXT NOT NULL,
    signed_pre_key TEXT NOT NULL,
    signed_pre_key_signature TEXT NOT NULL,
    one_time_pre_keys TEXT[], -- массив одноразовых ключей
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ключи чатов
CREATE TABLE chat_keys (
    id SERIAL PRIMARY KEY,
    chat_id INTEGER REFERENCES chats(id),
    user_id INTEGER REFERENCES users(id),
    root_key TEXT NOT NULL,
    chain_key TEXT NOT NULL,
    message_number INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- WebSocket сессии
CREATE TABLE websocket_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    session_id TEXT UNIQUE NOT NULL,
    connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_ping TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);
```

-- Статусы прочтения сообщений
CREATE TABLE message_read_status (
id SERIAL PRIMARY KEY,
message_id VARCHAR(100) REFERENCES messages(id),
user_id INTEGER REFERENCES users(id),
read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
UNIQUE(message_id, user_id)
);

-- Прикрепленные ссылки к сообщениям
CREATE TABLE message_attachments (
id SERIAL PRIMARY KEY,
message_id VARCHAR(100) REFERENCES messages(id),
attachment_type VARCHAR(50) NOT NULL, -- 'link', 'file', 'image'
url TEXT,
title TEXT,
description TEXT,
thumbnail_url TEXT,
file_size BIGINT,
mime_type VARCHAR(100),
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

````

### Обновления существующих таблиц

```sql
-- Добавляем поля для зашифрованных сообщений
ALTER TABLE messages ADD COLUMN encrypted_content TEXT;
ALTER TABLE messages ADD COLUMN message_key_id TEXT;
ALTER TABLE messages ADD COLUMN signature TEXT;
ALTER TABLE messages ADD COLUMN is_encrypted BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE messages ADD COLUMN edited_at TIMESTAMP;
ALTER TABLE messages ADD COLUMN reply_to_message_id VARCHAR(100) REFERENCES messages(id);

-- Добавляем статус пользователя
ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'offline';
ALTER TABLE users ADD COLUMN last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

## Компоненты реализации

### 1. Криптографические утилиты (Frontend)

```javascript
// src/utils/crypto.js
class E2EEncryption {
  async generateKeyPair()
  async encryptMessage(message, recipientPublicKey)
  async decryptMessage(encryptedMessage, privateKey)
  async signMessage(message, privateKey)
  async verifySignature(message, signature, publicKey)
}
````

### 2. WebSocket клиент (Frontend)

```javascript
// src/services/websocket.js
class WebSocketService {
  connect(userId, token)
  disconnect()
  sendMessage(chatId, encryptedMessage)
  subscribeToChat(chatId)
  onMessageReceived(callback)
  onUserStatusChanged(callback)
}
```

### 3. WebSocket сервер (Backend)

```go
// server/websocket.go
type WebSocketHub struct {
    clients    map[*Client]bool
    broadcast  chan []byte
    register   chan *Client
    unregister chan *Client
}

type Client struct {
    hub    *WebSocketHub
    conn   *websocket.Conn
    send   chan []byte
    userID string
}
```

### 4. Pub/Sub сервис (Backend)

```go
// server/pubsub.go
type PubSubService struct {
    redisClient *redis.Client
}

func (ps *PubSubService) PublishToChat(chatID string, message []byte)
func (ps *PubSubService) PublishToUser(userID string, message []byte)
func (ps *PubSubService) SubscribeToChat(chatID string) <-chan *redis.Message
```

## План миграции

### Этап 1: WebSocket инфраструктура

1. Добавить WebSocket сервер в Go
2. Создать WebSocket клиент в React
3. Реализовать базовые real-time уведомления

### Этап 2: Pub/Sub система

1. Интегрировать Redis
2. Реализовать каналы подписки
3. Оптимизировать для массовых рассылок

### Этап 3: Криптография

1. Добавить криптографические библиотеки
2. Реализовать генерацию и обмен ключами
3. Внедрить шифрование сообщений

### Этап 4: Интеграция и тестирование

1. Объединить все компоненты
2. Провести тестирование безопасности
3. Оптимизировать производительность

## Безопасность

### Защита от атак

- **Forward Secrecy**: Каждое сообщение имеет уникальный ключ
- **Post-Compromise Security**: Компрометация одного ключа не влияет на будущие сообщения
- **Authentication**: Все сообщения подписаны отправителем
- **Integrity**: Проверка целостности через AEAD шифрование

### Управление ключами

- Ключи хранятся только на клиенте
- Сервер не имеет доступа к приватным ключам
- Автоматическая ротация ключей
- Безопасное удаление использованных ключей

## Производительность

### Оптимизации

- **Батчинг**: Группировка сообщений для массовых рассылок
- **Кеширование**: Redis для быстрого доступа к активным сессиям
- **Сжатие**: Сжатие сообщений перед шифрованием
- **Lazy Loading**: Загрузка ключей по требованию

### Масштабирование

- Горизонтальное масштабирование WebSocket серверов
- Кластер Redis для Pub/Sub
- Балансировка нагрузки для WebSocket соединений
- Оптимизация базы данных для криптографических операций
