"use client";
import React from "react";
import styles from "./styles.module.css";
import ChatItem from "./ChatItem/ChatItem";

import { useSelector, useDispatch } from "react-redux";
import { useEffect } from "react";
import { useGetUserChatsQuery } from "@/app/store/chats/chatsSlice";
import { websocketService } from "@/services/websocket";

export default function ChatList({ active_chat_tag }) {
  let { data, error, isLoading, refetch } = useGetUserChatsQuery();
  const user = useSelector((state) => state.user);

  // Обновляем список чатов при получении новых сообщений
  useEffect(() => {
    const handleNewMessage = (message) => {
      console.log("ChatList: Received new message, refreshing chat list");
      refetch();
    };

    const handleChatUpdate = (message) => {
      console.log("ChatList: Chat updated, refreshing chat list");
      refetch();
    };

    const handleMessageRead = (message) => {
      // Unread counters are per-user; ignore reads from other users.
      if (String(message?.userId) !== String(user?.id)) return;
      refetch();
    };

    // Подписываемся на события новых сообщений
    websocketService.onMessage("new_message", handleNewMessage);
    websocketService.onMessage("chat_updated", handleChatUpdate);
    websocketService.onMessage("message_read", handleMessageRead);

    // Очистка при размонтировании
    return () => {
      websocketService.offMessage("new_message", handleNewMessage);
      websocketService.offMessage("chat_updated", handleChatUpdate);
      websocketService.offMessage("message_read", handleMessageRead);
    };
  }, [refetch, user?.id]);

  if (isLoading) {
    return (
      <nav className={styles.ChatList}>
        <div className={styles.loadingMessage}>Загрузка чатов...</div>
      </nav>
    );
  }

  if (error) {
    return (
      <nav className={styles.ChatList}>
        <div className={styles.errorMessage}>
          <p>Не удалось загрузить чаты</p>
          <small>Проверьте подключение к интернету</small>
        </div>
      </nav>
    );
  }

  if (!data || data.length === 0) {
    return (
      <nav className={styles.ChatList}>
        <div className={styles.emptyMessage}>
          <p>У вас пока нет чатов</p>
          <small>Создайте новый чат или присоединитесь к существующему</small>
        </div>
      </nav>
    );
  }

  return (
    <nav className={styles.ChatList}>
      {data.map((chat) => (
        <ChatItem
          active={chat.tag === active_chat_tag}
          chat_tag={chat.tag}
          friendTag={chat.type === "ls" ? chat.tag : null}
          type={chat.type}
          key={chat.id}
          name={chat.name}
          imageSrc={chat.imageSrc}
          lastUserName={chat.lastUserName}
          lastMessage={chat.lastMessage}
          unreadCount={chat.unreadCount}
        />
      ))}
    </nav>
  );
}
