import { createSlice } from "@reduxjs/toolkit";

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
        removeFriend(state, action) {
            state.friends_list = state.friends_list.filter(
                (friend) => friend.tag !== action.payload
            ); // Удаляем друга
        },
    },
});

export const {
    setUser,
    clearUser,
    addFriend,
    acceptFriendRequest,
    removeFriend,
} = userSlice.actions;

export default userSlice.reducer;
