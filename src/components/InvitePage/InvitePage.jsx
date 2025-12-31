"use client";
import styles from "./styles.module.css";

import { useSelector } from "react-redux";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import Image from "next/image";
import Avatar from "@/components/Avatar/Avatar";

import default_avatar from "@/../public/default_avatar.jpg";
import arrow from "@/../public/send_button.svg";
import { apiUrl } from "@/services/apiConfig";

export default function InvitePage({ chat_invite, inviteTag }) {
  const user = useSelector((state) => state.user);
  const router = useRouter();

  const [inviteData, setInviteData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const fetchInviteInfo = async () => {
      try {
        const isTagInvite = Boolean(inviteTag);
        const url = isTagInvite
          ? apiUrl(`/api/invites/tag-info?tag=${encodeURIComponent(inviteTag)}`)
          : apiUrl(`/api/invites/info?code=${encodeURIComponent(chat_invite)}`);

        const response = await fetch(url);

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          setInviteData(null);
          setError(errorText || "Приглашение не найдено или недействительно");
          return;
        }

        const data = await response.json();
        setInviteData(data);
        setError(null);
      } catch (err) {
        console.log("Error fetching invite info:", err);
        setInviteData(null);
        setError(err?.message || "Ошибка загрузки приглашения");
      } finally {
        setLoading(false);
      }
    };

    if (chat_invite || inviteTag) {
      fetchInviteInfo();
    }
  }, [chat_invite, inviteTag]);

  const handleJoinChat = async () => {
    if (!user.isAuthenticated) {
      router.push("/auth");
      return;
    }

    if (!inviteData || !inviteData.isValid) {
      alert("Приглашение недействительно или истекло");
      return;
    }

    setJoining(true);

    try {
      const token = localStorage.getItem("token");
      const isTagInvite = Boolean(inviteTag);
      const response = await fetch(
        isTagInvite
          ? apiUrl("/api/invites/accept-tag")
          : apiUrl("/api/invites/accept"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(
            isTagInvite ? { tag: inviteTag } : { inviteCode: chat_invite }
          ),
          credentials: "include",
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Ошибка при присоединении к чату");
      }

      const result = await response.json();

      // Перенаправляем пользователя в чат
      const chatUrl =
        inviteData.chatType === "channel"
          ? `/channel/${result.chatTag}`
          : `/chat/${result.chatTag}`;

      router.push(chatUrl);
    } catch (err) {
      console.error("Error joining chat:", err);
      alert("Ошибка при присоединении: " + err.message);
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.UserPage}>
        <div className={styles.UserPage_Main}>
          <h1>Загрузка...</h1>
        </div>
      </div>
    );
  }

  if (error || !inviteData) {
    return (
      <div className={styles.UserPage}>
        <div
          className={styles.UserPage_Main_BackContainer}
          onClick={() => router.back()}
        >
          <Image
            width={25}
            height={16}
            alt="Вернуться назад"
            src={arrow}
            style={{ transform: "rotate(180deg)" }}
          />
          <p>назад</p>
        </div>
        <div className={styles.UserPage_Main}>
          <h1>Ошибка</h1>
          <p>{error || "Приглашение не найдено"}</p>
          <button onClick={() => router.back()}>Вернуться назад</button>
        </div>
      </div>
    );
  }

  const isExpired = !inviteData.isValid;
  const expiresDate = inviteData.expiresAt
    ? new Date(inviteData.expiresAt).toLocaleString()
    : null;

  return (
    <div className={styles.UserPage}>
      <div
        className={styles.UserPage_Main_BackContainer}
        onClick={() => router.back()}
      >
        <Image
          width={25}
          height={16}
          alt="Вернуться назад"
          src={arrow}
          style={{ transform: "rotate(180deg)" }}
        />
        <p>назад</p>
      </div>
      <div className={styles.UserPage_Main}>
        <Avatar
          src={inviteData.chatAvatar}
          name={inviteData.chatName}
          size={180}
        />
        <h1>{inviteData.chatName}</h1>

        <p className={styles.UserPage_Main_UsersCount}>
          {inviteData.memberCount}{" "}
          {inviteData.chatType === "chat" ? "участников" : "подписчиков"}
        </p>

        {expiresDate &&
          (isExpired ? (
            <p style={{ color: "red", fontWeight: "bold" }}>
              Приглашение истекло {expiresDate}
            </p>
          ) : (
            <p style={{ color: "green" }}>Действительно до: {expiresDate}</p>
          ))}

        {!user.isAuthenticated ? (
          <button onClick={() => router.push("/auth")}>
            Войти для присоединения
          </button>
        ) : isExpired ? (
          <button disabled style={{ opacity: 0.5 }}>
            Приглашение истекло
          </button>
        ) : (
          <button onClick={handleJoinChat} disabled={joining}>
            {joining
              ? "Присоединение..."
              : inviteData.chatType === "chat"
              ? "Присоединиться к чату"
              : "Подписаться на канал"}
          </button>
        )}
      </div>
    </div>
  );
}
