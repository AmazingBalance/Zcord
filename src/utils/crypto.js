/**
 * Криптографические утилиты для сквозного шифрования (E2E)
 * Использует Web Crypto API для безопасных операций
 */

class E2EEncryption {
  constructor() {
    this.keyCache = new Map();
    this.algorithm = {
      name: "AES-GCM",
      length: 256,
    };
    this.keyDerivation = {
      name: "PBKDF2",
      iterations: 100000,
      hash: "SHA-256",
    };
    this.signAlgorithm = {
      name: "ECDSA",
      namedCurve: "P-256",
    };
    this.keyExchange = {
      name: "ECDH",
      namedCurve: "P-256",
    };
  }

  /**
   * Генерация пары ключей для подписи (Identity Key)
   */
  async generateIdentityKeyPair() {
    try {
      const keyPair = await window.crypto.subtle.generateKey(
        this.signAlgorithm,
        true, // extractable
        ["sign", "verify"]
      );

      return {
        publicKey: await this.exportKey(keyPair.publicKey),
        privateKey: await this.exportKey(keyPair.privateKey),
      };
    } catch (error) {
      console.error("Error generating identity key pair:", error);
      throw error;
    }
  }

  /**
   * Генерация пары ключей для обмена ключами (Pre Key)
   */
  async generatePreKeyPair() {
    try {
      const keyPair = await window.crypto.subtle.generateKey(
        this.keyExchange,
        true, // extractable
        ["deriveKey"]
      );

      return {
        publicKey: await this.exportKey(keyPair.publicKey),
        privateKey: await this.exportKey(keyPair.privateKey),
      };
    } catch (error) {
      console.error("Error generating pre key pair:", error);
      throw error;
    }
  }

  /**
   * Генерация одноразовых ключей
   */
  async generateOneTimePreKeys(count = 10) {
    const keys = [];
    for (let i = 0; i < count; i++) {
      const keyPair = await this.generatePreKeyPair();
      keys.push({
        id: this.generateKeyId(),
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
      });
    }
    return keys;
  }

  /**
   * Подпись Pre Key с помощью Identity Key
   */
  async signPreKey(preKeyPublic, identityPrivate) {
    try {
      const identityKey = await this.importKey(
        identityPrivate,
        this.signAlgorithm,
        ["sign"]
      );
      const preKeyBytes = this.base64ToArrayBuffer(preKeyPublic);

      const signature = await window.crypto.subtle.sign(
        this.signAlgorithm,
        identityKey,
        preKeyBytes
      );

      return this.arrayBufferToBase64(signature);
    } catch (error) {
      console.error("Error signing pre key:", error);
      throw error;
    }
  }

  /**
   * Проверка подписи Pre Key
   */
  async verifyPreKeySignature(preKeyPublic, signature, identityPublic) {
    try {
      const identityKey = await this.importKey(
        identityPublic,
        this.signAlgorithm,
        ["verify"]
      );
      const preKeyBytes = this.base64ToArrayBuffer(preKeyPublic);
      const signatureBytes = this.base64ToArrayBuffer(signature);

      return await window.crypto.subtle.verify(
        this.signAlgorithm,
        identityKey,
        signatureBytes,
        preKeyBytes
      );
    } catch (error) {
      console.error("Error verifying pre key signature:", error);
      return false;
    }
  }

  /**
   * Выполнение ECDH для получения общего секрета
   */
  async performECDH(privateKey, publicKey) {
    try {
      const privKey = await this.importKey(privateKey, this.keyExchange, [
        "deriveKey",
      ]);
      const pubKey = await this.importKey(publicKey, this.keyExchange, []);

      const sharedSecret = await window.crypto.subtle.deriveKey(
        {
          name: "ECDH",
          public: pubKey,
        },
        privKey,
        this.algorithm,
        false, // not extractable
        ["encrypt", "decrypt"]
      );

      return sharedSecret;
    } catch (error) {
      console.error("Error performing ECDH:", error);
      throw error;
    }
  }

