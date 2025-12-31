"use client";

import styles from "./styles.module.css";
import GamburgerMenu from "./GabmurgerMenu/GamburgerMenu";

import Link from "next/link";

import { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { logoutUser } from "@/app/store/user/user";

export default function MenuBar({ is_friends_visible }) {
  const [showMenu, setShowMenu] = useState(false);
  const user = useSelector((state) => state.user);
  const dispatch = useDispatch();

  const hasFriendsNotification =
    (user.friends_list_in?.length || 0) > 0 ||
    user.friendsAcceptedNotification ||
    user.friendsRemovedNotification;

  return (
    <header className={styles.MenuBar}>
      <GamburgerMenu
        showMenu={showMenu}
        setShowMenu={setShowMenu}
        userName={user.name}
        userTag={user.tag}
        userAvatar={user.imageSrc}
        onLogout={() => dispatch(logoutUser())}
      />
      {is_friends_visible ? (
        <Link href="/friends">
          <div className={styles.MenuBar_Friends}>
            {hasFriendsNotification ? (
              <span className={styles.MenuBar_NotificationDot} />
            ) : null}
            <img
              alt="Друзья"
              src="/friends.svg"
              width={30}
              height={30}
              loading="eager"
              decoding="async"
              style={{ color: "transparent" }}
            />
          </div>
        </Link>
      ) : null}
    </header>
  );
}
