import Image from "next/image";
import styles from "./page.module.css";

import MenuBar from "@/components/MenuBar/MenuBar";
import ChatList from "@/components/ChatList/ChatList";

import ChatZone from "@/components/ChatZone/ChatZone";

export default async function Chat() {
    return (
        <div className={styles.chat}>
            <MenuBar is_friends_visible={true} />
            <main className={styles.chatMain}>
                <ChatList />
            </main>
        </div>
    );
}
