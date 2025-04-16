"use client";
import styles from "./page.module.css";

import MenuBar from "@/components/MenuBar/MenuBar";
import ChatCreationZone from "@/components/ChatCreationZone/ChatCreationZone";

export default function NewChat() {
    return (
        <>
            <MenuBar />
            <div className={styles.NewChat}>
                <ChatCreationZone type="chat" />
            </div>
        </>
    );
}
