import Image from "next/image";
import styles from "./page.module.css";

import MenuBar from "@/components/MenuBar/MenuBar";
import ChatList from "@/components/ChatList/ChatList";

import ChatZone from "@/components/ChatZone/ChatZone";

export default async function Chat({ params }) {
    const chat_tag = (await params).chat_tag;
    return (
        <div className={styles.chat}>
            <MenuBar />
            <main className={styles.chatMain}>
                <ChatList active_chat_tag={chat_tag} />
                <ChatZone chat_tag={chat_tag} />
            </main>
        </div>
    );
}
