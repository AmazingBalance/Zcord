import { createSlice } from "@reduxjs/toolkit";
import { chatsApi } from "../chats/chatsSlice";

const initialState = {
  id: null,
  name: null,
  email: null,
  phone: null,
  tag: null,
  imageSrc: null,
  description: null,
  token: null,
  isAuthenticated: false,
  friends_list: [],
  friends_list_out: [],
  friends_list_in: [],
  friendsAcceptedNotification: false,
  friendsRemovedNotification: false,
};

export const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    setUser(state, action) {
      state.id = action.payload.id;
      state.name = action.payload.name;
      state.email = action.payload.email;
      state.phone = action.payload.phone;
      state.tag = action.payload.tag;
      state.imageSrc = action.payload.imageSrc;
      state.description = action.payload.description;
      state.token = action.payload.token;
      state.isAuthenticated = true;
      state.friends_list = action.payload.friends_list;
      state.friends_list_out = action.payload.friends_list_out;
      state.friends_list_in = action.payload.friends_list_in;
      state.friendsAcceptedNotification = false;
      state.friendsRemovedNotification = false;
    },
    clearUser(state) {
      state.id = null;
      state.name = null;
      state.email = null;
      state.phone = null;
      state.tag = null;
      state.imageSrc = null;
      state.description = null;
      state.token = null;
      state.isAuthenticated = false;
      state.friends_list = [];
      state.friends_list_out = [];
      state.friends_list_in = [];
      state.friendsAcceptedNotification = false;
      state.friendsRemovedNotification = false;
    },
    addFriend(state, action) {
      state.friends_list_out.push(action.payload); // Добавляем друга в исходящий список
    },
    acceptFriendRequest(state, action) {
      state.friends_list.push(action.payload); // Добавляем друга в окончательный список
      state.friends_list_in = state.friends_list_in.filter(
        (friend) => friend.id !== action.payload.id
      ); // Удаляем из входящих запросов
    },
    rejectFriendRequest(state, action) {
      state.friends_list_in = state.friends_list_in.filter(
        (friend) => friend.id !== action.payload
      ); // Удаляем из входящих запросов
    },
    cancelFriendRequest(state, action) {
      state.friends_list_out = state.friends_list_out.filter(
        (friend) => friend.tag !== action.payload
      ); // Удаляем из исходящих запросов
    },
    removeFriend(state, action) {
      state.friends_list = state.friends_list.filter(
        (friend) => friend.tag !== action.payload
      ); // Удаляем друга
    },
    clearFriendsAcceptedNotification(state) {
      state.friendsAcceptedNotification = false;
    },
    clearFriendsRemovedNotification(state) {
      state.friendsRemovedNotification = false;
    },
    clearFriendsNotifications(state) {
      state.friendsAcceptedNotification = false;
      state.friendsRemovedNotification = false;
    },
    updateUser(state, action) {
      const prevFriends = state.friends_list || [];
      const prevFriendsOut = state.friends_list_out || [];

      const nextFriends = action.payload.friends_list ?? prevFriends;
      const prevFriendIds = new Set(prevFriends.map((f) => String(f.id)));
      const prevOutIds = new Set(prevFriendsOut.map((f) => String(f.id)));
      const nextFriendIds = new Set(nextFriends.map((f) => String(f.id)));

      let acceptedFromOutgoing = false;
      for (const friendId of nextFriendIds) {
        if (!prevFriendIds.has(friendId) && prevOutIds.has(friendId)) {
          acceptedFromOutgoing = true;
          break;
        }
      }

      // Обновляем данные пользователя
      let removedFriend = false;
      for (const friendId of prevFriendIds) {
        if (!nextFriendIds.has(friendId)) {
          removedFriend = true;
          break;
        }
      }

      Object.keys(action.payload).forEach((key) => {
        if (state.hasOwnProperty(key)) {
          state[key] = action.payload[key];
        }
      });

      // Если кто-то принял нашу исходящую заявку в друзья — показываем точку-уведомление.
      if (acceptedFromOutgoing) {
        state.friendsAcceptedNotification = true;
      }
      if (removedFriend) {
        state.friendsRemovedNotification = true;
      }
    },
  },
  extraReducers: (builder) => {
    // Автоматически очищаем кэш чатов при очистке пользователя
    builder.addCase(userSlice.actions.clearUser, (state, action) => {
      // Основная логика clearUser уже выполнена в reducers
      // Здесь мы можем добавить дополнительную логику если нужно
    });
  },
});

// Создаем thunk для полной очистки данных при выходе
export const logoutUser = () => (dispatch) => {
  // Очищаем данные пользователя
  dispatch(clearUser());
  // Очищаем кэш чатов RTK Query
  dispatch(chatsApi.util.resetApiState());
  // Удаляем токен из localStorage
  localStorage.removeItem("token");
};

export const {
  setUser,
  clearUser,
  addFriend,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  removeFriend,
  clearFriendsAcceptedNotification,
  clearFriendsRemovedNotification,
  clearFriendsNotifications,
  updateUser,
} = userSlice.actions;

export default userSlice.reducer;
