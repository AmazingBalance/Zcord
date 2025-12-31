"use client";

import Image from "next/image";
import styles from "./page.module.css";

import MenuBar from "@/components/MenuBar/MenuBar";
import ChatList from "@/components/ChatList/ChatList";
import Popup from "@/components/Popup/Popup";

import FriendsZone from "@/components/FriendsZone/FriendsZone";

import { useState, useRef, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";

import {
  addFriend,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  removeFriend,
  clearFriendsNotifications,
  updateUser,
} from "@/app/store/user/user";
import { apiUrl } from "@/services/apiConfig";

export default function Page() {
  const user = useSelector((state) => state.user);

  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(clearFriendsNotifications());
  }, [dispatch]);

  // Выносим loadFriendsData в отдельную функцию для повторного использования
  const loadFriendsData = async () => {
    if (!user.isAuthenticated) return;

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

        // Обновляем только данные о друзьях, если они отличаются
        if (
          JSON.stringify(user.friends_list) !==
            JSON.stringify(data.friends_list) ||
          JSON.stringify(user.friends_list_in) !==
            JSON.stringify(data.friends_list_in) ||
          JSON.stringify(user.friends_list_out) !==
            JSON.stringify(data.friends_list_out)
        ) {
          dispatch(
            updateUser({
              friends_list: data.friends_list || [],
              friends_list_in: data.friends_list_in || [],
              friends_list_out: data.friends_list_out || [],
            })
          );
          dispatch(clearFriendsNotifications());
        }
      }
    } catch (error) {
      console.error("Ошибка при загрузке данных о друзьях:", error);
    }
  };

  // Загружаем данные о друзьях при монтировании компонента
  useEffect(() => {
    loadFriendsData();
  }, [user.isAuthenticated, dispatch]);

  // Функция для обработки добавления друга
  const handleAddFriend = async (friend) => {
    dispatch(addFriend(friend));
    alert("Заявка успешно отправлена");

    // Принудительно обновляем данные с сервера после успешной операции
    await loadFriendsData();
  };

  // Функция для обработки принятия заявки на дружбу
  const handleAcceptFriend = (friend) => {
    dispatch(acceptFriendRequest(friend));
    alert("Заявка принята");
  };

  // Функция для удаления друга
  const handleRemoveFriend = (friendTag) => {
    dispatch(removeFriend(friendTag));
    alert("Успешно удалён из списка друзей");
  };

  const [confirmationData, setConfirmationData] = useState(null);

  const [showPopup, setShowPopup] = useState(false);

  const popupRef = useRef(null);

  const handleFriendRemove = async () => {
    try {
      const token = localStorage.getItem("token");

      // Выбираем правильный endpoint в зависимости от типа операции
      const endpoint =
        confirmationData.type === "delete_friend" ? "remove" : "cancel";

      const response = await fetch(
        apiUrl(`/api/friends/${endpoint}`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({ tag: confirmationData.tag }),
        }
      );
      const data = await response.json();
      console.log(data);
      if (data.status === "success") {
        if (confirmationData.type === "delete_friend") {
          handleRemoveFriend(confirmationData.tag);
        } else if (confirmationData.type === "delete_request") {
          // Удаляем из исходящих запросов
          dispatch(cancelFriendRequest(confirmationData.tag));
          alert("Заявка отменена");
        }

        // Принудительно обновляем данные с сервера после успешной операции
        await loadFriendsData();
      } else {
        console.error("Ошибка на сервере:", data.message);
        alert(
          "Ошибка при отмене заявки: " + (data.message || "Неизвестная ошибка")
        );
      }
    } catch (error) {
      console.error("Ошибка при отмене дружбы:", error);
      alert("Ошибка сети при отмене заявки");
    }
    setShowPopup(false);
  };

  const handleFriendAccept = async (friend_id) => {
    try {
      const token = localStorage.getItem("token");

      const response = await fetch(apiUrl("/api/friends/accept"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({ senderId: friend_id }),
      });
      const data = await response.json();
      console.log(data);

      if (data.status === "success") {
        // Находим друга в списке входящих запросов
        const friend = user.friends_list_in.find((f) => f.id === friend_id);
        if (friend) {
          // Добавляем в список друзей и удаляем из входящих
          dispatch(acceptFriendRequest(friend));
          alert("Заявка принята");
        }

        // Принудительно обновляем данные с сервера после успешной операции
        await loadFriendsData();
      }
    } catch (error) {
      console.error("Ошибка при приёме заявки на дружбу:", error);
    }
  };

  const handleFriendReject = async () => {
    try {
      const token = localStorage.getItem("token");

      const response = await fetch(apiUrl("/api/friends/reject"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({ tag: confirmationData.tag }),
      });
      const data = await response.json();
      console.log(data);

      if (data.status === "success") {
        // Удаляем из входящих запросов
        dispatch(rejectFriendRequest(confirmationData.id));
        alert("Заявка отклонена");

        // Принудительно обновляем данные с сервера после успешной операции
        await loadFriendsData();
      }
    } catch (error) {
      console.error("Ошибка при отклонении заявки на дружбу:", error);
    }
    setShowPopup(false);
  };

  const handleFriendCancelRequest = async () => {
    try {
      const token = localStorage.getItem("token");

      const response = await fetch(apiUrl("/api/friends/cancel"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({ tag: confirmationData.tag }),
      });
      const data = await response.json();
      console.log(data);

      if (data.status === "success") {
        // Удаляем из исходящих запросов
        dispatch(cancelFriendRequest(confirmationData.tag));
        alert("Заявка отменена");

        // Принудительно обновляем данные с сервера после успешной операции
        await loadFriendsData();
      }
    } catch (error) {
      console.error("Ошибка при отмене отправленной заявки на дружбу:", error);
    }
    setShowPopup(false);
  };

  return (
    <div className={styles.chat}>
      <Popup showed={showPopup} setShowed={setShowPopup} popupRef={popupRef}>
        <div className={styles.deleteConfirm} ref={popupRef}>
          <p>
            {confirmationData?.type === "delete_friend" ? (
              <>
                Вы уверены, что хотите удалить{" "}
                <span className={styles.deleteConfirm_Name}>
                  {confirmationData?.name || ""}
                </span>{" "}
                из списка друзей?
              </>
            ) : confirmationData?.type === "delete_request" ? (
              <>
                Вы уверены, что хотите отменить заявку, отправленную{" "}
                <span className={styles.deleteConfirm_Name}>
                  {confirmationData?.name || ""}
                </span>
              </>
            ) : (
              <>
                Вы уверены, что хотите отклонить заявку, отправленную{" "}
                <span className={styles.deleteConfirm_Name}>
                  {confirmationData?.name || ""}
                </span>
              </>
            )}
          </p>
          <div>
            <button
              className={styles.deleteConfirm_Button}
              onClick={() => {
                if (confirmationData?.type === "delete_friend") {
                  handleFriendRemove();
                }

                if (confirmationData?.type === "deny_request") {
                  handleFriendReject();
                }

                if (confirmationData?.type === "delete_request") {
                  handleFriendRemove(); // Используем общую функцию, которая теперь обрабатывает оба случая
                }
              }}
            >
              {confirmationData?.type === "deny_request"
                ? "Отклонить"
                : "Удалить"}
            </button>
            <button
              className={styles.deleteConfirm_Button__Presumably}
              onClick={() => setShowPopup(false)}
            >
              Отмена
            </button>
          </div>
        </div>
      </Popup>
      <MenuBar is_friends_visible={true} />
      <main className={styles.chatMain}>
        <ChatList />
        <FriendsZone
          setShowPopup={setShowPopup}
          setConfirmationData={setConfirmationData}
          handleFriendAccept={handleFriendAccept}
          handleAddFriend={handleAddFriend}
          user={user}
        />
      </main>
    </div>
  );
}
