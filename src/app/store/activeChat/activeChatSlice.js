import { createSlice } from "@reduxjs/toolkit";
import { PayloadAction } from "@reduxjs/toolkit";

const initialState = {
    id: "22",
    name: "ZМЕЯ",
    imageSrc:
        "https://i.postimg.cc/tJZbxpZ9/K20-Ag-N-m-X4-NJMhy-ARV8j-WRCh0e-X5i-CF99beh8z3-Wev-GR6en-QNFYq-UOhg3-YLMPzr-Uv7g-H744-Q0n-Y2f6-TKvo-M7r-Qei-Wy5n-I6-R60-JTE.jpg",
    description: `хихихи`,
    messages: [
        {
            id: "1",
            text: `Чат "ZМЕЯ" создан`,
            type: "system",
            userId: null,
            imageSrc: null,
        },
        {
            id: "2",
            text: `Хихихи, мы клещи`,
            type: "user",
            userId: "123",
            imageSrc: null,
        },
        {
            id: "3",
            text: `Нет, мы кровавые жуки`,
            type: "user",
            userId: "3",
            imageSrc: null,
        },
        {
            id: "4",
            text: `ВПЕРЁД ZМЕЯ, ZОВ`,
            type: "user",
            userId: "22",
            imageSrc:
                "https://i.postimg.cc/jd9V6CBb/photo-2024-12-12-12-28-24.jpg",
        },
        {
            id: "5",
            text: `чёт херня какая-то, вы вообще все lame, я не буду ходить с вами на рыбалку, вы вообще похожи на какую-то секту`,
            type: "user",
            userId: "404",
            imageSrc: null,
        },
        {
            id: "6",
            text: `Ошибка новичка`,
            type: "user",
            userId: "3",
            imageSrc: "https://i.postimg.cc/HL1Y26D1/Oh3i-B41-HH4g.jpg",
        },
    ],
    users: [
        {
            id: "123",
            name: "А.Л.Е.К.С.И.Й",
            imageSrc: null,
            tag: "ardanirem",
            description: "Маслянные жуки носят головные маски",
        },
        {
            id: "3",
            name: "Никитин Дмитрий",
            tag: "NikDimer",
            imageSrc:
                "https://i.postimg.cc/DmknfZrL/photo-2024-09-02-22-43-16.jpg",
            description:
                "Не тот герой, кто герой, а тот злодей, кто злодей. АУФ.",
        },
        {
            id: "22",
            name: "Савва",
            imageSrc: null,
            tag: "tralka22",
            description: "цацулаоашцшщаокшуцщоац",
        },
        {
            id: "8",
            name: "Тимофей Равнушкин",
            imageSrc:
                "https://i.postimg.cc/zByyVygc/photo-2023-12-31-17-29-19.jpg",
            tag: "kitlix",
            description: "i may look normal but i meow back to cats",
        },
        {
            id: "666",
            name: "Калитка",
            imageSrc: null,
            tag: "scrip",
            description: "Скрип скрип скрип",
        },
    ],
};

export const activeChatSlice = createSlice({
    name: "active_chat",
    initialState,
    reducers: {},
});

export const {} = activeChatSlice.actions;

export default activeChatSlice.reducer;
