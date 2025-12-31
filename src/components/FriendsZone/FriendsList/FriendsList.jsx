"use client";

import Image from "next/image";
import Link from "next/link";
import Avatar from "@/components/Avatar/Avatar";

import styles from "./styles.module.css";

import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { clearFriendsNotifications } from "@/app/store/user/user";

import close from "@/../public/close.svg";
import check from "@/../public/check.svg";
import chat_icon from "@/../public/chat_icon.svg";
import delete_icon from "@/../public/delete.svg";
import default_avatar from "@/../public/default_avatar.jpg";

export default function FriendsList({
  friends_list,
  friends_list_in,
  friends_list_out,
  friendsAcceptedNotification = false,
  friendsRemovedNotification = false,
  setShowPopup,
  setConfirmationData,
  handleFriendAccept,
}) {
  const [menuSection, setMenuSection] = useState("current");
  const dispatch = useDispatch();

  const handleSectionChange = (nextSection) => {
    if (
      nextSection === "current" &&
      (friendsAcceptedNotification || friendsRemovedNotification)
    ) {
      dispatch(clearFriendsNotifications());
    }

    setMenuSection(nextSection);
  };

  useEffect(() => {
    if (menuSection !== "current") return;
    if (!friendsAcceptedNotification && !friendsRemovedNotification) return;

    dispatch(clearFriendsNotifications());
  }, [
    dispatch,
    menuSection,
    friendsAcceptedNotification,
    friendsRemovedNotification,
  ]);

  return (
    <div className={styles.FriendsList}>
      <h2 className={styles.FriendsZone_FriendsList_Title}>Список друзей</h2>
      <div className={styles.FriendsZone_FriendsList_SectionsMenu}>
        <div
          className={
            menuSection === "current"
              ? styles.FriendsZone_FriendsList_SectionsMenu_Item__Active
              : ""
          }
          onClick={() => handleSectionChange("current")}
        >
          Друзья
          {friendsAcceptedNotification || friendsRemovedNotification ? (
            <span className={styles.FriendsZone_NotificationDot} />
          ) : null}
        </div>
        <div
          className={
            menuSection === "in"
              ? styles.FriendsZone_FriendsList_SectionsMenu_Item__Active
              : ""
          }
          onClick={() => handleSectionChange("in")}
        >
          Входящие
          {(friends_list_in?.length || 0) > 0 ? (
            <span className={styles.FriendsZone_NotificationDot} />
          ) : null}
        </div>
        <div
          className={
            menuSection === "out"
              ? styles.FriendsZone_FriendsList_SectionsMenu_Item__Active
              : ""
          }
          onClick={() => handleSectionChange("out")}
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
            <Avatar
              src={friend.avatar}
              name={friend.name}
              size={50}
              className={styles.FriendsList_Item_Avatar}
            />
            <p className={styles.FriendsList_Item_Name}>{friend.name}</p>
          </div>
          <div className={styles.FriendsList_Item_IconsList}>
            {menuSection === "current" && (
              <Link href={"/ls/" + friend.tag}>
                <div className={styles.FriendsList_Item_IconContainer}>
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
                className={styles.FriendsList_Item_IconContainer}
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
                className={styles.FriendsList_Item_IconContainer}
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
            {(menuSection === "current" || menuSection === "out") && (
              <div
                className={styles.FriendsList_Item_IconContainer}
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
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
