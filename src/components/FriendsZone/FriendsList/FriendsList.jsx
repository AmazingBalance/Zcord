"use client";

import Image from "next/image";
import Link from "next/link";

import styles from "./styles.module.css";

import { useState } from "react";

import close from "@/../public/close.svg";
import check from "@/../public/check.svg";
import chat_icon from "@/../public/chat_icon.svg";
import delete_icon from "@/../public/delete.svg";
import default_avatar from "@/../public/default_avatar.jpg";

export default function FriendsList({
    friends_list,
    friends_list_in,
    friends_list_out,
    setShowPopup,
    setConfirmationData,
    handleFriendAccept,
}) {
    const [menuSection, setMenuSection] = useState("current");

    return (
        <div className={styles.FriendsList}>
            <h2 className={styles.FriendsZone_FriendsList_Title}>
                Список друзей
            </h2>
            <div className={styles.FriendsZone_FriendsList_SectionsMenu}>
                <div
                    className={
                        menuSection === "current"
                            ? styles.FriendsZone_FriendsList_SectionsMenu_Item__Active
                            : ""
                    }
                    onClick={() => setMenuSection("current")}
                >
                    Друзья
                </div>
                <div
                    className={
                        menuSection === "in"
                            ? styles.FriendsZone_FriendsList_SectionsMenu_Item__Active
                            : ""
                    }
                    onClick={() => setMenuSection("in")}
                >
                    Входящие
                </div>
                <div
                    className={
                        menuSection === "out"
                            ? styles.FriendsZone_FriendsList_SectionsMenu_Item__Active
                            : ""
                    }
                    onClick={() => setMenuSection("out")}
                >
                    Исходящие
                </div>
            </div>
            {{
                current: friends_list ?? [],
                in: friends_list_in ?? [],
                out: friends_list_out ?? [],
            }[menuSection].map((friend, ind) => (
                <div className={styles.FriendsList_Item} key={ind}>
                    <div className={styles.FriendsList_Item_UserInfo}>
                        <Image
                            alt="Аватарка"
                            src={friend.avatar || default_avatar}
                            width={50}
                            height={50}
                            className={styles.FriendsList_Item_Avatar}
                        />
                        <p className={styles.FriendsList_Item_Name}>
                            {friend.name}
                        </p>
                    </div>
                    <div className={styles.FriendsList_Item_IconsList}>
                        {menuSection === "current" && (
                            <Link href={"/ls/" + friend.tag}>
                                <div
                                    className={
                                        styles.FriendsList_Item_IconContainer
                                    }
                                >
                                    <Image
                                        alt="Открыть чат с пользователем"
                                        src={chat_icon}
                                        width={30}
                                        height={30}
                                        className={styles.FriendsList_Item_Icon}
                                    />
                                </div>
                            </Link>
                        )}
                        {menuSection === "in" && (
                            <div
                                className={
                                    styles.FriendsList_Item_IconContainer
                                }
                                onClick={() => {
                                    handleFriendAccept(friend.id);
                                }}
                            >
                                <Image
                                    alt="Одобрить"
                                    src={check}
                                    width={30}
                                    height={30}
                                    className={styles.FriendsList_Item_Icon}
                                />
                            </div>
                        )}
                        {menuSection === "in" && (
                            <div
                                className={
                                    styles.FriendsList_Item_IconContainer
                                }
                                onClick={() => {
                                    setShowPopup(true);
                                    setConfirmationData({
                                        type: "deny_request",
                                        name: friend.name,
                                        tag: friend.tag,
                                        id: friend.id,
                                    });
                                }}
                            >
                                <Image
                                    alt="Отклонить"
                                    src={close}
                                    width={30}
                                    height={30}
                                    className={styles.FriendsList_Item_Icon}
                                />
                            </div>
                        )}
                        {menuSection === "current" ||
                            (menuSection === "out" && (
                                <div
                                    className={
                                        styles.FriendsList_Item_IconContainer
                                    }
                                    onClick={() => {
                                        setShowPopup(true);
                                        setConfirmationData({
                                            type:
                                                menuSection === "current"
                                                    ? "delete_friend"
                                                    : "delete_request",
                                            name: friend.name,
                                            tag: friend.tag,
                                            id: friend.id,
                                        });
                                    }}
                                >
                                    <Image
                                        alt="Удалить"
                                        src={delete_icon}
                                        width={30}
                                        height={30}
                                        className={styles.FriendsList_Item_Icon}
                                    />
                                </div>
                            ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
