"use client";

import styles from "./styles.module.css";

import Image from "next/image";
import Link from "next/link";
import Avatar from "@/components/Avatar/Avatar";

import { useSelector } from "react-redux";
import { useState } from "react";
import {
  useGetChatByTagQuery,
  useGetChannelByTagQuery,
  useGetLSByTagQuery,
} from "@/app/store/chats/chatsSlice";

import classNames from "classnames";

import default_avatar from "@/../public/default_avatar.jpg";
import link_icon from "@/../public/link.svg";
import { apiUrl } from "@/services/apiConfig";

export default function ChatUsersList({ chat_tag, type, ref }) {
  const user = useSelector((state) => state.user);

  // Используем правильный хук в зависимости от типа
  const chatQuery = useGetChatByTagQuery(chat_tag, {
    skip: type === "channel" || type === "ls",
  });
  const channelQuery = useGetChannelByTagQuery(chat_tag, {
    skip: type !== "channel",
  });
  const lsQuery = useGetLSByTagQuery(chat_tag, {
    skip: type !== "ls",
  });

  const activeQuery =
    type === "channel" ? channelQuery : type === "ls" ? lsQuery : chatQuery;
  const { data, error, isLoading, refetch } = activeQuery;

  if (isLoading) {
    return <h1>Loading...</h1>;
  }

  if (error) {
    return <h1>Error</h1>;
  }

  // console.log(data);

  const handleCopy = async () => {
    if (!data) {
      alert("Данные чата ещё не загружены");
      return;
    }
    // Проверяем, является ли это системным каналом "news"
    if (data.tag === "news") {
      alert("Нельзя создать пригласительную ссылку для системного канала");
      return;
    }

    // Проверяем, что у нас есть тег чата
    if (!data.tag) {
      alert("Ошибка: не удалось получить тег чата");
      console.error("Chat tag is missing:", data);
      return;
    }

    try {
      // Channels are public: use permanent invite URL by tag (no expiring codes).
      if (type === "channel") {
        const invitePath = `/invite/${data.tag}`;
        const inviteUrl =
          typeof window !== "undefined"
            ? `${window.location.origin}${invitePath}`
            : invitePath;

        if (!navigator.clipboard?.writeText) {
          window.prompt("Скопируйте ссылку приглашения:", inviteUrl);
          return;
        }

        await navigator.clipboard.writeText(inviteUrl);
        alert("Ссылка приглашения в канал скопирована!");
        return;
      }

      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("Вы не авторизованы");
      }

      // Создаем новое приглашение через API
      const response = await fetch(apiUrl("/api/invites/create"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          chatTag: data.tag,
        }),
        credentials: "include",
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        let errorMessage = "";
        try {
          if (contentType.includes("application/json")) {
            const errorData = await response.json();
            errorMessage = errorData?.error || JSON.stringify(errorData);
          } else {
            errorMessage = await response.text();
          }
        } catch {
          // ignore parse errors
        }
        throw new Error(errorMessage || "Ошибка при создании приглашения");
      }

      const inviteData = await response.json();

      // Копируем ссылку в буфер обмена
      const inviteUrl = inviteData?.inviteUrl;
      if (!inviteUrl) {
        throw new Error("Сервер не вернул ссылку приглашения");
      }

      if (!navigator.clipboard?.writeText) {
        window.prompt("Скопируйте ссылку приглашения:", inviteUrl);
        return;
      }

      await navigator.clipboard.writeText(inviteUrl);

      const expiresDate = new Date(inviteData.expiresAt).toLocaleString();
      alert(
        `Пригласительная ссылка успешно скопирована!\nСрок действия: ${expiresDate}`
      );
    } catch (err) {
      console.error("Ошибка при создании приглашения:", err);
      const message = err instanceof Error ? err.message : String(err);
      alert("Ошибка при создании приглашения: " + message);
    }
  };

  // Проверяем, нужно ли скрывать список участников для каналов
  const shouldHideParticipants = type === "channel";

  return (
    <div className={styles.ChatUsersList} ref={ref}>
      <div className={styles.ChatUsersList_ChatInfo}>
        <Avatar src={data.imageSrc} name={data.name} size={80} />
        <div className={styles.ChatUsersList_ChatInfo_TextBlock}>
          <h2>{data?.name ?? ""}</h2>
          <p>
            {(data?.users.length ?? "") +
              (type === "chat" || type === "ls"
                ? " участников"
                : " подписчиков")}
          </p>
        </div>
      </div>
      <div className={styles.ChatUsersList_ChatInfo_Additional}>
        {/* Показываем пригласительную ссылку только если это не системный канал и не LS чат */}
        {data.tag !== "news" && type !== "ls" && (
          <div
            className={styles.ChatUsersList_ChatInfo_InviteLink}
            onClick={handleCopy}
          >
            <Image
              width={30}
              height={30}
              alt="Скопировать ссылку для инвайта"
              src={link_icon}
            />
            <p>Пригласительная ссылка</p>
          </div>
        )}
        <p>{data?.description ?? ""}</p>
      </div>
      {/* Показываем список участников только если это не канал (кроме системного канала news) */}
      {!shouldHideParticipants && (
        <div className={styles.ChatUsersList_UsersList}>
          {data?.users.map((el, ind) => (
            <Link key={ind} href={"/user?id=" + el.id}>
              <div className={styles.ChatUsersList_UsersListItem}>
                <Avatar src={el.imageSrc} name={el.name} size={48} />
                <p>{el.name}</p>
              </div>
            </Link>
          )) ?? ""}
        </div>
      )}
    </div>
  );
}
