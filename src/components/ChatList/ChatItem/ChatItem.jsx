import styles from "./styles.module.css";

import Image from "next/image";
import Link from "next/link";

import classNames from "classnames";

export default function ChatItem({
    chat_tag,
    name,
    imageSrc,
    lastMessage,
    lastUserName,
    active,
    type,
}) {
    return (
        <Link href={(type === "ls" ? "/ls/" : "/chat/") + chat_tag}>
            <div
                className={classNames(
                    styles.ChatItem,
                    active ? styles.activeChatItem : ""
                )}
            >
                <Image
                    alt=""
                    width={55}
                    height={55}
                    src={imageSrc}
                    className={styles.ChatItem_Image}
                />
                <div className={styles.ChatItem_TextZone}>
                    <h3 className={styles.ChatItem_TextZone_ChatName}>
                        {name}
                    </h3>
                    {lastMessage && lastUserName ? (
                        <>
                            <p className={styles.ChatItem_TextZone_LastMessage}>
                                <span
                                    className={
                                        styles.ChatItem_TextZone_LastUserName
                                    }
                                >
                                    {lastUserName}:{" "}
                                </span>
                                {lastMessage}
                            </p>
                        </>
                    ) : (
                        <p
                            className={styles.ChatItem_TextZone_LastMessage}
                            style={{ color: "lightblue" }}
                        >
                            {lastMessage === "" ? "Нет сообщений" : lastMessage}
                        </p>
                    )}
                </div>
            </div>
        </Link>
    );
}
