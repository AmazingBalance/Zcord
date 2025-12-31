"use client";

import Image from "next/image";
import styles from "./styles.module.css";

import MenuBar from "@/components/MenuBar/MenuBar";
import ChatList from "@/components/ChatList/ChatList";

import ChatZone from "@/components/ChatZone/ChatZone";
import VideoCall from "@/components/VideoCall/VideoCall";

import Popup from "@/components/Popup/Popup";
import ChatUsersList from "@/components/ChatUsersList/ChatUsersList";

import { useState, useRef } from "react";
import { usePathname } from "next/navigation";

export default function ChatPage({ chat_tag }) {
  const [showPopup, setShowPopup] = useState(false);
  const popupRef = useRef(null);
  const pathname = usePathname();

  // Определяем тип чата по URL
  const getChatType = () => {
    if (pathname.startsWith("/channel/")) return "channel";
    if (pathname.startsWith("/ls/")) return "ls";
    return "chat";
  };

  const chatType = getChatType();

  return (
    <div className={styles.chat}>
      <Popup showed={showPopup} setShowed={setShowPopup} popupRef={popupRef}>
        <ChatUsersList chat_tag={chat_tag} type={chatType} ref={popupRef} />
      </Popup>
      <MenuBar is_friends_visible={true} />
      <main className={styles.chatMain}>
        <ChatList active_chat_tag={chat_tag} />
        <ChatZone chat_tag={chat_tag} setShowPopup={setShowPopup} />
      </main>
      <VideoCall />
    </div>
  );
}
