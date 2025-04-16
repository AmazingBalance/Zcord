"use client";

import Image from "next/image";
import styles from "./page.module.css";

import MenuBar from "@/components/MenuBar/MenuBar";
import ChatList from "@/components/ChatList/ChatList";
import Popup from "@/components/Popup/Popup";

import FriendsZone from "@/components/FriendsZone/FriendsZone";

import { useState, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";

import {
    addFriend,
    acceptFriendRequest,
    removeFriend,
} from "@/app/store/user/user";

export default function Page() {
    const user = useSelector((state) => state.user);

    const dispatch = useDispatch();

    // Функция для обработки добавления друга
    const handleAddFriend = (friend) => {
        dispatch(addFriend(friend));
        alert("Заявка успешно отправлена");
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

            const response = await fetch(
                `http://localhost:8000/api/friends/remove`,
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
                handleRemoveFriend(confirmationData.tag);
            }
        } catch (error) {
            console.error("Ошибка при отмены дружбы:", error);
        }
        setShowPopup(false);
    };

    const handleFriendAccept = async (friend_id) => {
        try {
            const token = localStorage.getItem("token");

            console.log(confirmationData);

            const response = await fetch(
                `http://localhost:8000/api/friends/accept`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    credentials: "include",
                    body: JSON.stringify({ senderId: friend_id }),
                }
            );
            const data = await response.json();
            console.log(data);
        } catch (error) {
            console.error("Ошибка при приёме заявки на дружбу:", error);
        }
    };

    const handleFriendReject = async () => {
        try {
            const token = localStorage.getItem("token");

            console.log(confirmationData);

            const response = await fetch(
                `http://localhost:8000/api/friends/reject`,
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
        } catch (error) {
            console.error("Ошибка при отклонении заявки на дружбу:", error);
        }
        setShowPopup(false);
    };

    const handleFriendCancelRequest = async () => {
        try {
            const token = localStorage.getItem("token");

            console.log(confirmationData);

            const response = await fetch(
                `http://localhost:8000/api/friends/cancel`,
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
        } catch (error) {
            console.error(
                "Ошибка при отмене отправленной заявки на дружбу:",
                error
            );
        }
        setShowPopup(false);
    };

    return (
        <div className={styles.chat}>
            <Popup
                showed={showPopup}
                setShowed={setShowPopup}
                popupRef={popupRef}
            >
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
                                Вы уверены, что хотите отменить заявку,
                                отправленную{" "}
                                <span className={styles.deleteConfirm_Name}>
                                    {confirmationData?.name || ""}
                                </span>
                            </>
                        ) : (
                            <>
                                Вы уверены, что хотите отклонить заявку,
                                отправленную{" "}
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
                                if (
                                    confirmationData?.type === "delete_friend"
                                ) {
                                    handleFriendRemove();
                                }

                                if (confirmationData?.type === "deny_request") {
                                    handleFriendReject();
                                }

                                if (
                                    confirmationData?.type === "delete_request"
                                ) {
                                    handleFriendCancelRequest();
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
