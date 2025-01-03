import Image from "next/image";
import styles from "./page.module.css";

import MenuBar from "@/components/MenuBar/MenuBar";
import ChatList from "@/components/ChatList/ChatList";
import InfoZone from "@/components/InfoZone/InfoZone";

export default function Home() {
    return (
        <div className={styles.home}>
            <MenuBar />
            <main className={styles.homeMain}>
                <ChatList />
                <InfoZone />
            </main>
        </div>
    );
}
