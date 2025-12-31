"use client";

import { useRef, useState } from "react";
import { usePathname } from "next/navigation";

import Popup from "@/components/Popup/Popup";
import ChatUsersList from "@/components/ChatUsersList/ChatUsersList";
import ChatZone from "@/components/ChatZone/ChatZone";

export default function ChatRouteContent({ chat_tag }) {
  const [showPopup, setShowPopup] = useState(false);
  const popupRef = useRef(null);
  const pathname = usePathname();

  const getChatType = () => {
    if (pathname.startsWith("/channel/")) return "channel";
    if (pathname.startsWith("/ls/")) return "ls";
    return "chat";
  };

  const chatType = getChatType();

  return (
    <>
      <Popup showed={showPopup} setShowed={setShowPopup} popupRef={popupRef}>
        <ChatUsersList chat_tag={chat_tag} type={chatType} ref={popupRef} />
      </Popup>
      <ChatZone chat_tag={chat_tag} setShowPopup={setShowPopup} />
    </>
  );
}

