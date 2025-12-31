"use client";

import { useParams } from "next/navigation";

import styles from "@/components/ChatPage/styles.module.css";
import MenuBar from "@/components/MenuBar/MenuBar";
import ChatList from "@/components/ChatList/ChatList";
import VideoCall from "@/components/VideoCall/VideoCall";

export default function ChatsLayout({ children }) {
  const params = useParams();
  const activeChatTag = params?.chat_tag;

  return (
    <div className={styles.chat}>
      <MenuBar is_friends_visible={true} />
      <main className={styles.chatMain}>
        <ChatList active_chat_tag={activeChatTag} />
        {children}
      </main>
      <VideoCall />
    </div>
  );
}

