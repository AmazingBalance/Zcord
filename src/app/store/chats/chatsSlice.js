import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { apiUrl } from "@/services/apiConfig";

export const chatsApi = createApi({
  reducerPath: "chatsApi",
  baseQuery: fetchBaseQuery({
    baseUrl: apiUrl("/"),
    prepareHeaders: (headers) => {
      // Устанавливаем Content-Type
      headers.set("Content-Type", "application/json");

      // Получаем токен из localStorage и добавляем его в заголовок Authorization
      const token = localStorage.getItem("token");
      if (token) {
        headers.set("Authorization", `Bearer ${token}`); // Добавляем токен с префиксом Bearer
      }

      return headers;
    },
  }),
  tagTypes: ["Chat", "Channel", "LS", "UserChats"],
  endpoints: (builder) => ({
    // Запрос для получения чата по тегу
    getChatByTag: builder.query({
      query: (tag) => `chat?tag=${tag}`, // Параметр tag передаётся в URL
      providesTags: (result, error, tag) => [{ type: "Chat", id: tag }],
    }),

    // Запрос для получения канала по тегу
    getChannelByTag: builder.query({
      query: (tag) => `channel?tag=${tag}`, // Параметр tag передаётся в URL
      providesTags: (result, error, tag) => [{ type: "Channel", id: tag }],
    }),

    // Запрос для получения LS чата по тегу
    getLSByTag: builder.query({
      query: (tag) => `ls?tag=${tag}`, // Параметр tag передаётся в URL
      providesTags: (result, error, tag) => [{ type: "LS", id: tag }],
      transformErrorResponse: (response, meta, arg) => {
        // Обрабатываем специальную ошибку для недрузей
        if (response.status === 403 && response.data?.error === "not_friends") {
          return {
            status: 403,
            data: response.data,
            redirect: response.data.redirect,
          };
        }
        return response;
      },
    }),

    // Запрос для получения чатов пользователя
    getUserChats: builder.query({
      query: () => `chats`, // Получаем список чатов
      providesTags: ["UserChats"],
    }),

    // Мутация для отправки сообщения
    sendMessage: builder.mutation({
      query: ({ chatID, message, friendTag }) => {
        const requestConfig = {
          url: "api/send",
          method: "POST",
          body: { chatID, message },
        };

        // Для LS чатов добавляем заголовок с тегом друга
        if (friendTag) {
          requestConfig.headers = {
            "X-Friend-Tag": friendTag,
          };
        }

        return requestConfig;
      },
      invalidatesTags: (result, error, { chatID, chatTag }) => [
        "UserChats", // Обновляем список чатов
        { type: "Chat", id: chatTag }, // Обновляем конкретный чат
        { type: "Channel", id: chatTag }, // Обновляем конкретный канал
        { type: "LS", id: chatTag }, // Обновляем конкретный LS
      ],
    }),

    ensureLSChat: builder.mutation({
      query: ({ friendTag }) => ({
        url: "api/ls/ensure",
        method: "POST",
        body: { friendTag },
      }),
      invalidatesTags: (result, error, { friendTag }) => [
        "UserChats",
        { type: "LS", id: friendTag },
      ],
    }),
  }),
});

// Экспортируем хук для использования в компонентах
export const {
  useGetChatByTagQuery,
  useGetChannelByTagQuery,
  useGetLSByTagQuery,
  useGetUserChatsQuery,
  useSendMessageMutation,
  useEnsureLSChatMutation,
} = chatsApi;
