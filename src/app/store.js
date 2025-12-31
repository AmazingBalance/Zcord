import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { chatsApi } from "./store/chats/chatsSlice";
import newsReducer from "./store/news/newsSlice";
//import chatsReducer from "./store/chats/chatsSlice";
//import activeChatReducer from "./store/activeChat/activeChatSlice";
import userResucer from "./store/user/user";
import registrationReducer from "./store/registration/registrationSlice";
import callReducer from "./store/call/callSlice";

export const store = configureStore({
  reducer: {
    news: newsReducer,
    [chatsApi.reducerPath]: chatsApi.reducer,
    //chats: chatsReducer,
    //active_chat: activeChatReducer,
    user: userResucer,
    registration: registrationReducer,
    call: callReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ["call/setLocalStream", "call/addRemoteStream"],
        ignoredPaths: ["call.localStream", "call.remoteStreams"],
      },
    }).concat(chatsApi.middleware),
});

setupListeners(store.dispatch);
