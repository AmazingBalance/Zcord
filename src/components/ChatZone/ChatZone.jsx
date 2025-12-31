"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  useGetChatByTagQuery,
  useGetChannelByTagQuery,
  useGetLSByTagQuery,
  useEnsureLSChatMutation,
  useSendMessageMutation,
} from "@/app/store/chats/chatsSlice";
import { addRemoteParticipant, endCall, startCall } from "@/app/store/call/callSlice";
import { usePathname, useRouter } from "next/navigation";
import { websocketService } from "@/services/websocket";
import { webrtcService } from "@/services/webrtc";

import Message from "./Message/Message";
import Avatar from "@/components/Avatar/Avatar";
import CallButton from "@/components/CallButton/CallButton";
import classNames from "classnames";
import Image from "next/image";

import styles from "./styles.module.css";
import send_button from "@/../public/send_button.svg";

const getUnreadDividerBoundary = (messages = [], unreadCount, lastReadMessageId) => {
  const safeUnreadCount = Number(unreadCount || 0);
  if (!Array.isArray(messages) || messages.length === 0) {
    return { messageId: null, index: null };
  }
  if (!Number.isFinite(safeUnreadCount) || safeUnreadCount <= 0) {
    return { messageId: null, index: null };
  }

  if (lastReadMessageId != null) {
    const lastReadIndex = messages.findIndex(
      (m) => String(m.id) === String(lastReadMessageId)
    );
    if (lastReadIndex >= 0 && lastReadIndex + 1 < messages.length) {
      const nextIndex = lastReadIndex + 1;
      const nextId = messages[nextIndex]?.id;
      return {
        messageId: nextId != null ? String(nextId) : null,
        index: nextIndex,
      };
    }
  }

  const fallbackIndex = Math.min(
    Math.max(messages.length - safeUnreadCount, 0),
    messages.length - 1
  );
  const fallbackId = messages[fallbackIndex]?.id;
  return {
    messageId: fallbackId != null ? String(fallbackId) : null,
    index: fallbackIndex,
  };
};

const scrollToElementWithinContainer = (containerEl, targetEl, offsetPx = 0) => {
  if (!containerEl || !targetEl) return;

  const containerRect = containerEl.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  const rawTop =
    targetRect.top - containerRect.top + containerEl.scrollTop - offsetPx;
  const maxScrollTop = Math.max(
    0,
    containerEl.scrollHeight - containerEl.clientHeight
  );
  const clampedTop = Math.min(Math.max(rawTop, 0), maxScrollTop);

  containerEl.scrollTop = clampedTop;
};

