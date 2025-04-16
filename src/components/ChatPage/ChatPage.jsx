"use client";

import Image from "next/image";
import styles from "./styles.module.css";

import MenuBar from "@/components/MenuBar/MenuBar";
import ChatList from "@/components/ChatList/ChatList";

import ChatZone from "@/components/ChatZone/ChatZone";

import Popup from "@/components/Popup/Popup";
import ChatUsersList from "@/components/ChatUsersList/ChatUsersList";

import { useState, useRef } from "react";

export default function ChatPage({ chat_tag }) {
    const [showPopup, setShowPopup] = useState(false);
    const popupRef = useRef(null);

    return (
        <div className={styles.chat}>
            <Popup
                showed={showPopup}
                setShowed={setShowPopup}
                popupRef={popupRef}
            >
                <ChatUsersList chat_tag={chat_tag} type="chat" ref={popupRef} />
            </Popup>
            <MenuBar is_friends_visible={true} />
            <main className={styles.chatMain}>
                <ChatList active_chat_tag={chat_tag} />
                <ChatZone chat_tag={chat_tag} setShowPopup={setShowPopup} />
            </main>
        </div>
    );
}
