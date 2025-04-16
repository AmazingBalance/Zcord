"use client";

import React from "react";

import Image from "next/image";

import styles from "./styles.module.css";

import FriendsList from "./FriendsList/FriendsList";
import AddFriend from "./AddFriend/AddFriend";

export default function FriendsZone({
    setShowPopup,
    setConfirmationData,
    handleFriendAccept,
    handleAddFriend,
    user,
}) {
    return (
        <div className={styles.FriendsZone}>
            <div className={styles.FriendsZone_FriendsListContainer}>
                <FriendsList
                    setShowPopup={setShowPopup}
                    setConfirmationData={setConfirmationData}
                    friends_list={user.friends_list}
                    friends_list_out={user.friends_list_out}
                    friends_list_in={user.friends_list_in}
                    handleFriendAccept={handleFriendAccept}
                />
            </div>
            <div className={styles.FriendsZone_AddFriendContainer}>
                <h2 className={styles.FriendsZone_AddFriend_Title}>
                    Отправить запрос на дружбу
                </h2>
                <AddFriend
                    handleAddFriend={handleAddFriend}
                    handleFriendAccept={handleFriendAccept}
                />
            </div>
        </div>
    );
}
