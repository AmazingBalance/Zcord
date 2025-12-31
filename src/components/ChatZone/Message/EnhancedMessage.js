"use client";

import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import styles from "./EnhancedMessage.module.css";

const EnhancedMessage = ({
  message,
  isOwn = false,
  showAvatar = true,
  onReply,
  onMarkAsRead,
  chatParticipants = [],
}) => {
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptedContent, setDecryptedContent] = useState(null);
  const [showReadBy, setShowReadBy] = useState(false);
  const user = useSelector((state) => state.user);

  // Расшифровка сообщения при необходимости
  useEffect(() => {
    if (message.isEncrypted && !message.decryptionError && !decryptedContent) {
      decryptMessage();
    }
  }, [message]);

  const decryptMessage = async () => {
    setIsDecrypting(true);
    try {
      // Здесь будет логика расшифровки
      // Пока используем заглушку
      setDecryptedContent({
        text: message.text,
        attachments: message.attachments || [],
      });
    } catch (error) {
      console.error("Error decrypting message:", error);
    } finally {
      setIsDecrypting(false);
    }
  };

  // Форматирование времени
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (diffInHours < 24 * 7) {
      return date.toLocaleDateString("ru-RU", {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } else {
      return date.toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  };

  // Получение списка пользователей, прочитавших сообщение
  const getReadByUsers = () => {
    if (!message.readBy || message.readBy.length === 0) return [];

    return message.readBy
      .filter((userId) => userId !== user.id)
      .map((userId) => {
        const participant = chatParticipants.find((p) => p.id === userId);
        return participant ? participant.name : `User ${userId}`;
      });
  };

  // Обработка клика по сообщению для пометки как прочитанное
  const handleMessageClick = () => {
    if (!isOwn && !message.isRead && onMarkAsRead) {
      onMarkAsRead(message.id);
    }
  };

  // Рендер вложений
  const renderAttachments = (attachments) => {
    if (!attachments || attachments.length === 0) return null;

    return (
      <div className={styles.attachments}>
        {attachments.map((attachment, index) => (
          <div key={index} className={styles.attachment}>
            {attachment.type === "link" && (
              <div className={styles.linkPreview}>
                {attachment.thumbnail && (
                  <img
                    src={attachment.thumbnail}
                    alt={attachment.title}
                    className={styles.linkThumbnail}
                  />
                )}
                <div className={styles.linkInfo}>
                  <h4 className={styles.linkTitle}>{attachment.title}</h4>
                  {attachment.description && (
                    <p className={styles.linkDescription}>
                      {attachment.description}
                    </p>
                  )}
                  <a
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.linkUrl}
                  >
                    {attachment.url}
                  </a>
                </div>
              </div>
            )}

            {attachment.type === "image" && (
              <div className={styles.imageAttachment}>
                <img
                  src={attachment.url}
                  alt="Attached image"
                  className={styles.attachedImage}
                  style={{
                    maxWidth: attachment.width
                      ? `${Math.min(attachment.width, 400)}px`
                      : "400px",
                    maxHeight: attachment.height
                      ? `${Math.min(attachment.height, 300)}px`
                      : "300px",
                  }}
                />
              </div>
            )}

            {attachment.type === "file" && (
              <div className={styles.fileAttachment}>
                <div className={styles.fileIcon}>📎</div>
                <div className={styles.fileInfo}>
                  <span className={styles.fileName}>{attachment.title}</span>
                  {attachment.fileSize && (
                    <span className={styles.fileSize}>
                      {formatFileSize(attachment.fileSize)}
                    </span>
                  )}
                </div>
                <a
                  href={attachment.url}
                  download
                  className={styles.downloadButton}
                >
                  ⬇️
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Форматирование размера файла
  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Рендер ответа на сообщение
  const renderReplyTo = () => {
    if (!message.replyTo) return null;

    return (
      <div className={styles.replyTo}>
        <div className={styles.replyLine}></div>
        <div className={styles.replyContent}>
          <span className={styles.replyAuthor}>Ответ на сообщение</span>
          <span className={styles.replyText}>{message.replyTo.text}</span>
        </div>
      </div>
    );
  };

  const content = decryptedContent || message;
  const readByUsers = getReadByUsers();

  return (
    <div
      className={`${styles.message} ${isOwn ? styles.own : styles.other}`}
      onClick={handleMessageClick}
    >
      {showAvatar && !isOwn && (
        <div className={styles.avatar}>
          {message.userAvatar ? (
            <img src={message.userAvatar} alt={message.userName} />
          ) : (
            <div className={styles.avatarPlaceholder}>
              {message.userName?.charAt(0)?.toUpperCase()}
            </div>
          )}
        </div>
      )}

      <div className={styles.messageContent}>
        {!isOwn && (
          <div className={styles.messageHeader}>
            <span className={styles.userName}>{message.userName}</span>
            <span className={styles.timestamp}>
              {formatTime(message.sentAt || message.timestamp)}
            </span>
          </div>
        )}

        {renderReplyTo()}

        <div className={styles.messageBody}>
          {message.isEncrypted && message.decryptionError ? (
            <div className={styles.encryptionError}>
              🔒 Не удалось расшифровать сообщение
            </div>
          ) : isDecrypting ? (
            <div className={styles.decrypting}>🔄 Расшифровка...</div>
          ) : (
            <>
              {content.text && (
                <div className={styles.messageText}>{content.text}</div>
              )}
              {renderAttachments(content.attachments)}
            </>
          )}
        </div>

        <div className={styles.messageFooter}>
          <div className={styles.messageActions}>
            {onReply && (
              <button
                className={styles.actionButton}
                onClick={(e) => {
                  e.stopPropagation();
                  onReply(message);
                }}
                title="Ответить"
              >
                ↩️
              </button>
            )}
          </div>

          <div className={styles.messageStatus}>
            {isOwn && (
              <span className={styles.timestamp}>
                {formatTime(message.sentAt || message.timestamp)}
              </span>
            )}

            {message.editedAt && (
              <span className={styles.edited} title="Отредактировано">
                ред.
              </span>
            )}

            {isOwn && message.isEncrypted && (
              <span className={styles.encrypted} title="Зашифровано">
                🔒
              </span>
            )}

            {isOwn && readByUsers.length > 0 && (
              <span
                className={styles.readStatus}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowReadBy(!showReadBy);
                }}
                title={`Прочитано: ${readByUsers.join(", ")}`}
              >
                ✓✓
              </span>
            )}
          </div>
        </div>

        {showReadBy && readByUsers.length > 0 && (
          <div className={styles.readByList}>
            <strong>Прочитано:</strong>
            <ul>
              {readByUsers.map((userName, index) => (
                <li key={index}>{userName}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnhancedMessage;
