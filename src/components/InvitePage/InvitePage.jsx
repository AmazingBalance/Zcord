"use client";
import styles from "./styles.module.css";

import { useSelector } from "react-redux";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import Image from "next/image";

import default_avatar from "@/../public/default_avatar.jpg";
import arrow from "@/../public/send_button.svg";

export default function InvitePage({ chat_invite, type }) {
    const user = useSelector((state) => state.user);

    const router = useRouter();

    console.log(user);

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
                <Image
                    src={default_avatar}
                    width={180}
                    height={180}
                    alt={"Пользователь"}
                />
                <h1>ZМЕЯ</h1>

                {type === "chat" || type === "channel" ? (
                    <>
                        <p className={styles.UserPage_Main_UsersCount}>
                            18 {type === "chat" ? "участников" : "подписчиков"}
                        </p>
                        <p>
                            Lorem Ipsum is simply dummy text of the printing and
                            typesetting industry. Lorem Ipsum has been the
                            industry's standard dummy text ever since the 1500s,
                            when an unknown printer took a galley of type and
                            scrambled it to make a type specimen book. It has
                            survived not only five centuries, but also the leap
                            into electronic typesetting, remaining essentially
                            unchanged. It was popularised in the 1960s with the
                            release of Letraset sheets containing Lorem Ipsum
                            passages, and more recently with desktop publishing
                            software like Aldus PageMaker including versions of
                            Lorem Ipsum.
                        </p>
                    </>
                ) : (
                    <></>
                )}
                <button>
                    {
                        {
                            chat: "Присоединиться к чату",
                            channel: "Подписаться на канал",
                            user: "Подать заявку в друзья",
                        }[type]
                    }
                </button>
            </div>
        </div>
    );
}
