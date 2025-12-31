"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import Image from "next/image";
import styles from "./page.module.css";

import Avatar from "@/components/Avatar/Avatar";
import arrow from "@/../public/send_button.svg";
import close_icon from "@/../public/close.svg";
import { apiUrl } from "@/services/apiConfig";

import {
  addFriend,
  acceptFriendRequest,
  updateUser,
} from "@/app/store/user/user";

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const dispatch = useDispatch();
  const currentUser = useSelector((state) => state.user);

  const [profileUser, setProfileUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [friendshipStatus, setFriendshipStatus] = useState({
    isFriend: false,
    requestSent: false,
    requestReceived: false,
  });

  // Загружаем данные пользователя
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!currentUser.isAuthenticated) {
        router.push("/auth");
        return;
      }

      try {
        setLoading(true);
        const token = localStorage.getItem("token");
        const response = await fetch(
          apiUrl("/api/friends/search"),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            credentials: "include",
            body: JSON.stringify({ tag: params.username }),
          }
        );

        const data = await response.json();

        if (data.status === "success" && data.data && data.data.user) {
          setProfileUser(data.data.user);
          setFriendshipStatus({
            isFriend: data.data.isFriend,
            requestSent: data.data.requestSent,
            requestReceived: data.data.requestReceived,
          });
          setError(null);
        } else {
          setError("Пользователь не найден");
          setProfileUser(null);
        }
      } catch (err) {
        console.error("Ошибка загрузки профиля:", err);
        setError("Ошибка загрузки профиля пользователя");
        setProfileUser(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  }, [params.username, currentUser.isAuthenticated, router]);

  // Обновляем статус дружбы при изменении данных в Redux
  useEffect(() => {
    if (profileUser && currentUser.isAuthenticated) {
      const userId = parseInt(profileUser.id);

      const isFriend = currentUser.friends_list?.some(
        (friend) => parseInt(friend.id) === userId
      );
      const requestSent = currentUser.friends_list_out?.some(
        (friend) => parseInt(friend.id) === userId
      );
      const requestReceived = currentUser.friends_list_in?.some(
        (friend) => parseInt(friend.id) === userId
      );

      setFriendshipStatus({
        isFriend,
        requestSent,
        requestReceived,
      });
    }
  }, [profileUser, currentUser]);

  // Обновляем данные о друзьях
  const refreshFriendsData = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(apiUrl("/api/validate-token"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        dispatch(
          updateUser({
            friends_list: data.friends_list || [],
            friends_list_in: data.friends_list_in || [],
            friends_list_out: data.friends_list_out || [],
          })
        );
      }
    } catch (error) {
      console.error("Ошибка при обновлении данных о друзьях:", error);
    }
  };

  // Отправить заявку в друзья
  const handleSendFriendRequest = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        apiUrl("/api/friends/request"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({ senderId: profileUser.id }),
        }
      );

      const data = await response.json();
      if (data.status === "success") {
        dispatch(
          addFriend({
            name: profileUser.name,
            id: profileUser.id,
            tag: params.username,
            avatar: profileUser.imageSrc,
          })
        );
        await refreshFriendsData();
        alert("Заявка в друзья отправлена!");
      } else {
        alert(data.message || "Ошибка при отправке заявки");
      }
    } catch (error) {
      console.error("Ошибка отправки заявки:", error);
      alert("Ошибка сети при отправке заявки");
    }
  };

  // Принять заявку в друзья
  const handleAcceptFriendRequest = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(apiUrl("/api/friends/accept"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({ senderId: profileUser.id }),
      });

      const data = await response.json();
      if (data.status === "success") {
        dispatch(
          acceptFriendRequest({
            name: profileUser.name,
            id: profileUser.id,
            tag: params.username,
            avatar: profileUser.imageSrc,
          })
        );
        await refreshFriendsData();
        alert("Заявка принята!");
      } else {
        alert(data.message || "Ошибка при принятии заявки");
      }
    } catch (error) {
      console.error("Ошибка принятия заявки:", error);
      alert("Ошибка сети при принятии заявки");
    }
  };

  // Перейти в чат
  const handleGoToChat = () => {
    // Ищем чат с этим пользователем
    const existingChat = currentUser.chats?.find((chat) =>
      chat.members?.some((member) => member.tag === params.username)
    );

    if (existingChat) {
      router.push(`/chat/${existingChat.tag}`);
    } else {
      // Если чата нет, создаем новый
      router.push(`/new_chat?user=${params.username}`);
    }
  };

  // Закрыть попап
  const handleClose = () => {
    router.back();
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

  if (error || !profileUser) {
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
        <div
          className={styles.UserPage_Main_CloseContainer}
          onClick={handleClose}
        >
          <Image width={24} height={24} alt="Закрыть" src={close_icon} />
        </div>
        <div className={styles.UserPage_Main}>
          <h1>Пользователь не найден</h1>
          <p>{error || "Пользователь с таким тегом не существует"}</p>
          <button onClick={() => router.back()}>Вернуться назад</button>
        </div>
      </div>
    );
  }

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

      <div
        className={styles.UserPage_Main_CloseContainer}
        onClick={handleClose}
      >
        <Image width={24} height={24} alt="Закрыть" src={close_icon} />
      </div>

      <div className={styles.UserPage_Main}>
        <Avatar src={profileUser.imageSrc} name={profileUser.name} size={180} />
        <h1>{profileUser.name}</h1>
        <p className={styles.UserPage_Main_UserTag}>@{params.username}</p>

        {friendshipStatus.isFriend ? (
          <button onClick={handleGoToChat}>Написать сообщение</button>
        ) : friendshipStatus.requestReceived ? (
          <button onClick={handleAcceptFriendRequest}>
            Принять заявку в друзья
          </button>
        ) : friendshipStatus.requestSent ? (
          <button disabled style={{ opacity: 0.5 }}>
            Заявка отправлена
          </button>
        ) : (
          <button onClick={handleSendFriendRequest}>Добавить в друзья</button>
        )}
      </div>
    </div>
  );
}
