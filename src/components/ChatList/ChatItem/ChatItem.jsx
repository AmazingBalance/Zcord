import styles from "./styles.module.css";

import Link from "next/link";
import Avatar from "@/components/Avatar/Avatar";

import classNames from "classnames";

export default function ChatItem({
  chat_tag,
  name,
  imageSrc,
  lastMessage,
  lastUserName,
  active,
  type,
  friendTag, // For LS chats
  unreadCount = 0,
}) {
  const getHref = () => {
    if (chat_tag === "news") return "/channel/news";

    switch (type) {
      case "ls":
        return "/ls/" + (friendTag || chat_tag);
      case "channel":
        return "/channel/" + chat_tag;
      case "chat":
      default:
        return "/chat/" + chat_tag;
    }
  };

  return (
    <Link href={getHref()}>
      <div
        className={classNames(
          styles.ChatItem,
          active ? styles.activeChatItem : ""
        )}
      >
        <Avatar
          src={imageSrc}
          name={name}
          size={55}
          className={styles.ChatItem_Image}
        />
        <div className={styles.ChatItem_TextZone}>
          <h3 className={styles.ChatItem_TextZone_ChatName}>{name}</h3>
          {lastMessage && lastUserName ? (
            <>
              <p className={styles.ChatItem_TextZone_LastMessage}>
                <span className={styles.ChatItem_TextZone_LastUserName}>
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
        {unreadCount > 0 && (
          <div className={styles.ChatItem_UnreadBadge}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </div>
        )}
      </div>
    </Link>
  );
}
