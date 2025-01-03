"use client";
import React from "react";
import styles from "./styles.module.css";
import ChatItem from "./ChatItem/ChatItem";

import { useSelector, useDispatch } from "react-redux";
import { useEffect } from "react";
import { useGetUserChatsQuery } from "@/app/store/chats/chatsSlice";

export default function ChatList({ active_chat_tag }) {
    let { data, error, isLoading } = useGetUserChatsQuery();

    if (isLoading) {
        return <h1>Loading...</h1>;
    }

    if (error) {
        return <h1>Error</h1>;
    }

    return (
        <nav className={styles.ChatList}>
            {data?.map((chat) => (
                <ChatItem
                    active={chat.tag === active_chat_tag}
                    chat_tag={chat.tag}
                    key={chat.id}
                    name={chat.name}
                    imageSrc={chat.imageSrc}
                    lastUserName={chat.lastUserName}
                    lastMessage={chat.lastMessage}
                />
            )) ?? <p>Error</p>}
        </nav>
    );
}
