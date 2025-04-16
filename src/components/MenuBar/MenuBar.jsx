"use client";

import styles from "./styles.module.css";
import GamburgerMenu from "./GabmurgerMenu/GamburgerMenu";

import Image from "next/image";
import Link from "next/link";

import { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { clearUser } from "@/app/store/user/user";

import contacts from "@/../public/friends.svg";

export default function MenuBar({ is_friends_visible }) {
    const [showMenu, setShowMenu] = useState(false);
    const user = useSelector((state) => state.user);
    const dispatch = useDispatch();

    return (
        <header className={styles.MenuBar}>
            <GamburgerMenu
                showMenu={showMenu}
                setShowMenu={setShowMenu}
                userName={user.name}
                userTag={user.tag}
                userAvatar={user.imageSrc}
                onLogout={() => dispatch(clearUser())}
            />
            {is_friends_visible ? (
                <Link href="/friends">
                    <div className={styles.MenuBar_Friends}>
                        <Image
                            alt="Друзья"
                            src={contacts}
                            width={30}
                            height={30}
                        />
                    </div>
                </Link>
            ) : (
                <></>
            )}
        </header>
    );
}
