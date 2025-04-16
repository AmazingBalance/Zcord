"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { useGetChatByTagQuery } from "@/app/store/chats/chatsSlice";

import Message from "./Message/Message";
import classNames from "classnames";
import Image from "next/image";

import styles from "./styles.module.css";
import send_button from "@/../public/send_button.svg";

export default function ChatZone({ chat_tag, setShowPopup }) {
    const [messageInput, setMessageInput] = useState("");
    const messagesBlockRef = useRef(null); // Реф для блока с сообщениями

    const user = useSelector((state) => state.user);

    const {
        data,
        error,
        isLoading,
        refetch, // Добавляем refetch для перезагрузки данных
    } = useGetChatByTagQuery(chat_tag);

    useEffect(() => {
        // Прокручиваем блок сообщений вниз при загрузке или обновлении сообщений
        if (data && messagesBlockRef.current) {
            messagesBlockRef.current.scrollTop =
                messagesBlockRef.current.scrollHeight;
        }
    }, [data]); // Эффект срабатывает при изменении данных чата

    const handleChange = (e) => {
        setMessageInput(e.target.value);
    };

    const handleSend = async () => {
        if (messageInput.trim() === "") return;

        const newMessage = {
            userId: user.id, // ID текущего пользователя
            text: messageInput, // Текст сообщения
            type: "user", // Тип сообщения (например, текстовое сообщение)
        };

        try {
            const token = localStorage.getItem("token");

            const response = await fetch(`http://localhost:8000/api/send`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    chatID: data.id, // идентификатор чата
                    message: newMessage, // данные нового сообщения
                }),
                credentials: "include",
            });

            if (!response.ok) {
                throw new Error("Ошибка при отправке сообщения");
            }

            setMessageInput(""); // Очищаем поле ввода

            // Принудительно перезагружаем данные чата после отправки сообщения
            refetch(); // Выполняем повторный запрос данных
        } catch (error) {
            console.error("Ошибка при отправке сообщения:", error);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter") {
            handleSend();
        }
    };

    if (isLoading) {
        return <h1>Loading...</h1>;
    }

    if (error) {
        return <h1>Error</h1>;
    }

    return (
        <div className={styles.ChatZone}>
            <header
                className={styles.ChatZone_Header}
                onClick={() => setShowPopup(true)}
            >
                <Image
                    width={50}
                    height={50}
                    alt=""
                    src={data.imageSrc}
                    className={styles.ChatZone_Header_ChatLogo}
                />
                <h2 className={styles.ChatZone_Header_ChatTitle}>
                    {data.name}
                </h2>
            </header>
            <div
                className={styles.ChatZone_MessagesBlock}
                ref={messagesBlockRef} // Привязываем реф к блоку с сообщениями
            >
                {data.messages.map((message) => (
                    <Message
                        key={message.id}
                        type={message.type}
                        userName={
                            data.users.find(
                                (user) => user.id === message.userId
                            )?.name ?? "Удалённый пользователь"
                        }
                        userAvatar={
                            data.users.find(
                                (user) => user.id === message.userId
                            )?.imageSrc ?? null
                        }
                        imageSrc={message.imageSrc}
                        text={message.text}
                        active={user.id.toString() === message.userId}
                    />
                ))}
            </div>
            <div className={styles.MessagesInputContainer}>
                <input
                    type="text"
                    placeholder="Сообщение..."
                    className={styles.MessagesInput}
                    value={messageInput}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown} // Обработчик Enter
                />
                <div
                    className={classNames(
                        styles.SendButton,
                        messageInput.trim() !== ""
                            ? styles.SendButtonActive
                            : ""
                    )}
                    onClick={handleSend}
                    disabled={messageInput.trim() === ""}
                >
                    <Image alt="Отправить" src={send_button} />
                </div>
            </div>
        </div>
    );
}
