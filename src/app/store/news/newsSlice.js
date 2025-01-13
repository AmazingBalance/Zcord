import { createSlice } from "@reduxjs/toolkit";
import { PayloadAction } from "@reduxjs/toolkit";

const initialState = {
    value: [
        {
            id: 1,
            version: "v1.0",
            title: "Мы открылись",
            imageSrc:
                "https://i.postimg.cc/DzLfkYFQ/2017-Nature-Beautiful-clouds-reflected-in-the-blue-water-of-the-ocean-115872.jpg",
            text: `Всем привет! Это самая первая версия приложения, всё сырое, но сообщения писать можно и я считаю это круто.
            
            Проект находится в тестовом состоянии, постепенно буду пилить новые фичи и выкладывать новости о них сюда, многое предстоит сделать до первого релиза.
            
            С прошедшим Новым Годом, ещё увидимся :)`,
        },
    ],
};

export const newsSlice = createSlice({
    name: "news",
    initialState,
    reducers: {},
});

export const {} = newsSlice.actions;

export default newsSlice.reducer;
