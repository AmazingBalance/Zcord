"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import styles from "./page.module.css";

import MenuBar from "@/components/MenuBar/MenuBar";
import ChatCreationZone from "@/components/ChatCreationZone/ChatCreationZone";
import { apiUrl } from "@/services/apiConfig";

export default function NewChat() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentUser = useSelector((state) => state.user);
  const [isCreatingDirectChat, setIsCreatingDirectChat] = useState(false);

  const targetUser = searchParams.get("user");

  useEffect(() => {
    const createDirectChat = async () => {
      if (!targetUser || !currentUser.isAuthenticated) return;

      try {
        setIsCreatingDirectChat(true);

        // Проверяем, есть ли уже чат с этим пользователем
        const existingChat = currentUser.chats?.find((chat) =>
          chat.members?.some((member) => member.tag === targetUser)
        );

        if (existingChat) {
          router.push(`/chat/${existingChat.tag}`);
          return;
        }

        // Получаем информацию о пользователе
        const token = localStorage.getItem("token");
        const userResponse = await fetch(apiUrl("/api/friends/search"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({ tag: targetUser }),
        });

        const userData = await userResponse.json();

        if (userData.status !== "success" || !userData.data?.user) {
          alert("Пользователь не найден");
          router.push("/friends");
          return;
        }

        // Проверяем, что пользователи друзья
        if (!userData.data.isFriend) {
          alert("Вы можете создать чат только с друзьями");
          router.push(`/user/${targetUser}`);
          return;
        }

        // Создаем прямой чат
        const formData = new FormData();
        formData.append(
          "name",
          `${currentUser.name} и ${userData.data.user.name}`
        );
        formData.append(
          "tag",
          `chat_${currentUser.id}_${userData.data.user.id}_${Date.now()}`
        );
        formData.append("description", "Личный чат");
        formData.append("type", "chat");
        formData.append(
          "participants",
          JSON.stringify([userData.data.user.id])
        );

        const response = await fetch(apiUrl("/api/create-chat"), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        const data = await response.json();

        if (response.ok) {
          // Перенаправляем в созданный чат
          router.push(`/chat/${formData.get("tag")}`);
        } else {
          console.error("Error creating chat:", data.error);
          alert(data.error || "Ошибка создания чата");
          router.push("/friends");
        }
      } catch (error) {
        console.error("Error:", error);
        alert("Ошибка создания чата");
        router.push("/friends");
      } finally {
        setIsCreatingDirectChat(false);
      }
    };

    if (targetUser) {
      createDirectChat();
    }
  }, [targetUser, currentUser, router]);

  // Если создаем прямой чат, показываем загрузку
  if (targetUser && isCreatingDirectChat) {
    return (
      <>
        <MenuBar />
        <div className={styles.NewChat}>
          <div className={styles.loading}>
            <h2>Создание чата...</h2>
            <p>Пожалуйста, подождите</p>
          </div>
        </div>
      </>
    );
  }

  // Если нет параметра user, показываем обычную форму создания чата
  if (!targetUser) {
    return (
      <>
        <MenuBar />
        <div className={styles.NewChat}>
          <ChatCreationZone type="chat" />
        </div>
      </>
    );
  }

  // Если есть параметр user, но не создаем чат, показываем загрузку
  return (
    <>
      <MenuBar />
      <div className={styles.NewChat}>
        <div className={styles.loading}>
          <h2>Загрузка...</h2>
        </div>
      </div>
    </>
  );
}
