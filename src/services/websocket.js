/**
 * WebSocket сервис для real-time коммуникации
 */

import { cryptoUtils, keyManager } from "../utils/crypto.js";
import { wsUrl as buildWsUrl } from "./apiConfig.js";

class WebSocketService {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.connectPromise = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.stableConnectionResetDelay = 5000;
    this.stableConnectionTimer = null;
    this.heartbeatInterval = null;
    this.messageHandlers = new Map();
    this.subscriptions = new Set();
    this.subscriptionReasons = new Map(); // chatId -> Set(reason)
    this.userId = null;
    this.token = null;

    // Очередь сообщений для отправки при переподключении
    this.messageQueue = [];

    // Обработчики событий
    this.eventHandlers = {
      onConnect: [],
      onDisconnect: [],
      onError: [],
      onMessage: [],
    };
  }

  /**
   * Подключение к WebSocket серверу
   */
  connect(userId, token) {
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.isConnected = true;
        return Promise.resolve();
      }
      if (this.ws.readyState === WebSocket.CONNECTING && this.connectPromise) {
        return this.connectPromise;
      }
    }

    this.userId = userId;
    this.token = token;

    this.connectPromise = new Promise((resolve, reject) => {
      try {
        const url = new URL(buildWsUrl("/ws"));
        url.searchParams.set("token", token);
        this.ws = new WebSocket(url.toString());

        this.ws.onopen = () => {
          this.isConnected = true;
          this.scheduleStableReconnectReset();

          // Запускаем heartbeat
          this.startHeartbeat();

          // Отправляем сообщения из очереди
          this.flushMessageQueue();

          // Восстанавливаем подписки
          this.restoreSubscriptions();

          // Уведомляем обработчики
          this.eventHandlers.onConnect.forEach((handler) => handler());

          this.connectPromise = null;
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onclose = (event) => {
          this.clearStableReconnectReset();
          this.handleDisconnect();
        };

        this.ws.onerror = (error) => {
          this.clearStableReconnectReset();
          this.eventHandlers.onError.forEach((handler) => handler(error));
          this.connectPromise = null;
          reject(error);
        };
      } catch (error) {
        console.error("Error creating WebSocket connection:", error);
        this.connectPromise = null;
        reject(error);
      }
    });

    return this.connectPromise;
  }

  /**
   * Отключение от WebSocket сервера
   */
  disconnect() {
    if (this.ws) {
      this.isConnected = false;
      this.clearStableReconnectReset();
      this.stopHeartbeat();
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
      this.connectPromise = null;
    }
  }

  /**
   * Обработка входящих сообщений
   */
  async handleMessage(data) {
    const chunks = typeof data === "string" ? data.split("\n") : [data];

    for (const chunk of chunks) {
      const trimmed = typeof chunk === "string" ? chunk.trim() : chunk;
      if (!trimmed) continue;

      try {
        const message = JSON.parse(trimmed);

        // Логируем входящие сообщения (кроме heartbeat)
        // if (message.type !== "pong") console.log("Received WebSocket message:", message);

        // Обрабатываем зашифрованные сообщения
        if (message.type === "new_message" && message.data?.isEncrypted) {
          message.data = await this.decryptMessage(message.data);
        }

        // Вызываем специфичные обработчики
        const handlers = this.messageHandlers.get(message.type);
        if (handlers) {
          handlers.forEach((handler) => handler(message));
        }

        // Вызываем общие обработчики
        this.eventHandlers.onMessage.forEach((handler) => handler(message));
      } catch (error) {
        const preview =
          typeof trimmed === "string" ? trimmed.slice(0, 200) : "";
        console.warn(
          "WebSocket message parse error:",
          error?.message || error,
          { preview }
        );
      }
    }
  }

  /**
   * Обработка отключения
   */
  handleDisconnect() {
    this.isConnected = false;
    this.clearStableReconnectReset();
    this.stopHeartbeat();
    this.connectPromise = null;

    // Уведомляем обработчики
    this.eventHandlers.onDisconnect.forEach((handler) => handler());

    // Пытаемся переподключиться
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay =
        this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

      console.log(
        `Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`
      );

      setTimeout(() => {
        if (this.userId && this.token) {
          this.connect(this.userId, this.token).catch(() => {});
        }
      }, delay);
    } else {
      console.error("Max reconnection attempts reached");
    }
  }

  /**
   * Отправка сообщения
   */
  scheduleStableReconnectReset() {
    this.clearStableReconnectReset();
    this.stableConnectionTimer = setTimeout(() => {
      this.reconnectAttempts = 0;
    }, this.stableConnectionResetDelay);
  }

  clearStableReconnectReset() {
    if (this.stableConnectionTimer) {
      clearTimeout(this.stableConnectionTimer);
      this.stableConnectionTimer = null;
    }
  }

  send(message) {
    const normalizedMessage =
      message && typeof message === "object" ? { ...message } : message;

    if (
      normalizedMessage &&
      typeof normalizedMessage === "object" &&
      normalizedMessage.chatId != null
    ) {
      normalizedMessage.chatId = String(normalizedMessage.chatId);
    }
    if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(normalizedMessage));
    } else {
      // Добавляем в очередь для отправки при переподключении
      this.messageQueue.push(normalizedMessage);
    }
  }

  /**
   * Отправка зашифрованного сообщения в чат
   */
  async sendEncryptedMessage(chatId, text, attachments = [], replyTo = null) {
    try {
      // Получаем ключи чата
      const chatKey = await this.getChatKey(chatId);

      // Создаем данные сообщения
      const messageData = {
        text,
        attachments,
        replyTo,
        timestamp: Date.now(),
      };

      // Шифруем сообщение
      const encryptedData = await cryptoUtils.encryptMessage(
        JSON.stringify(messageData),
        chatKey,
        `chat:${chatId}`
      );

      // Подписываем сообщение
      const userKeys = keyManager.getUserKeys(this.userId);
      const signature = await cryptoUtils.signMessage(
        encryptedData.ciphertext,
        userKeys.identityKeyPair.privateKey
      );

      // Отправляем зашифрованное сообщение
      this.send({
        type: "send_encrypted_message",
        chatId,
        data: {
          encryptedContent: encryptedData.ciphertext,
          iv: encryptedData.iv,
          signature,
          isEncrypted: true,
        },
      });
    } catch (error) {
      console.error("Error sending encrypted message:", error);
      throw error;
    }
  }

  /**
   * Расшифровка входящего сообщения
   */
  async decryptMessage(messageData) {
    try {
      // Получаем ключ чата
      const chatKey = await this.getChatKey(messageData.chatId);

      // Проверяем подпись
      const senderPublicKey = await this.getUserPublicKey(messageData.userId);
      const isValidSignature = await cryptoUtils.verifyMessageSignature(
        messageData.encryptedContent,
        messageData.signature,
        senderPublicKey
      );

      if (!isValidSignature) {
        throw new Error("Invalid message signature");
      }

      // Расшифровываем сообщение
      const decryptedText = await cryptoUtils.decryptMessage(
        {
          ciphertext: messageData.encryptedContent,
          iv: messageData.iv,
          additionalData: `chat:${messageData.chatId}`,
        },
        chatKey
      );

      const decryptedData = JSON.parse(decryptedText);

      return {
        ...messageData,
        text: decryptedData.text,
        attachments: decryptedData.attachments || [],
        replyTo: decryptedData.replyTo,
        isEncrypted: false, // Помечаем как расшифрованное
      };
    } catch (error) {
      console.error("Error decrypting message:", error);
      return {
        ...messageData,
        text: "[Не удалось расшифровать сообщение]",
        isEncrypted: true,
        decryptionError: true,
      };
    }
  }

  /**
   * Подписка на чат
   */
  subscribeToChat(chatId, reason = "default") {
    const normalizedChatId = String(chatId);
    const normalizedReason = String(reason || "default");

    const reasons = this.subscriptionReasons.get(normalizedChatId) || new Set();
    reasons.add(normalizedReason);
    this.subscriptionReasons.set(normalizedChatId, reasons);

    this.subscriptions.add(normalizedChatId);
    this.send({
      type: "subscribe_chat",
      chatId: normalizedChatId,
    });
  }

  /**
   * Отписка от чата
   */
  unsubscribeFromChat(chatId, reason = "default") {
    const normalizedChatId = String(chatId);
    const normalizedReason = String(reason || "default");

    const reasons = this.subscriptionReasons.get(normalizedChatId);
    if (reasons) {
      reasons.delete(normalizedReason);
      if (reasons.size === 0) {
        this.subscriptionReasons.delete(normalizedChatId);
        this.subscriptions.delete(normalizedChatId);
        this.send({
          type: "unsubscribe_chat",
          chatId: normalizedChatId,
        });
      }
      return;
    }

    // Backward-compat fallback
    this.subscriptions.delete(normalizedChatId);
    this.send({
      type: "unsubscribe_chat",
      chatId: normalizedChatId,
    });
  }

  /**
   * Уведомление о начале печатания
   */
  startTyping(chatId) {
    this.send({
      type: "typing_start",
      chatId,
    });
  }

  /**
   * Уведомление о прекращении печатания
   */
  stopTyping(chatId) {
    this.send({
      type: "typing_stop",
      chatId,
    });
  }

  /**
   * Пометка сообщений как прочитанных
   */
  markMessagesAsRead(chatId, messageIds = []) {
    this.send({
      type: "message_read",
      chatId,
      data: { messageIds },
    });
  }

  /**
   * Запуск heartbeat
   */
  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        this.send({ type: "ping" });
      }
    }, 30000); // Каждые 30 секунд
  }

  /**
   * Остановка heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Отправка сообщений из очереди
   */
  flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.send(message);
    }
  }

  /**
   * Восстановление подписок после переподключения
   */
  restoreSubscriptions() {
    this.subscriptions.forEach((chatId) => {
      this.send({
        type: "subscribe_chat",
        chatId,
      });
    });
  }

  /**
   * Получение ключа чата (заглушка - нужна реализация)
   */
  async getChatKey(chatId) {
    // TODO: Реализовать получение/генерацию ключа чата
    // Пока возвращаем фиктивный ключ
    const keyData = localStorage.getItem(`chat_key_${chatId}`);
    if (keyData) {
      return await cryptoUtils.importKey(keyData, cryptoUtils.algorithm, [
        "encrypt",
        "decrypt",
      ]);
    }

    // Генерируем новый ключ для чата
    const key = await window.crypto.subtle.generateKey(
      cryptoUtils.algorithm,
      true,
      ["encrypt", "decrypt"]
    );

    const exportedKey = await cryptoUtils.exportKey(key);
    localStorage.setItem(`chat_key_${chatId}`, exportedKey);

    return key;
  }

  /**
   * Получение публичного ключа пользователя (заглушка)
   */
  async getUserPublicKey(userId) {
    // TODO: Реализовать получение публичного ключа пользователя с сервера
    // Пока возвращаем ключ из локального хранилища
    const userKeys = keyManager.getUserKeys(userId);
    return userKeys?.identityKeyPair?.publicKey || null;
  }

  /**
   * Добавление обработчика сообщений
   */
  onMessage(messageType, handler) {
    if (!this.messageHandlers.has(messageType)) {
      this.messageHandlers.set(messageType, []);
    }
    this.messageHandlers.get(messageType).push(handler);
  }

  /**
   * Удаление обработчика сообщений
   */
  offMessage(messageType, handler) {
    const handlers = this.messageHandlers.get(messageType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Добавление обработчика событий
   */
  addEventListener(eventType, handler) {
    if (this.eventHandlers[eventType]) {
      this.eventHandlers[eventType].push(handler);
    }
  }

  /**
   * Удаление обработчика событий
   */
  removeEventListener(eventType, handler) {
    if (this.eventHandlers[eventType]) {
      const index = this.eventHandlers[eventType].indexOf(handler);
      if (index > -1) {
        this.eventHandlers[eventType].splice(index, 1);
      }
    }
  }

  /**
   * Получение статуса соединения
   */
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      subscriptions: Array.from(this.subscriptions),
    };
  }
}

// Создаем глобальный экземпляр
export const websocketService = new WebSocketService();

// Экспортируем класс для создания дополнительных экземпляров
export default WebSocketService;
