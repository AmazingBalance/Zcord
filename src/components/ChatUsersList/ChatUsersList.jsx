"use client";

import styles from "./styles.module.css";

import Image from "next/image";
import Link from "next/link";

import { useSelector } from "react-redux";
import { useState } from "react";
import { useGetChatByTagQuery } from "@/app/store/chats/chatsSlice";

import classNames from "classnames";

import default_avatar from "@/../public/default_avatar.jpg";
import link_icon from "@/../public/link.svg";

export default function ChatUsersList({ chat_tag, type, ref }) {
    const user = useSelector((state) => state.user);

    const {
        data,
        error,
        isLoading,
        refetch, // Добавляем refetch для перезагрузки данных
    } = useGetChatByTagQuery(chat_tag);

    if (isLoading) {
        return <h1>Loading...</h1>;
    }

    if (error) {
        return <h1>Error</h1>;
    }

    console.log(data);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(
                "localhost:3000/chat_invite/" + data.tag
            );
            alert("Ссылка успешно скопирована");
        } catch (err) {
            console.error("Ошибка при копировании:", err);
            alert("Ошибка при копировании");
        }
    };

    return (
        <div className={styles.ChatUsersList} ref={ref}>
            <div className={styles.ChatUsersList_ChatInfo}>
                <Image
                    src={data.imageSrc ?? default_avatar}
                    alt={data.name}
                    width={80}
                    height={80}
                />
                <div className={styles.ChatUsersList_ChatInfo_TextBlock}>
                    <h2>{data?.name ?? ""}</h2>
                    <p>
                        {(data?.users.length ?? "") +
                            (type === "chat" ? " участников" : " подписчиков")}
                    </p>
                </div>
            </div>
            <div className={styles.ChatUsersList_ChatInfo_Additional}>
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
                <p>{data?.description ?? ""}</p>
            </div>
            <div className={styles.ChatUsersList_UsersList}>
                {data?.users.map((el, ind) => (
                    <Link key={ind} href={"/user?id=" + el.id}>
                        <div className={styles.ChatUsersList_UsersListItem}>
                            <Image
                                alt={el.name}
                                width={48}
                                height={48}
                                src={
                                    el.imageSrc
                                        ? el.imageSrc.substring(0, 4) !== "http"
                                            ? "http://localhost:8000/" +
                                              el.imageSrc
                                            : el.imageSrc
                                        : default_avatar
                                }
                            />
                            <p>{el.name}</p>
                        </div>
                    </Link>
                )) ?? ""}
            </div>
        </div>
    );
}