export default function ChatZone({ chat_tag, setShowPopup }) {
  const [messageInput, setMessageInput] = useState("");
  const messagesBlockRef = useRef(null); // Реф для блока с сообщениями
  const lastCallEndTimeRef = useRef(0); // Реф для отслеживания времени последнего завершения звонка
  const [wsConnected, setWsConnected] = useState(false);
  const unreadDividerRef = useRef(null);
  const initialScrollDoneRef = useRef(false);
  const lastScrolledChatKeyRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const prevMessagesLengthRef = useRef(0);
  const pendingReadRef = useRef(null);
  const readDebounceTimerRef = useRef(null);
  const lastSentReadMessageIdRef = useRef(null);
  const maxReadIndexRef = useRef(-1);
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  const [stickyUnreadDivider, setStickyUnreadDivider] = useState({
    chatKey: null,
    firstUnreadMessageId: null,
    firstUnreadIndex: null,
  });

  const user = useSelector((state) => state.user);
  const callState = useSelector((state) => state.call);
  const dispatch = useDispatch();
  const pathname = usePathname();
  const router = useRouter();

  // Хук для отправки сообщений
  const [sendMessage, { isLoading: isSending }] = useSendMessageMutation();
  const [ensureLSChat] = useEnsureLSChatMutation();

  // Определяем тип чата по URL
  const getChatType = () => {
    if (pathname.startsWith("/channel/")) return "channel";
    if (pathname.startsWith("/ls/")) return "ls";
    return "chat";
  };

  const chatType = getChatType();
  const chatKey = `${chatType}:${chat_tag}`;

  // Используем соответствующий хук в зависимости от типа
  const chatQuery = useGetChatByTagQuery(chat_tag, {
    skip: chatType !== "chat",
    refetchOnMountOrArgChange: true,
  });
  const channelQuery = useGetChannelByTagQuery(chat_tag, {
    skip: chatType !== "channel",
    refetchOnMountOrArgChange: true,
  });
  const lsQuery = useGetLSByTagQuery(chat_tag, {
    skip: chatType !== "ls",
    refetchOnMountOrArgChange: true,
  });

  // Выбираем активный запрос
  const activeQuery =
    chatType === "channel"
      ? channelQuery
      : chatType === "ls"
      ? lsQuery
      : chatQuery;
  const { data, error, isLoading, refetch } = activeQuery;
  const messages = data?.messages || [];
  const derivedUnreadDivider = getUnreadDividerBoundary(
    messages,
    data?.unreadCount,
    data?.lastReadMessageId
  );
  const derivedFirstUnreadMessageId = derivedUnreadDivider.messageId;
  const derivedFirstUnreadIndex = derivedUnreadDivider.index;
  const stickyFirstUnreadMessageId =
    stickyUnreadDivider.chatKey === chatKey
      ? stickyUnreadDivider.firstUnreadMessageId
      : null;
  const stickyFirstUnreadIndex =
    stickyUnreadDivider.chatKey === chatKey ? stickyUnreadDivider.firstUnreadIndex : null;
  const stickyHasUnreadDivider =
    stickyUnreadDivider.chatKey === chatKey &&
    (stickyFirstUnreadMessageId != null || stickyFirstUnreadIndex != null);
  const unreadDividerMessageId = stickyHasUnreadDivider
    ? stickyFirstUnreadMessageId
    : derivedFirstUnreadMessageId;
  const unreadDividerPreferredIndex = stickyHasUnreadDivider
    ? stickyFirstUnreadIndex
    : derivedFirstUnreadIndex;

  let unreadDividerIndex = null;
  if (messages.length > 0) {
    if (unreadDividerMessageId != null) {
      const indexById = messages.findIndex(
        (m) => String(m.id) === String(unreadDividerMessageId)
      );
      if (indexById !== -1) unreadDividerIndex = indexById;
    }

    if (
      unreadDividerIndex == null &&
      Number.isFinite(unreadDividerPreferredIndex)
    ) {
      unreadDividerIndex = Math.min(
        Math.max(Math.trunc(unreadDividerPreferredIndex), 0),
        messages.length
      );
    }

    if (
      unreadDividerIndex == null &&
      unreadDividerMessageId != null &&
      Number.isFinite(derivedFirstUnreadIndex)
    ) {
      unreadDividerIndex = Math.min(
        Math.max(Math.trunc(derivedFirstUnreadIndex), 0),
        messages.length
      );
    }
  }

  useEffect(() => {
    setStickyUnreadDivider((prev) => {
      if (prev.chatKey !== chatKey) {
        return {
          chatKey,
          firstUnreadMessageId: derivedFirstUnreadMessageId || null,
          firstUnreadIndex: Number.isFinite(derivedFirstUnreadIndex)
            ? derivedFirstUnreadIndex
            : null,
        };
      }

      const prevHasDivider =
        prev.firstUnreadMessageId != null || Number.isFinite(prev.firstUnreadIndex);
      if (prevHasDivider) return prev;

      const derivedHasDivider =
        derivedFirstUnreadMessageId != null || Number.isFinite(derivedFirstUnreadIndex);
      if (!derivedHasDivider) return prev;

      return {
        chatKey,
        firstUnreadMessageId: derivedFirstUnreadMessageId || null,
        firstUnreadIndex: Number.isFinite(derivedFirstUnreadIndex)
          ? derivedFirstUnreadIndex
          : null,
      };
    });
  }, [chatKey, derivedFirstUnreadMessageId, derivedFirstUnreadIndex]);

  // Инициализация WebSocket соединения
  useEffect(() => {
    const initWebSocket = async () => {
      if (user.token && user.id && !wsConnected) {
        try {
          await websocketService.connect(user.id, user.token);
          setWsConnected(true);
          // console.log("WebSocket connected successfully");
        } catch (error) {
          console.error("Failed to connect WebSocket:", error);
        }
      }
    };

    initWebSocket();

    // Обработчики WebSocket событий
    const handleNewMessage = (message) => {
      // console.log("Received new message:", message);

      // Проверяем chatId в разных местах сообщения
      const messageChatId =
        message.chatId || (message.data && message.data.chatId);

      // console.log("Current chat ID:", data?.id, "Message chat ID:", messageChatId);

      // Обновляем данные чата при получении нового сообщения
      // Приводим оба значения к строке для корректного сравнения
      if (messageChatId && String(messageChatId) === String(data?.id)) {
        // console.log("Refetching chat data due to new message");
        refetch();
      } else {
        // console.log("Message not for current chat, ignoring");
      }
    };

    const handleChatUpdated = (message) => {
      const messageChatId =
        message.chatId || (message.data && message.data.chatId);

      // Virtual LS chat uses id="0". If a real LS chat gets created (first message/call),
      // chat_updated will come with a different chatId, so we need to refetch anyway.
      if (chatType === "ls" && String(data?.id) === "0") {
        refetch();
        return;
      }

      if (messageChatId && String(messageChatId) === String(data?.id)) {
        refetch();
      }
    };

    const handleMessageRead = (message) => {
      const messageChatId =
        message.chatId || (message.data && message.data.chatId);

      if (
        messageChatId &&
        String(messageChatId) === String(data?.id) &&
        String(message.userId) === String(user?.id)
      ) {
        refetch();
      }
    };

    const handleFriendsUpdated = () => {
      // When friendship changes, LS chats can become read-only; refresh current LS state.
      if (chatType === "ls" && data?.id) {
        refetch();
      }
    };

    const handleConnect = () => {
      // console.log("WebSocket connected");
      setWsConnected(true);
      // Подписываемся на чат сразу после подключения
      if (data?.id) {
        // console.log("Subscribing to chat:", data.id);
        websocketService.subscribeToChat(data.id);
      }
    };

    const handleDisconnect = () => {
      // console.log("WebSocket disconnected");
      setWsConnected(false);
    };

    // Подписываемся на события
    websocketService.onMessage("new_message", handleNewMessage);
    websocketService.onMessage("chat_updated", handleChatUpdated);
    websocketService.onMessage("message_read", handleMessageRead);
    websocketService.onMessage("friends_updated", handleFriendsUpdated);
    websocketService.addEventListener("onConnect", handleConnect);
    websocketService.addEventListener("onDisconnect", handleDisconnect);

    // Очистка при размонтировании
    return () => {
      websocketService.offMessage("new_message", handleNewMessage);
      websocketService.offMessage("chat_updated", handleChatUpdated);
      websocketService.offMessage("message_read", handleMessageRead);
      websocketService.offMessage("friends_updated", handleFriendsUpdated);
      websocketService.removeEventListener("onConnect", handleConnect);
      websocketService.removeEventListener("onDisconnect", handleDisconnect);

      if (data?.id) {
        websocketService.unsubscribeFromChat(data.id);
      }
    };
  }, [user.token, user.id, data?.id, refetch, chatType]);

  // Проверяем наличие активного звонка при загрузке чата
  // ВАЖНО: Теперь мы только проверяем наличие звонка, но НЕ присоединяемся к нему автоматически
  useEffect(() => {
    let isMounted = true;

    const checkActiveCall = async () => {
      if (data?.id && wsConnected && !callState.isCallActive) {
        try {
          // console.log("Checking for active call in chat:", data.id);
          const activeCall = await webrtcService.checkActiveCall(data.id);

          // Only proceed if component is still mounted
          if (!isMounted) return;

          // Мы только проверяем наличие активного звонка, но НЕ присоединяемся к нему автоматически
          // Это позволяет обновить состояние кнопки вызова, но не присоединяет пользователя к звонку
          if (activeCall) {
            // console.log("Found active call:", activeCall);
            // console.log("NOT auto-joining call - user must click call button explicitly");

            // Можно обновить состояние кнопки вызова, чтобы показать, что в чате есть активный звонок
            // Но мы НЕ вызываем dispatch(startCall(...)), чтобы не присоединять пользователя автоматически
          }
        } catch (error) {
          console.error("Error checking for active call:", error);
        }
      }
    };

    checkActiveCall();

    // Обновляем lastCallEndTimeRef при завершении звонка
    if (callState.callStatus === "ended" && callState.chatId === data?.id) {
      lastCallEndTimeRef.current = Date.now();
      // console.log("Call ended, updating lastCallEndTimeRef:", lastCallEndTimeRef.current);
    }

    // Cleanup function to prevent state updates after unmount
    return () => {
      isMounted = false;
    };
  }, [
    data?.id,
    wsConnected,
    callState.isCallActive,
    callState.callStatus,
    callState.chatId,
  ]);

  // Отдельный эффект для подписки на чат когда данные загружены и WebSocket подключен
  useEffect(() => {
    if (data?.id && wsConnected) {
      // console.log("Subscribing to chat:", data.id);
      websocketService.subscribeToChat(data.id);

      return () => {
        // console.log("Unsubscribing from chat:", data.id);
        websocketService.unsubscribeFromChat(data.id);
      };
    }
  }, [data?.id, wsConnected]);

  // Обрабатываем перенаправление для недрузей с задержкой
  useEffect(() => {
    if (error && error.status === 403 && error.data?.error === "not_friends") {
      // Добавляем задержку перед перенаправлением, чтобы дать время обновиться информации о дружбе
      const redirectTimer = setTimeout(() => {
        // Делаем повторный запрос для проверки актуального статуса дружбы
        refetch()
          .then((result) => {
            // Если повторный запрос тоже вернул ошибку "not_friends", то перенаправляем
            if (
              result.error &&
              result.error.status === 403 &&
              result.error.data?.error === "not_friends"
            ) {
              router.push(result.error.data.redirect);
            }
            // Если повторный запрос успешен, то ничего не делаем - данные обновятся автоматически
          })
          .catch(() => {
            // В случае ошибки сети или другой проблемы, все равно перенаправляем
            if (
              error &&
              error.status === 403 &&
              error.data?.error === "not_friends"
            ) {
              router.push(error.data.redirect);
            }
          });
      }, 2000); // Задержка 2 секунды

      // Очищаем таймер при размонтировании или изменении зависимостей
      return () => clearTimeout(redirectTimer);
    }
  }, [error, router, refetch]);

  useEffect(() => {
    // Прокручиваем блок сообщений вниз при загрузке или обновлении сообщений
    if (!data?.id || !messagesBlockRef.current) return;

    const messagesLength = data.messages?.length || 0;

    if (lastScrolledChatKeyRef.current !== chatKey) {
      lastScrolledChatKeyRef.current = chatKey;
      initialScrollDoneRef.current = false;
      setInitialScrollDone(false);
      prevMessagesLengthRef.current = messagesLength;
      maxReadIndexRef.current = -1;
      lastSentReadMessageIdRef.current = data.lastReadMessageId || null;
      pendingReadRef.current = null;

      if (readDebounceTimerRef.current) {
        clearTimeout(readDebounceTimerRef.current);
        readDebounceTimerRef.current = null;
      }
    }

    if (!initialScrollDoneRef.current) {
      let rafId = null;
      let cancelled = false;
      let attempts = 0;
      const maxAttempts = 120;

      const tryInitialScroll = () => {
        if (cancelled) return;
        const el = messagesBlockRef.current;
        if (!el) return;

        if (unreadDividerIndex != null && !unreadDividerRef.current) {
          attempts += 1;
          if (attempts < maxAttempts) {
            rafId = requestAnimationFrame(tryInitialScroll);
            return;
          }
        }

        if (unreadDividerIndex != null && unreadDividerRef.current) {
          scrollToElementWithinContainer(el, unreadDividerRef.current, 150);
        } else {
          el.scrollTop = el.scrollHeight;
        }

        isAtBottomRef.current =
          el.scrollHeight - (el.scrollTop + el.clientHeight) < 60;
        initialScrollDoneRef.current = true;
        setInitialScrollDone(true);
      };

      rafId = requestAnimationFrame(tryInitialScroll);

      return () => {
        cancelled = true;
        if (rafId) cancelAnimationFrame(rafId);
      };
    }

    // Auto-scroll only when user is already near the bottom.
    if (messagesLength > prevMessagesLengthRef.current && isAtBottomRef.current) {
      messagesBlockRef.current.scrollTop = messagesBlockRef.current.scrollHeight;
    }
    prevMessagesLengthRef.current = messagesLength;
  }, [data?.id, data?.messages?.length, data?.lastReadMessageId, chatKey, unreadDividerIndex]); // Эффект срабатывает при изменении данных чата

  useEffect(() => {
    const el = messagesBlockRef.current;
    if (!el || !data?.id) return;

    const handleScroll = () => {
      isAtBottomRef.current =
        el.scrollHeight - (el.scrollTop + el.clientHeight) < 60;
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      el.removeEventListener("scroll", handleScroll);
    };
  }, [data?.id]);

  useEffect(() => {
    const el = messagesBlockRef.current;
    if (!el || !data?.id || !wsConnected || !initialScrollDoneRef.current)
      return;

    const messages = data.messages || [];
    if (messages.length === 0) return;

    const lastReadMessageId = data.lastReadMessageId
      ? String(data.lastReadMessageId)
      : null;
    if (lastReadMessageId) {
      const lastReadIndex = messages.findIndex(
        (m) => String(m.id) === lastReadMessageId
      );
      if (lastReadIndex >= 0) {
        maxReadIndexRef.current = Math.max(
          maxReadIndexRef.current,
          lastReadIndex
        );
      }
    }

    const messageElements = Array.from(
      el.querySelectorAll("[data-message-bottom][data-message-index]")
    );
    if (messageElements.length === 0) return;

    const chatId = String(data.id);

    const observer = new IntersectionObserver(
      (entries) => {
        const candidateIndices = [];

        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          const index = Number(entry.target.dataset.messageIndex);
          if (!Number.isFinite(index)) continue;

          candidateIndices.push(index);
        }

        if (candidateIndices.length === 0) return;

        const candidateSet = new Set(candidateIndices);
        let currentMax = maxReadIndexRef.current;
        let nextIndex = currentMax + 1;
        while (candidateSet.has(nextIndex)) {
          currentMax = nextIndex;
          nextIndex += 1;
        }

        if (currentMax === maxReadIndexRef.current) return;

        maxReadIndexRef.current = currentMax;

        const messageId = messages[currentMax]?.id;
        if (!messageId) return;

        pendingReadRef.current = String(messageId);

        if (readDebounceTimerRef.current) {
          clearTimeout(readDebounceTimerRef.current);
        }
        readDebounceTimerRef.current = setTimeout(() => {
          const pendingId = pendingReadRef.current;
          if (!pendingId) return;

          if (
            String(lastSentReadMessageIdRef.current || "") === String(pendingId)
          ) {
            pendingReadRef.current = null;
            return;
          }

          websocketService.markMessagesAsRead(chatId, [pendingId]);
          lastSentReadMessageIdRef.current = pendingId;
          pendingReadRef.current = null;
        }, 250);
      },
      { root: el, threshold: 0 }
    );

    messageElements.forEach((node) => observer.observe(node));

    return () => {
      observer.disconnect();
    };
  }, [
    data?.id,
    wsConnected,
    data?.messages?.length,
    data?.lastReadMessageId,
    initialScrollDone,
  ]);

  const handleChange = (e) => {
    setMessageInput(e.target.value);
  };

  const handleSend = async () => {
    if (data?.canWrite === false) return;
    if (messageInput.trim() === "" || isSending) return;

    const newMessage = {
      userId: user.id.toString(), // ID текущего пользователя как строка
      text: messageInput, // Текст сообщения
      type: "user", // Тип сообщения (например, текстовое сообщение)
    };

    try {
      const sendMessagePayload = {
        chatID: data.id, // идентификатор чата
        chatTag: chat_tag, // тег чата для инвалидации кэша
        message: newMessage, // данные нового сообщения
      };

      // Для LS чатов добавляем информацию о друге
      if (chatType === "ls") {
        sendMessagePayload.friendTag = chat_tag;
      }

      await sendMessage(sendMessagePayload).unwrap();

      setMessageInput(""); // Очищаем поле ввода
      // RTK Query автоматически обновит кэш благодаря invalidatesTags
    } catch (error) {
      console.error("Ошибка при отправке сообщения:", error);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSend();
    }
  };

  const handleStartCall = async () => {
    // Prevent starting a call if we're already in one or if data is not loaded
    if (!data || callState.isCallActive) return;

    // Проверяем, не завершился ли звонок недавно (в течение 5 секунд)
    const now = Date.now();
    const timeSinceLastCallEnd = now - lastCallEndTimeRef.current;
    const recentlyEndedCall = timeSinceLastCallEnd < 5000; // 5 секунд

    // Show some UI feedback that we're processing
    console.log("Initiating call process...");

    // Определяем участников звонка в зависимости от типа чата
    let participants = [];
    if (chatType === "ls") {
      // Для личных сообщений - только другой пользователь (не текущий)
      participants =
        data.users?.filter((u) => u.id.toString() !== user.id.toString()) || [];
    } else {
      // Для групповых чатов и каналов - все пользователи кроме текущего
      participants =
        data.users?.filter((u) => u.id.toString() !== user.id.toString()) || [];
    }

    console.log("Starting call with participants:", participants);
    console.log("Current user ID:", user.id);
    console.log("All users:", data.users);

    // Double-check we're not already in a call (race condition protection)
    if (callState.isCallActive) {
      console.log("Already in a call, not starting another one");
      return;
    }

    let chatIdForCall = data.id;
    if (chatType === "ls" && String(chatIdForCall) === "0") {
      try {
        const ensured = await ensureLSChat({ friendTag: chat_tag }).unwrap();
        chatIdForCall = String(ensured.chatId);
        await refetch();
      } catch (error) {
        console.error("Error ensuring LS chat exists:", error);
        return;
      }
    }

    // Проверяем, есть ли уже активный звонок
    try {
      const activeCall = await webrtcService.checkActiveCall(chatIdForCall, {
        force: true,
      });

      // Double-check again we're not already in a call (race condition protection)
      if (callState.isCallActive) {
        console.log("Already in a call, not starting another one");
        return;
      }

      if (activeCall) {
        console.log("Joining existing call:", activeCall);

        const activeParticipantIds = Array.isArray(activeCall.participants)
          ? activeCall.participants
              .map((p) => String(p?.id ?? p?.userId ?? p))
              .filter((id) => id && id !== String(user.id))
          : null;

        const participantsForCall = activeParticipantIds
          ? data.users?.filter((u) => activeParticipantIds.includes(String(u.id))) ||
            []
          : participants;

        // Присоединяемся к существующему звонку
        dispatch(
          startCall({
            callType: activeCall.callType,
            chatType: activeCall.chatType,
            chatId: chatIdForCall,
            chatTag: chat_tag,
            participants: participantsForCall,
            globalStartTime: activeCall.startTime,
            callId: activeCall.callId,
            isJoiningExistingCall: true,
          })
        );

        if (activeParticipantIds && activeParticipantIds.length > 0) {
          for (const participantId of activeParticipantIds) {
            dispatch(addRemoteParticipant(participantId));
          }
        }
      } else {
        if (recentlyEndedCall) {
          console.log(
            "Call recently ended; creating a new call anyway (explicit user action)"
          );
        }
        console.log("Creating new call");
        // Создаем новый звонок
        dispatch(
          startCall({
            callType: "video",
            chatType: chatType,
            chatId: chatIdForCall,
            chatTag: chat_tag,
            participants: participants,
            isJoiningExistingCall: false,
          })
        );
      }
    } catch (error) {
      // This should not happen anymore since we're resolving with null instead of rejecting
      console.error("Error checking for active call:", error);

      // Double-check again we're not already in a call (race condition protection)
      if (callState.isCallActive) {
        console.log(
          "Already in a call, not starting another one despite error"
        );
        return;
      }

      // В случае ошибки просто создаем новый звонок
      console.log("Creating new call after error");
      dispatch(
        startCall({
          callType: "video",
          chatType: chatType,
          chatId: chatIdForCall,
          chatTag: chat_tag,
          participants: participants,
        })
      );
    }
  };

  const handleCallButtonClick = async () => {
    if (!data) return;

    if (callState.isCallActive) {
      try {
        if (callState.chatId) webrtcService.leaveCall(callState.chatId);
      } finally {
        lastCallEndTimeRef.current = Date.now();
        dispatch(endCall());
      }
      return;
    }

    await handleStartCall();
  };

  if (isLoading) {
    return <h1>Loading...</h1>;
  }

  if (error) {
    return <h1>Error</h1>;
  }

  // Добавляем проверку на существование данных
  if (!data) {
    return <h1>Loading...</h1>;
  }

  const isReadOnlyChat = data?.canWrite === false;
  const canStartCallHere = chatType !== "channel" && data.tag !== "news";
  const showCallButton = canStartCallHere || callState.isCallActive;

  return (
    <div className={styles.ChatZone}>
      <header className={styles.ChatZone_Header}>
        <div
          className={styles.ChatZone_Header_Info}
          onClick={() => setShowPopup(true)}
        >
          <Avatar
            src={data.imageSrc}
            name={data.name}
            size={50}
            className={styles.ChatZone_Header_ChatLogo}
          />
          <h2 className={styles.ChatZone_Header_ChatTitle}>{data.name}</h2>
        </div>
        {showCallButton && (
          <CallButton
            onClick={handleCallButtonClick}
            isActive={callState.isCallActive}
            disabled={false}
          />
        )}
      </header>
      <div id="zcord-call-dock" className={styles.ChatZone_CallDock} />
      <div
        className={styles.ChatZone_MessagesBlock}
        ref={messagesBlockRef} // Привязываем реф к блоку с сообщениями
      >
        {messages.map((message, index) => (
          <React.Fragment key={message.id}>
            {unreadDividerIndex === index && (
              <div ref={unreadDividerRef} className={styles.UnreadDivider}>
                Непрочитанные сообщения
              </div>
            )}
            <div
              className={styles.ChatZone_MessageWrapper}
              data-message-id={message.id}
              data-message-index={index}
            >
                <Message
                  type={message.type}
                  userName={
                    ((data.tag === "news" && !message.userId)
                      ? "Новости Zcord"
                    : data.users?.find(
                        (chatUser) =>
                          String(chatUser.id) === String(message.userId)
                      )
                        ?.name) ??
                    "Удалённый пользователь"
                  }
                  userAvatar={
                  data.users?.find(
                    (chatUser) => String(chatUser.id) === String(message.userId)
                  )?.imageSrc ?? null
                  }
                  imageSrc={message.imageSrc}
                  text={message.text}
                  active={String(user.id) === String(message.userId)}
                />
              <div
                className={styles.ChatZone_MessageBottomSentinel}
                data-message-bottom="true"
                data-message-id={message.id}
                data-message-index={index}
              />
            </div>
          </React.Fragment>
        ))}
        {unreadDividerIndex === messages.length && (
          <div ref={unreadDividerRef} className={styles.UnreadDivider}>
            Непрочитанные сообщения
          </div>
        )}
      </div>
      {!isReadOnlyChat && (
        <div className={styles.MessagesInputContainer}>
        <input
          type="text"
          placeholder="Сообщение..."
          className={styles.MessagesInput}
          value={messageInput}
          onChange={handleChange}
          onKeyDown={handleKeyDown} // Обработчик Enter
        />
        <div
          className={classNames(
            styles.SendButton,
            messageInput.trim() !== "" ? styles.SendButtonActive : ""
          )}
          onClick={handleSend}
          disabled={messageInput.trim() === "" || isSending}
        >
          <Image alt="Отправить" src={send_button} />
        </div>
        </div>
      )}
    </div>
  );
}
