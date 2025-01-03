import { createSlice } from "@reduxjs/toolkit";

const initialState = {
    id: null,
    name: null,
    tag: null,
    imageSrc: null,
    description: null,
    token: null, // Добавляем токен
    isAuthenticated: false,
};

export const userSlice = createSlice({
    name: "user",
    initialState,
    reducers: {
        setUser(state, action) {
            state.id = action.payload.id;
            state.name = action.payload.name;
            state.tag = action.payload.tag;
            state.imageSrc = action.payload.imageSrc;
            state.description = action.payload.description;
            state.token = action.payload.token; // Сохраняем токен
            state.isAuthenticated = true;
        },
        clearUser(state) {
            state.id = null;
            state.name = null;
            state.tag = null;
            state.imageSrc = null;
            state.description = null;
            state.token = null; // Удаляем токен
            state.isAuthenticated = false;
        },
    },
});

export const { setUser, clearUser } = userSlice.actions;

export default userSlice.reducer;
