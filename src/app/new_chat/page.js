"use client";
import styles from "./page.module.css";

import MenuBar from "@/components/MenuBar/MenuBar";

export default function NewChat() {
    return (
        <>
            <MenuBar />
            <div className={styles.NewChat}></div>
        </>
    );
}
