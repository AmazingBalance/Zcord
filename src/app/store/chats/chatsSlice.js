import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export const chatsApi = createApi({
    reducerPath: "chatsApi",
    baseQuery: fetchBaseQuery({
        baseUrl: "http://localhost:8000/", // Базовый URL для запросов
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
    endpoints: (builder) => ({
        // Запрос для получения чата по тегу
        getChatByTag: builder.query({
            query: (tag) => `chat?tag=${tag}`, // Параметр tag передаётся в URL
        }),

        // Запрос для получения чатов пользователя
        getUserChats: builder.query({
            query: () => `chats`, // Получаем список чатов
        }),
    }),
});

// Экспортируем хук для использования в компонентах
export const { useGetChatByTagQuery, useGetUserChatsQuery } = chatsApi;
