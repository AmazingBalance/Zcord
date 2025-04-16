import Image from "next/image";
import styles from "./page.module.css";

import ChatPage from "@/components/ChatPage/ChatPage";

export default async function Chat({ params }) {
    const chat_tag = (await params).chat_tag;

    return <ChatPage chat_tag={chat_tag} />;
}