  /**
   * Генерация ключа сообщения из корневого ключа
   */
  async deriveMessageKey(rootKey, info = "message") {
    try {
      const infoBytes = new TextEncoder().encode(info);
      const salt = window.crypto.getRandomValues(new Uint8Array(32));

      const messageKey = await window.crypto.subtle.deriveKey(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt: salt,
          info: infoBytes,
        },
        rootKey,
        this.algorithm,
        false, // not extractable
        ["encrypt", "decrypt"]
      );

      return {
        key: messageKey,
        salt: this.arrayBufferToBase64(salt),
      };
    } catch (error) {
      console.error("Error deriving message key:", error);
      throw error;
    }
  }

  /**
   * Шифрование сообщения
   */
  async encryptMessage(message, messageKey, additionalData = "") {
    try {
      const messageBytes = new TextEncoder().encode(message);
      const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV для GCM
      const additionalDataBytes = new TextEncoder().encode(additionalData);

      const encrypted = await window.crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: iv,
          additionalData: additionalDataBytes,
        },
        messageKey,
        messageBytes
      );

      return {
        ciphertext: this.arrayBufferToBase64(encrypted),
        iv: this.arrayBufferToBase64(iv),
        additionalData: additionalData,
      };
    } catch (error) {
      console.error("Error encrypting message:", error);
      throw error;
    }
  }

  /**
   * Расшифровка сообщения
   */
  async decryptMessage(encryptedData, messageKey) {
    try {
      const ciphertext = this.base64ToArrayBuffer(encryptedData.ciphertext);
      const iv = this.base64ToArrayBuffer(encryptedData.iv);
      const additionalData = new TextEncoder().encode(
        encryptedData.additionalData || ""
      );

      const decrypted = await window.crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: iv,
          additionalData: additionalData,
        },
        messageKey,
        ciphertext
      );

      return new TextDecoder().decode(decrypted);
    } catch (error) {
      console.error("Error decrypting message:", error);
      throw error;
    }
  }

  /**
   * Подпись сообщения
   */
  async signMessage(message, privateKey) {
    try {
      const key = await this.importKey(privateKey, this.signAlgorithm, [
        "sign",
      ]);
      const messageBytes = new TextEncoder().encode(message);

      const signature = await window.crypto.subtle.sign(
        this.signAlgorithm,
        key,
        messageBytes
      );

      return this.arrayBufferToBase64(signature);
    } catch (error) {
      console.error("Error signing message:", error);
      throw error;
    }
  }

  /**
   * Проверка подписи сообщения
   */
  async verifyMessageSignature(message, signature, publicKey) {
    try {
      const key = await this.importKey(publicKey, this.signAlgorithm, [
        "verify",
      ]);
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = this.base64ToArrayBuffer(signature);

      return await window.crypto.subtle.verify(
        this.signAlgorithm,
        key,
        signatureBytes,
        messageBytes
      );
    } catch (error) {
      console.error("Error verifying message signature:", error);
      return false;
    }
  }

  /**
   * Экспорт ключа в формат JWK
   */
  async exportKey(key) {
    try {
      const exported = await window.crypto.subtle.exportKey("jwk", key);
      return JSON.stringify(exported);
    } catch (error) {
      console.error("Error exporting key:", error);
      throw error;
    }
  }

  /**
   * Импорт ключа из формата JWK
   */
  async importKey(keyData, algorithm, keyUsages) {
    try {
      const keyObject = JSON.parse(keyData);
      return await window.crypto.subtle.importKey(
        "jwk",
        keyObject,
        algorithm,
        false, // not extractable
        keyUsages
      );
    } catch (error) {
      console.error("Error importing key:", error);
      throw error;
    }
  }

  /**
   * Генерация случайного ID ключа
   */
  generateKeyId() {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
      ""
    );
  }

  /**
   * Конвертация ArrayBuffer в Base64
   */
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Конвертация Base64 в ArrayBuffer
   */
  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Хеширование данных
   */
  async hash(data) {
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(data);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", dataBytes);
    return this.arrayBufferToBase64(hashBuffer);
  }

  /**
   * Генерация соли для ключей
   */
  generateSalt() {
    const salt = window.crypto.getRandomValues(new Uint8Array(32));
    return this.arrayBufferToBase64(salt);
  }

  /**
   * Очистка кеша ключей
   */
  clearKeyCache() {
    this.keyCache.clear();
  }

  /**
   * Сохранение ключа в кеше
   */
  cacheKey(keyId, key) {
    this.keyCache.set(keyId, key);
  }

  /**
   * Получение ключа из кеша
   */
  getCachedKey(keyId) {
    return this.keyCache.get(keyId);
  }
}

