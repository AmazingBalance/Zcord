"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "./styles.module.css";
import classNames from "classnames";
import search_icon from "@/../public/send_button.svg";
import default_avatar from "@/../public/default_avatar.jpg";

export default function AddFriend({ handleAddFriend, handleAcceptFriend }) {
    const [searchResult, setSearchResult] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");

    const handleSearch = async () => {
        try {
            const token = localStorage.getItem("token");
            const response = await fetch(
                `http://localhost:8000/api/friends/search?query=${searchTerm}`,
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
            console.log(data);
            setSearchResult(data);
        } catch (error) {
            console.error("Ошибка поиска:", error);
            setSearchResult(null);
        }
    };

    const handleFriendRequest = async () => {
        if (!searchResult) return;
        try {
            const token = localStorage.getItem("token");
            const endpoint = searchResult.requestReceived
                ? "accept" // Если получен запрос — принимаем его
                : "request"; // Иначе отправляем заявку

            const response = await fetch(
                `http://localhost:8000/api/friends/${endpoint}`,
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
                if (searchResult.requestReceived) {
                    handleAcceptFriend({
                        name: targetUser.name,
                        id: targetUser.id,
                        tag: targetUser.tag,
                        avatar: targetUser.imageSrc,
                    });
                } else {
                    handleAddFriend({
                        name: targetUser.name,
                        id: targetUser.id,
                        tag: targetUser.tag,
                        avatar: targetUser.imageSrc,
                    });
                }
            }
            setSearchResult((prev) => ({ ...prev, ...data }));
        } catch (error) {
            console.error("Ошибка отправки запроса в друзья:", error);
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
                />
                <button onClick={handleSearch}>
                    <Image
                        width={16}
                        height={16}
                        alt="Поиск"
                        src={search_icon}
                    />
                </button>
            </div>
            <div className={styles.AddFriend_SearchResults}>
                {searchResult ? (
                    <div className={styles.AddFriend_SearchResults_Item}>
                        <Image
                            alt="Аватарка"
                            src={
                                searchResult?.data.user?.imageSrc ??
                                default_avatar
                            }
                            width={100}
                            height={100}
                            className={
                                styles.AddFriend_SearchResults_Item_Avatar
                            }
                        />
                        <p className={styles.AddFriend_SearchResults_Item_Name}>
                            {searchResult.data.user.name}
                        </p>
                        <button
                            className={classNames(
                                styles.AddFriend_SearchResults_Item_Button,
                                searchResult?.isFriend ||
                                    searchResult?.requestSent
                                    ? styles.AddFriend_SearchResults_Item_Button__Sent
                                    : ""
                            )}
                            onClick={handleFriendRequest}
                        >
                            {searchResult?.isFriend ? "Вы уже друзья" : ""}
                            {searchResult?.requestSent
                                ? "Запрос отправлен"
                                : ""}
                            {searchResult?.requestReceived
                                ? "Принять заявку"
                                : ""}
                            {!searchResult?.isFriend &&
                            !searchResult?.requestSent &&
                            !searchResult?.requestReceived
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
