"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import Avatar from "@/components/Avatar/Avatar";
import styles from "./styles.module.css";
import classNames from "classnames";
import search_icon from "@/../public/send_button.svg";
import default_avatar from "@/../public/default_avatar.jpg";
import { apiUrl } from "@/services/apiConfig";

export default function AddFriend({ handleAddFriend, handleFriendAccept }) {
  const currentUser = useSelector((state) => state.user);
  const [searchResult, setSearchResult] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Функция для принудительного обновления статуса пользователя
  const refreshUserStatus = async (userTag) => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(apiUrl("/api/friends/search"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({ tag: userTag }),
      });
      const data = await response.json();
      if (data.status === "success" && data.data && data.data.user) {
        // Обновляем состояние напрямую из ответа сервера
        setSearchResult(data);
      }
    } catch (error) {
      console.error("Ошибка обновления статуса пользователя:", error);
    }
  };

  const handleSearch = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        apiUrl(`/api/friends/search?query=${searchTerm}`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({ tag: searchTerm }),
        }
      );
      const data = await response.json();

      // Проверяем, что ответ успешный и содержит данные пользователя
      if (data.status === "success" && data.data && data.data.user) {
        // Устанавливаем данные напрямую из ответа сервера
        setSearchResult(data);
      } else {
        setSearchResult(null);
      }
    } catch (error) {
      console.error("Ошибка поиска:", error);
      setSearchResult(null);
    }
  };

  const handleFriendRequest = async () => {
    if (!searchResult) return;

    try {
      const token = localStorage.getItem("token");
      const endpoint = searchResult.data.requestReceived
        ? "accept" // Если получен запрос — принимаем его
        : "request"; // Иначе отправляем заявку

      const response = await fetch(
        apiUrl(`/api/friends/${endpoint}`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({
            senderId: searchResult.data.user.id,
          }),
        }
      );
      const data = await response.json();
      if (data.status === "success") {
        const targetUser = searchResult.data.user;
        if (searchResult.data.requestReceived) {
          handleFriendAccept(targetUser.id);
        } else {
          handleAddFriend({
            name: targetUser.name,
            id: targetUser.id,
            tag: targetUser.tag,
            avatar: targetUser.imageSrc,
          });
        }

        // Принудительно обновляем статус пользователя с сервера
        await refreshUserStatus(targetUser.tag);
      } else {
        // Обрабатываем ошибки сервера
        console.error("Ошибка сервера:", data.message);
        if (data.message === "Friend request already sent") {
          // Если заявка уже отправлена, обновляем UI соответственно
          setSearchResult((prev) => ({
            ...prev,
            data: {
              ...prev.data,
              requestSent: true,
            },
          }));
        } else if (data.message === "Users are already friends") {
          // Если пользователи уже друзья
          setSearchResult((prev) => ({
            ...prev,
            data: {
              ...prev.data,
              isFriend: true,
              requestSent: false,
              requestReceived: false,
            },
          }));
        }
        // Показываем пользователю сообщение об ошибке
        alert(data.message || "Произошла ошибка при отправке заявки");
      }
    } catch (error) {
      console.error("Ошибка отправки запроса в друзья:", error);
      alert("Ошибка сети при отправке заявки");
    }
  };

  // Отслеживаем изменения в Redux store для обновления локального состояния
  useEffect(() => {
    if (searchResult && searchResult.data && searchResult.data.user) {
      const userId = parseInt(searchResult.data.user.id);

      // Проверяем, есть ли пользователь в списках друзей
      const isFriend = currentUser.friends_list?.some(
        (friend) => parseInt(friend.id) === userId
      );
      const requestSent = currentUser.friends_list_out?.some(
        (friend) => parseInt(friend.id) === userId
      );
      const requestReceived = currentUser.friends_list_in?.some(
        (friend) => parseInt(friend.id) === userId
      );

      // Обновляем локальное состояние только если есть изменения
      const currentState = {
        isFriend: searchResult.data.isFriend,
        requestSent: searchResult.data.requestSent,
        requestReceived: searchResult.data.requestReceived,
      };

      const newState = {
        isFriend,
        requestSent,
        requestReceived,
      };

      // Проверяем, изменилось ли состояние
      if (JSON.stringify(currentState) !== JSON.stringify(newState)) {
        setSearchResult((prev) => ({
          ...prev,
          data: {
            ...prev.data,
            ...newState,
          },
        }));
      }
    }
  }, [searchResult, currentUser]);

  // Дополнительный эффект для отслеживания изменений в списках друзей
  useEffect(() => {
    if (searchResult && searchResult.data && searchResult.data.user) {
      // Небольшая задержка для обеспечения обновления Redux store
      const timeoutId = setTimeout(() => {
        const userId = parseInt(searchResult.data.user.id);

        const isFriend = currentUser.friends_list?.some(
          (friend) => parseInt(friend.id) === userId
        );
        const requestSent = currentUser.friends_list_out?.some(
          (friend) => parseInt(friend.id) === userId
        );
        const requestReceived = currentUser.friends_list_in?.some(
          (friend) => parseInt(friend.id) === userId
        );

        setSearchResult((prev) => ({
          ...prev,
          data: {
            ...prev.data,
            isFriend,
            requestSent,
            requestReceived,
          },
        }));
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [searchResult, currentUser]);

  // Обработчик нажатия Enter
  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className={styles.AddFriend}>
      <div className={styles.AddFriend_SearchInput_Container}>
        <input
          type="text"
          placeholder="Поиск по тегу"
          className={styles.AddFriend_SearchInput}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyPress={handleKeyPress}
        />
        <button onClick={handleSearch}>
          <Image width={16} height={16} alt="Поиск" src={search_icon} />
        </button>
      </div>
      <div className={styles.AddFriend_SearchResults}>
        {searchResult ? (
          <div className={styles.AddFriend_SearchResults_Item}>
            <Avatar
              src={searchResult?.data.user?.imageSrc}
              name={searchResult.data.user.name}
              size={100}
              className={styles.AddFriend_SearchResults_Item_Avatar}
            />
            <p className={styles.AddFriend_SearchResults_Item_Name}>
              {searchResult.data.user.name}
            </p>
            <button
              className={classNames(
                styles.AddFriend_SearchResults_Item_Button,
                searchResult?.data?.isFriend || searchResult?.data?.requestSent
                  ? styles.AddFriend_SearchResults_Item_Button__Sent
                  : ""
              )}
              onClick={handleFriendRequest}
              disabled={
                searchResult?.data?.isFriend || searchResult?.data?.requestSent
              }
            >
              {searchResult?.data?.isFriend ? "Вы уже друзья" : ""}
              {searchResult?.data?.requestSent ? "Запрос отправлен" : ""}
              {searchResult?.data?.requestReceived ? "Принять заявку" : ""}
              {!searchResult?.data?.isFriend &&
              !searchResult?.data?.requestSent &&
              !searchResult?.data?.requestReceived
                ? "Отправить заявку"
                : ""}
            </button>
          </div>
        ) : (
          <div className={styles.AddFriend_SearchResults_NotFound}>
            Пользователь не найден
          </div>
        )}
      </div>
    </div>
  );
}
