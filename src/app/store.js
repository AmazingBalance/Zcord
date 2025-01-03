import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { chatsApi } from "./store/chats/chatsSlice";
import newsReducer from "./store/news/newsSlice";
//import chatsReducer from "./store/chats/chatsSlice";
//import activeChatReducer from "./store/activeChat/activeChatSlice";
import userResucer from "./store/user/user";

export const store = configureStore({
    reducer: {
        news: newsReducer,
        [chatsApi.reducerPath]: chatsApi.reducer,
        //chats: chatsReducer,
        //active_chat: activeChatReducer,
        user: userResucer,
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(chatsApi.middleware),
});

setupListeners(store.dispatch);
