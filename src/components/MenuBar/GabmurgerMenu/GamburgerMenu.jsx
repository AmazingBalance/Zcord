"use client";

import styles from "./styles.module.css";
import classNames from "classnames";

import Image from "next/image";
import Link from "next/link";

import { useEffect, useRef } from "react";

import MenuSector from "./MenuSector/MenuSector";
import settings_icon from "@/../public/settings_icon.svg";
import chat_icon from "@/../public/chat_icon.svg";
import channel_icon from "@/../public/channel_icon.svg";
import news_icon from "@/../public/news_icon.svg";
import exit_icon from "@/../public/exit.svg";

export default function GamburgerMenu({
  showMenu,
  setShowMenu,
  userName,
  userTag,
  userAvatar,
  onLogout,
}) {
  const ref = useRef();
  useEffect(() => {
    const checkIfClickedOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("click", checkIfClickedOutside);
    return () => {
      document.removeEventListener("click", checkIfClickedOutside);
    };
  }, [showMenu]);

  return (
    <div className={styles.GamburgerMenuContainer}>
      <div
        className={classNames(
          styles.GamburgerMenu,
          showMenu ? styles.GamburgerMenuShown : ""
        )}
        onClick={() => setShowMenu(!showMenu)}
      >
        <div />
        <div />
        <div />
      </div>
      <div className={styles.GamburgerMenu_MenuList} ref={ref}>
        <Link href="/settings">
          <div className={styles.Menu_ProfileItem}>
            <div className={styles.Menu_ProfileItem_InfoBlock}>
              {userAvatar ? (
                <Image
                  src={userAvatar}
                  alt="Аватарка"
                  width={50}
                  height={50}
                  className={styles.Menu_ProfileItem_Avatar}
                />
              ) : (
                <div
                  className={styles.Menu_ProfileItem_Avatar}
                  style={{
                    width: "50px",
                    height: "50px",
                    borderRadius: "50%",
                    backgroundColor: "#6c757d",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontSize: "18px",
                    fontWeight: "bold",
                  }}
                >
                  {userName ? userName.charAt(0).toUpperCase() : "?"}
                </div>
              )}
              <div>
                <h3>{userName}</h3>
                <p>{userTag}</p>
              </div>
            </div>
            <div className={styles.Menu_ProfileItem_DecorationArrow}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="30"
                height="30"
                viewBox="0 0 100 100"
              >
                <line
                  x1="10"
                  y1="50"
                  x2="50"
                  y2="50"
                  stroke="lightgrey"
                  strokeWidth="8"
                />
                <line
                  x1="50"
                  y1="50"
                  x2="50"
                  y2="10"
                  stroke="lightgrey"
                  strokeWidth="8"
                />
              </svg>
            </div>
          </div>
        </Link>
        <MenuSector
          text="Настройки"
          imageSrc={settings_icon}
          linkHref={"/settings"}
        />
        <MenuSector
          text="Создать чат"
          imageSrc={chat_icon}
          linkHref={"/new_chat"}
        />
        <MenuSector
          text="Создать канал"
          imageSrc={channel_icon}
          linkHref={"/new_channel"}
        />
        <MenuSector
          text="Новости"
          imageSrc={news_icon}
          linkHref={"/channel/news"}
        />
        <MenuSector
          text="Выход"
          imageSrc={exit_icon}
          type="function"
          imageReverse={true}
          linkHref={"/"}
          handleClick={() => {
            onLogout();
          }}
        />
      </div>
    </div>
  );
}