// Менеджер ключей для управления криптографическими ключами
class KeyManager {
  constructor() {
    this.crypto = new E2EEncryption();
    this.storagePrefix = "zcord_keys_";
  }

  /**
   * Инициализация ключей пользователя
   */
  async initializeUserKeys(userId) {
    try {
      // Проверяем, есть ли уже ключи
      const existingKeys = this.getUserKeys(userId);
      if (existingKeys) {
        return existingKeys;
      }

      // Генерируем новые ключи
      const identityKeyPair = await this.crypto.generateIdentityKeyPair();
      const preKeyPair = await this.crypto.generatePreKeyPair();
      const oneTimePreKeys = await this.crypto.generateOneTimePreKeys(20);

      // Подписываем Pre Key
      const preKeySignature = await this.crypto.signPreKey(
        preKeyPair.publicKey,
        identityKeyPair.privateKey
      );

      const userKeys = {
        identityKeyPair,
        preKeyPair,
        preKeySignature,
        oneTimePreKeys,
        createdAt: Date.now(),
      };

      // Сохраняем ключи
      this.saveUserKeys(userId, userKeys);

      return userKeys;
    } catch (error) {
      console.error("Error initializing user keys:", error);
      throw error;
    }
  }

  /**
   * Получение публичных ключей для отправки на сервер
   */
  getPublicKeyBundle(userId) {
    const keys = this.getUserKeys(userId);
    if (!keys) {
      throw new Error("User keys not found");
    }

    return {
      identityPublicKey: keys.identityKeyPair.publicKey,
      signedPreKey: keys.preKeyPair.publicKey,
      signedPreKeySignature: keys.preKeySignature,
      oneTimePreKeys: keys.oneTimePreKeys.map((key) => ({
        id: key.id,
        publicKey: key.publicKey,
      })),
    };
  }

  /**
   * Сохранение ключей пользователя в localStorage
   */
  saveUserKeys(userId, keys) {
    try {
      const encrypted = this.encryptForStorage(JSON.stringify(keys));
      localStorage.setItem(`${this.storagePrefix}${userId}`, encrypted);
    } catch (error) {
      console.error("Error saving user keys:", error);
      throw error;
    }
  }

  /**
   * Получение ключей пользователя из localStorage
   */
  getUserKeys(userId) {
    try {
      const encrypted = localStorage.getItem(`${this.storagePrefix}${userId}`);
      if (!encrypted) {
        return null;
      }

      const decrypted = this.decryptFromStorage(encrypted);
      return JSON.parse(decrypted);
    } catch (error) {
      console.error("Error getting user keys:", error);
      return null;
    }
  }

  /**
   * Простое шифрование для localStorage (не криптографически стойкое)
   */
  encryptForStorage(data) {
    // В реальном приложении здесь должно быть более надежное шифрование
    return btoa(data);
  }

  /**
   * Простая расшифровка для localStorage
   */
  decryptFromStorage(data) {
    try {
      return atob(data);
    } catch (error) {
      console.error("Error decrypting from storage:", error);
      return null;
    }
  }

  /**
   * Удаление ключей пользователя
   */
  clearUserKeys(userId) {
    localStorage.removeItem(`${this.storagePrefix}${userId}`);
    this.crypto.clearKeyCache();
  }

  /**
   * Ротация одноразовых ключей
   */
  async rotateOneTimePreKeys(userId, usedKeyIds) {
    const keys = this.getUserKeys(userId);
    if (!keys) {
      throw new Error("User keys not found");
    }

    // Удаляем использованные ключи
    keys.oneTimePreKeys = keys.oneTimePreKeys.filter(
      (key) => !usedKeyIds.includes(key.id)
    );

    // Генерируем новые ключи если нужно
    const neededKeys = 20 - keys.oneTimePreKeys.length;
    if (neededKeys > 0) {
      const newKeys = await this.crypto.generateOneTimePreKeys(neededKeys);
      keys.oneTimePreKeys.push(...newKeys);
    }

    // Сохраняем обновленные ключи
    this.saveUserKeys(userId, keys);

    return keys.oneTimePreKeys;
  }
}

// Экспортируем классы
export { E2EEncryption, KeyManager };

// Создаем глобальные экземпляры
export const cryptoUtils = new E2EEncryption();
export const keyManager = new KeyManager();
